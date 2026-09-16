import { randomBytes } from 'node:crypto';
import { sql } from 'kysely';
import { db } from '../db/index.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { CashfreeError, cashfreeConfigured, cashfreeMode, createOrder, getOrder, getPayments } from '../lib/cashfree.js';
import { sendRegistrationReceived } from '../lib/mail.js';
import { ROLE, type SessionUser } from '../middleware/auth.js';
import { STATUS, TRANSACTION_TYPE } from './commission.service.js';
import {
  assertNotRegistered,
  courseForRegistration,
  insertRegistration,
  readRegistration,
  recordCourseFee,
  type RegistrationDetails,
} from './registration.service.js';

/**
 * Money taken online, through Cashfree.
 *
 *   start      an order row, then a Cashfree order; the payer's browser gets
 *              the session id and opens Cashfree's checkout.
 *   confirm    asked for when the checkout closes, and by Cashfree's webhook:
 *              reads the order back **from Cashfree** and, once it is PAID,
 *              makes the thing that was paid for.
 *   fulfil     once per order, inside a transaction that locks its row — the
 *              browser and the webhook arriving together cannot both make it.
 *
 * What gets made:
 *
 *   commission             an approved commission remittance from the
 *                          laboratory to head office, pay mode `online`, the
 *                          Cashfree payment id as its reference. Approved,
 *                          because the gateway has already confirmed the money
 *                          — the manual approval exists to check a payment
 *                          nobody else has seen.
 *   student_registration   the student, active, enrolled on the course with
 *                          the fee recorded as paid, and the confirmation mail.
 *   enrolment_fee          a fee instalment on an existing enrolment, added to
 *                          what the student has paid — the same as Take payment
 *                          in cash.
 *
 * In sandbox mode nothing real is charged; every row records the mode so a
 * test payment is never mistaken for money received.
 */

export type PaymentPurpose = 'commission' | 'student_registration' | 'enrolment_fee';

export interface StartedPayment {
  order_id: string;
  payment_session_id: string;
  amount: number;
  mode: 'sandbox' | 'production';
}

export interface PaymentOutcome {
  order_id: string;
  purpose: PaymentPurpose;
  status: 'created' | 'paid' | 'failed' | 'expired';
  amount: number;
  mode: string;
  /** What the payment made, once it has: the commission row, or the registration. */
  result: Record<string, unknown> | null;
}

export const paymentConfig = () => ({ enabled: cashfreeConfigured, mode: cashfreeMode, gateway: 'cashfree' as const });

function assertEnabled() {
  if (!cashfreeConfigured) {
    throw badRequest('Online payment is not set up yet. Add the Cashfree keys to the API settings, or pay another way.');
  }
}

/** IIGL-COM-… / IIGL-REG-…: readable in the Cashfree dashboard, unique, and within its 45 characters. */
const newOrderId = (purpose: PaymentPurpose) =>
  `IIGL-${purpose === 'commission' ? 'COM' : purpose === 'enrolment_fee' ? 'FEE' : 'REG'}-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString('hex').toUpperCase()}`;

/** A phone Cashfree accepts: ten digits, the last ten of whatever was stored. */
function tenDigits(phone: string | null | undefined): string {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) throw badRequest('A 10-digit mobile number is needed to pay online.');
  return digits.slice(-10);
}

/** Cashfree's refusal, said as the API's own 502 rather than a 500. */
function gatewayFailed(e: unknown): never {
  // Our own keys refused: not something the payer can fix, and not something to
  // tell them about. The log says exactly what to change.
  if (e instanceof CashfreeError && (e.status === 401 || e.status === 403)) {
    console.error(
      `[payments] Cashfree refused the API keys (${e.status} ${e.message}). Check CASHFREE_APP_ID and CASHFREE_CLIENT_SECRET are one Payment Gateway key pair for CASHFREE_ENV=${cashfreeMode}.`,
    );
    throw Object.assign(badRequest('Online payment is not available right now. Please try again later or pay another way.'), { status: 503 });
  }
  if (e instanceof CashfreeError) {
    throw Object.assign(badRequest(`The payment gateway refused: ${e.message}`), { status: e.status >= 500 ? 502 : 400 });
  }
  throw e;
}

