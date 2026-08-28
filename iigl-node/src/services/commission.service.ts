import { db } from '../db/index.js';
import { badRequest } from '../lib/errors.js';
import { ROLE, type SessionUser } from '../middleware/auth.js';

/**
 * Commission and ledger.
 *
 * A laboratory owes the administrator a percentage of what it collects. The
 * rate is per laboratory, held in `users.commision`, and the payment is
 * recorded as a transaction of type `commision` — the column value is spelled
 * that way in the data and must stay spelled that way.
 *
 *   comission_on = the collected amount the commission is calculated on
 *   amount       = the commission itself, comission_on × rate ÷ 100
 *
 * The Laravel version takes both figures from the request, so a laboratory can
 * post any commission it likes against any base. Here the base is supplied and
 * the amount is derived from the laboratory's own configured rate.
 *
 * The live data confirms the rate: laboratory 4 is configured at 10.00 and its
 * one commission row is 10 on a base of 100.
 */

/** transaction_type values in use. Spelling matches the stored data. */
export const TRANSACTION_TYPE = {
  ORDER_COLLECTION: 'collected_by_order',
  WALLET_TRANSFER: 'wallet_transfer',
  COMMISSION: 'commision',
} as const;

const STATUS = { PENDING: 0, APPROVED: 1, DECLINED: 2 } as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CommissionInput {
  commission_on: number;
  pay_mode?: string;
  transaction_no?: string | null;
  remark?: string | null;
  attachment?: string | null;
}

export function validateCommissionInput(body: unknown): CommissionInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const base = Number(b.commission_on);
  if (!Number.isFinite(base) || base <= 0) {
    throw badRequest('Enter the collected amount the commission is calculated on.');
  }
  return {
    commission_on: base,
    pay_mode: b.pay_mode ? String(b.pay_mode) : 'cash',
    transaction_no: b.transaction_no ? String(b.transaction_no) : null,
    remark: b.remark ? String(b.remark) : null,
    attachment: b.attachment ? String(b.attachment) : null,
  };
}

export interface CommissionResult {
  id: number;
  commission_on: number;
  rate_percent: number;
  amount: number;
}

/** Records a commission payment from a laboratory to the administrator. */
export async function sendCommission(
  user: SessionUser,
  input: CommissionInput,
): Promise<CommissionResult> {
  if (user.roleId !== ROLE.LAB) {
    throw badRequest('Only a laboratory account can send commission.');
  }

  const lab = await db
    .selectFrom('users')
    .select(['id', 'commision'])
    .where('id', '=', user.id)
    .executeTakeFirstOrThrow();

  const rate = Number(lab.commision ?? 0);
  if (rate <= 0) {
    throw badRequest('No commission rate is set for this laboratory. Ask the administrator to set one.');
  }

  const amount = round2((input.commission_on * rate) / 100);

  const result = await db
    .insertInto('transactions')
    .values({
      amount: String(amount),
      comission_on: input.commission_on,
      transaction_type: TRANSACTION_TYPE.COMMISSION,
      pay_mode: input.pay_mode ?? 'cash',
      transaction_no: input.transaction_no,
      remark: input.remark,
      attachment: input.attachment,
      send_by: user.id,
      // Commission always goes to the administrator, user 1.
      received_by: ROLE.ADMIN,
      status: STATUS.PENDING,
      seen_by_sender: 1,
      seen_by_receiver: 0,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .executeTakeFirst();

  return {
    id: Number(result.insertId),
    commission_on: input.commission_on,
    rate_percent: rate,
    amount,
  };
}

export interface LedgerEntry {
  id: number;
  date: Date | null;
  type: string | null;
  direction: 'credit' | 'debit';
  amount: number;
  status: number;
  counterparty: number;
  order_id: number | null;
  pay_mode: string;
  transaction_no: string | null;
  remark: string | null;
  balance: number;
}

/**
 * Running account for one user. Money received is a credit, money sent is a
 * debit, and only approved transactions move the balance — pending and
 * declined rows appear so the history is complete but leave it unchanged.
 */
export interface LedgerPage {
  entries: LedgerEntry[];
  credit_total: number;
  debit_total: number;
  balance: number;
  pending_out: number;
  pending_in: number;
  total: number;
  offset: number;
  limit: number;
}

export async function ledgerFor(
  userId: number,
  limit = 100,
  offset = 0,
): Promise<LedgerPage> {
  const mine = (eb: any) => eb.or([eb('send_by', '=', userId), eb('received_by', '=', userId)]);

  // The whole history is read because the running balance on any entry depends
  // on every entry before it, and the totals describe the account rather than
  // the page. Only the returned slice is built into objects, so a long history
  // costs one scan rather than one response the size of the account.
  const rows = await db
    .selectFrom('transactions')
    .select(['id', 'amount', 'send_by', 'received_by', 'status', 'transaction_type', 'order_id', 'pay_mode', 'transaction_no', 'remark', 'created_at'])
    .where(mine)
    .orderBy('id')
    .execute();

  const from = Math.max(0, offset);
  const to = from + Math.max(1, limit);

  const entries: LedgerEntry[] = [];
  let balance = 0;
  let creditTotal = 0;
  let debitTotal = 0;
  let pendingOut = 0;
  let pendingIn = 0;
  let index = -1;

  for (const row of rows) {
    index++;
    const amount = Number(row.amount) || 0;
    const isCredit = Number(row.received_by) === userId;
    const status = Number(row.status);

    if (status === STATUS.APPROVED) {
      if (isCredit) {
        creditTotal += amount;
        balance += amount;
      } else {
        debitTotal += amount;
        balance -= amount;
      }
    } else if (status === STATUS.PENDING) {
      if (isCredit) pendingIn += amount;
      else pendingOut += amount;
    }

    if (index < from || index >= to) continue;

    entries.push({
      id: Number(row.id),
      date: row.created_at,
      type: row.transaction_type,
      direction: isCredit ? 'credit' : 'debit',
      amount,
      status,
      counterparty: isCredit ? Number(row.send_by) : Number(row.received_by),
      order_id: row.order_id === null ? null : Number(row.order_id),
      pay_mode: row.pay_mode,
      transaction_no: row.transaction_no,
      remark: row.remark,
      balance: round2(balance),
    });
  }

  return {
    entries,
    credit_total: round2(creditTotal),
    debit_total: round2(debitTotal),
    balance: round2(balance),
    pending_out: round2(pendingOut),
    pending_in: round2(pendingIn),
    total: rows.length,
    offset: from,
    limit: to - from,
  };
}