async function start(input: {
  purpose: PaymentPurpose;
  amount: number;
  payerId: number | null;
  createdBy: number | null;
  customer: { id: string; name: string | null; phone: string; email: string | null };
  payload: unknown;
  note: string;
}): Promise<StartedPayment> {
  assertEnabled();
  if (!(input.amount >= 1)) throw badRequest('The amount to pay online must be at least ₹1.');

  const orderId = newOrderId(input.purpose);
  const now = new Date();
  await db
    .insertInto('payment_orders')
    .values({
      order_id: orderId,
      purpose: input.purpose,
      mode: cashfreeMode,
      amount: String(input.amount),
      currency: 'INR',
      status: 'created',
      payer_id: input.payerId,
      customer_name: input.customer.name,
      customer_phone: input.customer.phone,
      customer_email: input.customer.email,
      payload: JSON.stringify(input.payload ?? null),
      created_by: input.createdBy,
      created_at: now,
      updated_at: now,
    })
    .execute();

  let order;
  try {
    order = await createOrder({ orderId, amount: input.amount, customer: input.customer, note: input.note });
  } catch (e) {
    await db.updateTable('payment_orders').set({ status: 'failed', updated_at: new Date() }).where('order_id', '=', orderId).execute();
    gatewayFailed(e);
  }

  await db
    .updateTable('payment_orders')
    .set({ cf_order_id: String(order.cf_order_id), payment_session_id: order.payment_session_id, updated_at: new Date() })
    .where('order_id', '=', orderId)
    .execute();

  return { order_id: orderId, payment_session_id: order.payment_session_id, amount: input.amount, mode: cashfreeMode };
}

/** A laboratory paying commission to head office. */
export async function startCommissionPayment(user: SessionUser, body: Record<string, unknown>): Promise<StartedPayment> {
  if (user.roleId !== ROLE.LAB) throw forbidden('Only a laboratory account pays commission.');
  const amount = Math.round(Number(body.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw badRequest('Enter an amount above zero.');

  const lab = await db
    .selectFrom('users')
    .select(['id', 'empid', 'fullname', 'mobile', 'email', 'official_email'])
    .where('id', '=', user.id)
    .executeTakeFirstOrThrow();

  return start({
    purpose: 'commission',
    amount,
    payerId: user.id,
    createdBy: user.id,
    customer: {
      id: `lab_${lab.id}`,
      name: lab.fullname,
      phone: tenDigits(lab.mobile),
      email: lab.official_email || lab.email || null,
    },
    payload: { remark: body.remark ? String(body.remark).slice(0, 255) : null },
    note: `Commission from ${lab.fullname}`,
  });
}

/**
 * A student paying the course fee to register — from the website (no
 * account) or taken by head office in the panel. Nothing is written to the
 * student tables until the fee is paid.
 */
export async function startRegistrationPayment(
  body: Record<string, unknown>,
  by: SessionUser | null,
): Promise<StartedPayment & { course: string; fee: number; gst_amount: number }> {
  const details = readRegistration(body, { documents: Boolean(by) });
  const course = await courseForRegistration(details.course_id);
  if (course.total < 1) throw badRequest(`${course.name} has no fee to pay. Register without paying.`);
  await assertNotRegistered(details.mobile, course);

  const started = await start({
    purpose: 'student_registration',
    amount: course.total,
    payerId: null,
    createdBy: by?.id ?? null,
    customer: {
      id: `student_${details.mobile.replace(/\D/g, '').slice(-10)}`,
      name: details.name,
      phone: tenDigits(details.mobile),
      email: details.email,
    },
    payload: { details, from: by ? 'panel' : 'website' },
    note: `Registration: ${course.name}`,
  });
  return { ...started, course: course.name, fee: course.fee, gst_amount: course.gst_amount };
}

/**
 * A student paying (part of) the fee on an enrolment, taken by head office.
 * Capped at what is still due, as the cash payment is.
 */
export async function startEnrolmentPayment(user: SessionUser, body: Record<string, unknown>): Promise<StartedPayment> {
  const enrolmentId = Number(body.enrolment_id);
  if (!Number.isInteger(enrolmentId) || enrolmentId <= 0) throw badRequest('Choose the enrolment to pay.');
  const amount = Math.round(Number(body.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw badRequest('Enter an amount greater than zero.');

  const row = await db
    .selectFrom('student_courses as sc')
    .innerJoin('students as s', 's.id', 'sc.student_id')
    .leftJoin('courses as c', 'c.id', 'sc.course_id')
    .select(['sc.id', 'sc.final_fee', 'sc.gst_amount', 'sc.fee_paid', 's.id as student_id', 's.name', 's.mobile', 's.email', 'c.name as course'])
    .where('sc.id', '=', enrolmentId)
    .executeTakeFirst();
  if (!row) throw notFound('Enrolment not found.');

  const due = Math.round((Number(row.final_fee) + Number(row.gst_amount ?? 0) - Number(row.fee_paid)) * 100) / 100;
  if (amount > due) throw badRequest('That is more than the fee still due.');

  return start({
    purpose: 'enrolment_fee',
    amount,
    payerId: null,
    createdBy: user.id,
    customer: {
      id: `student_${row.student_id}`,
      name: row.name,
      phone: tenDigits(row.mobile),
      email: row.email || null,
    },
    payload: { enrolment_id: enrolmentId },
    note: `Course fee: ${row.course ?? 'course'} — ${row.name}`,
  });
}

const outcome = (row: {
  order_id: string;
  purpose: string;
  status: string;
  amount: unknown;
  mode: string;
  result: unknown;
}): PaymentOutcome => ({
  order_id: row.order_id,
  purpose: row.purpose as PaymentPurpose,
  status: row.status as PaymentOutcome['status'],
  amount: Number(row.amount),
  mode: row.mode,
  result: row.result == null ? null : typeof row.result === 'string' ? JSON.parse(row.result) : (row.result as Record<string, unknown>),
});

/**
 * Where an order stands, asked of Cashfree, with the payment fulfilled if it
 * has just been paid. Safe to call any number of times.
 */
export async function confirmPayment(orderId: string): Promise<PaymentOutcome> {
  const row = await db.selectFrom('payment_orders').selectAll().where('order_id', '=', orderId).executeTakeFirst();
  if (!row) throw notFound('Payment not found.');
  if (row.fulfilled_at || row.status === 'expired') return outcome(row);

  let order;
  try {
    order = await getOrder(orderId);
  } catch (e) {
    gatewayFailed(e);
  }

  if (order.order_status === 'PAID') {
    // The successful payment's id and method, for the record and the receipt.
    let payment: { id: string | null; method: string | null } = { id: null, method: null };
    try {
      const payments = await getPayments(orderId);
      const ok = payments.find((p) => p.payment_status === 'SUCCESS') ?? payments[0];
      if (ok) payment = { id: String(ok.cf_payment_id), method: ok.payment_group ?? null };
    } catch {
      // The order says PAID; a missing payment detail must not hold up fulfilment.
    }
    if (Math.abs(Number(order.order_amount) - Number(row.amount)) > 0.009) {
      console.error(`[payment ${orderId}] amount mismatch: ours ${row.amount}, Cashfree ${order.order_amount}`);
      throw conflict('The amount paid does not match the order. Head office has been told.');
    }
    await fulfil(orderId, payment);
  } else if (order.order_status === 'EXPIRED' || order.order_status === 'TERMINATED') {
    await db.updateTable('payment_orders').set({ status: 'expired', updated_at: new Date() }).where('order_id', '=', orderId).where('status', '=', 'created').execute();
  }

  const fresh = await db.selectFrom('payment_orders').selectAll().where('order_id', '=', orderId).executeTakeFirstOrThrow();
  return outcome(fresh);
}

/** Makes what was paid for, once. The row lock is what makes "once" true. */
async function fulfil(orderId: string, payment: { id: string | null; method: string | null }) {
  let mail: { to: string; name: string; registrationNo: string; course: string } | null = null;

  await db.transaction().execute(async (trx) => {
    const locked = await sql<{ id: number; purpose: string; amount: string; payer_id: number | null; payload: unknown; fulfilled_at: Date | null; mode: string; created_by: number | null }>`
      SELECT id, purpose, amount, payer_id, payload, fulfilled_at, mode, created_by
      FROM payment_orders WHERE order_id = ${orderId} FOR UPDATE`.execute(trx);
    const row = locked.rows[0];
    if (!row || row.fulfilled_at) return;

    const amount = Number(row.amount);
    const reference = payment.id ? `Cashfree ${payment.id}` : `Cashfree order ${orderId}`;
    const test = row.mode === 'sandbox' ? ' [TEST MODE]' : '';
    const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : (row.payload as any);
    let referenceId: number | null = null;
    let result: Record<string, unknown> = {};

    if (row.purpose === 'commission') {
      const inserted = await trx
        .insertInto('transactions')
        .values({
          amount: String(amount),
          comission_on: null,
          transaction_type: TRANSACTION_TYPE.COMMISSION,
          // How it was paid, as Cashfree reports it: online_upi, online_debit_card…
          pay_mode: payment.method ? `online_${payment.method.toLowerCase()}` : 'online',
          transaction_no: payment.id ?? orderId,
          remark: [`Paid online via Cashfree${test}.`, payload?.remark].filter(Boolean).join(' '),
          attachment: null,
          send_by: Number(row.payer_id),
          received_by: ROLE.SUPER,
          // The gateway has confirmed the money, which is what approval checks.
          status: STATUS.APPROVED,
          seen_by_sender: 1,
          seen_by_receiver: 0,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .executeTakeFirstOrThrow();
      referenceId = Number(inserted.insertId);
      result = { transaction_id: referenceId, amount, reference };
    } else if (row.purpose === 'student_registration') {
      const details = payload?.details as RegistrationDetails;
      const course = await courseForRegistration(details.course_id);
      const made = await insertRegistration(trx as unknown as typeof db, details, course, {
        remark: `${payload?.from === 'panel' ? 'Registered in the panel' : 'Registered on the website'}; fee paid online via Cashfree (${reference})${test}.`,
        addedBy: row.created_by,
        paid: {
          amount,
          reference,
          payMode: payment.method ? `online_${payment.method.toLowerCase()}` : 'online',
          transactionNo: payment.id ?? orderId,
        },
      });
      referenceId = made.studentId;
      result = {
        student_id: made.studentId,
        enrolment_id: made.enrolmentId,
        registration_no: made.registrationNo,
        course: course.name,
        amount,
        reference,
      };
      mail = { to: details.email, name: details.name, registrationNo: made.registrationNo, course: course.name };
    } else if (row.purpose === 'enrolment_fee') {
      const enrolmentId = Number(payload?.enrolment_id);
      const current = await trx
        .selectFrom('student_courses')
        .select(['fee_paid', 'final_fee', 'gst_amount', 'remark'])
        .where('id', '=', enrolmentId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      const paid = Math.round((Number(current.fee_paid) + amount) * 100) / 100;
      const payableNow = Number(current.final_fee) + Number(current.gst_amount ?? 0);
      // The money has been taken, so it is recorded even if the fee changed
      // meanwhile; only said, so somebody can refund the difference.
      if (paid > payableNow + 0.009) {
        console.warn(`[payment ${orderId}] enrolment ${enrolmentId} now paid ${paid} against ${payableNow} payable`);
      }
      await trx
        .updateTable('student_courses')
        .set({
          fee_paid: String(paid),
          remark: [current.remark, `₹${amount} paid online (${reference})${test}.`].filter(Boolean).join(' '),
          updated_at: new Date(),
        })
        .where('id', '=', enrolmentId)
        .execute();
      // …and into head office's Wallet, as a desk payment is.
      await recordCourseFee(trx as unknown as typeof db, {
        enrolmentId,
        amount,
        payMode: payment.method ? `online_${payment.method.toLowerCase()}` : 'online',
        transactionNo: payment.id ?? orderId,
        remark: `Course fee paid online${test}.`,
      });
      referenceId = enrolmentId;
      result = { enrolment_id: enrolmentId, amount, fee_paid: paid, due: Math.max(0, Math.round((payableNow - paid) * 100) / 100), reference };
    }

    await trx
      .updateTable('payment_orders')
      .set({
        status: 'paid',
        cf_payment_id: payment.id,
        payment_method: payment.method,
        reference_id: referenceId,
        result: JSON.stringify(result),
        paid_at: new Date(),
        fulfilled_at: new Date(),
        updated_at: new Date(),
      })
      .where('order_id', '=', orderId)
      .execute();
  });

  if (mail) {
    const m = mail as { to: string; name: string; registrationNo: string; course: string };
    try {
      await sendRegistrationReceived(m.to, { name: m.name, registrationNo: m.registrationNo, course: m.course });
    } catch (e) {
      console.warn(`[payment ${orderId}] confirmation mail not sent: ${(e as Error).message}`);
    }
  }
}

/** Who may ask about an order in the panel: head office, or the laboratory that paid. */
export async function assertMayReadPayment(user: SessionUser, orderId: string) {
  const row = await db.selectFrom('payment_orders').select(['payer_id', 'created_by', 'purpose']).where('order_id', '=', orderId).executeTakeFirst();
  if (!row) throw notFound('Payment not found.');
  if (user.roleId === ROLE.SUPER) return;
  if (Number(row.payer_id) === user.id || Number(row.created_by) === user.id) return;
  throw notFound('Payment not found.');
}

/** The website may only ask about the registrations the website started. */
export async function assertPublicPayment(orderId: string) {
  const row = await db.selectFrom('payment_orders').select(['purpose', 'created_by']).where('order_id', '=', orderId).executeTakeFirst();
  if (!row || row.purpose !== 'student_registration' || row.created_by !== null) throw notFound('Payment not found.');
}
