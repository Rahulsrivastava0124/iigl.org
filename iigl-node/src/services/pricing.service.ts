import { db } from '../db/index.js';
import { badRequest, notFound } from '../lib/errors.js';
import { caratOf, gstOf, round2 } from '../lib/money.js';

/**
 * Order pricing, ported from the calculation that lived in Blade and jQuery
 * rather than in PHP — which is why 9,353 of 9,608 live orders carry no
 * total_amount at all. Computing it here means a total exists for every order
 * and the client can no longer post its own figure.
 *
 * Rules recovered from resources/views/common/order/report_detail.blade.php:
 *
 *   1. Price each certificate by the weight band matching its carat weight.
 *      A band matches when `min_wt <= carat_weight < max_wt` — half open, so a
 *      weight equal to max_wt falls into the next band up.
 *   2. Prefer a band belonging to the ordering laboratory; fall back to the
 *      standard bands, which have a null lab_id.
 *   3. Add smart_price when the order line asked for a smart card, and
 *      classic_price when it asked for a classic card. A line can ask for both.
 *   4. GST is 18%, applied after the discount, and truncated rather than
 *      rounded — the original does parseInt(), so 1180.9 becomes 1180.
 *
 * The `rate` column takes no part in this. It is filled in on every price row
 * but never read by any code path in the Laravel application.
 */

export interface PricedCertificate {
  report_id: number;
  report_no: string;
  carat_weight: string;
  category_id: number;
  price_id: number | null;
  price_source: 'laboratory' | 'standard' | 'unpriced';
  smart_price: number;
  classic_price: number;
  line_total: number;
}

export interface Quote {
  order_id: number;
  order_no: string;
  certificates: PricedCertificate[];
  smart_card_total: number;
  classic_card_total: number;
  /** Sum before discount. Maps to orders.total_amount. */
  total_amount: number;
  discount: number;
  /** total_amount minus discount. Maps to orders.payable_amt. */
  payable_amount: number;
  /** Payable plus 18% GST, truncated. What the customer actually pays. */
  amount_with_gst: number;
  /** Taken against the order so far, summed from its collections. */
  paid_amount: number;
  /** `amount_with_gst` less what has been taken. Never negative. */
  balance_due: number;
  unpriced_count: number;
}


/**
 * Resolves the weight band for one certificate. Rows are ordered by id so a
 * weight covered by more than one band resolves the same way as the PHP
 * `first()`, which returns the lowest primary key. Overlapping bands do exist
 * in the live data — category 2 has bands 0–1, 0–15, 1–10 and 15–20.
 */
async function resolveBand(labId: number, categoryId: number, caratWeight: number) {
  const bands = await db
    .selectFrom('prices')
    .select(['id', 'min_wt', 'max_wt', 'smart_price', 'classic_price', 'lab_id'])
    .where('category_id', '=', String(categoryId))
    .where('min_wt', '<=', caratWeight)
    .where('max_wt', '>', caratWeight)
    .orderBy('id')
    .execute();

  const own = bands.find((b) => b.lab_id !== null && Number(b.lab_id) === labId);
  if (own) return { band: own, source: 'laboratory' as const };

  const standard = bands.find((b) => b.lab_id === null);
  if (standard) return { band: standard, source: 'standard' as const };

  return { band: null, source: 'unpriced' as const };
}

/** Prices an order from its certificates. Read-only. */
export async function quoteOrder(orderId: number, discount = 0): Promise<Quote> {
  const order = await db
    .selectFrom('orders')
    .where('deleted_at', 'is', null)
    .select(['id', 'order_no', 'lab_id'])
    .where('id', '=', orderId)
    .executeTakeFirst();
  if (!order) throw notFound('Order not found.');

  const items = await db
    .selectFrom('order_details')
    .select(['id', 'category_id', 'smart_card', 'classic_card'])
    .where('order_id', '=', orderId)
    .execute();

  // Certificates are reached through order_details.id. The reports.order_no
  // column is misnamed: it stores the order id, not the order number — true
  // for all 22,103 live rows, and no row joins on the order number at all.
  const reports = items.length
    ? await db
        .selectFrom('reports')
        .select(['id', 'report_no', 'order_detail_id', 'carat_weight'])
        .where(
          'order_detail_id',
          'in',
          items.map((i) => String(i.id)),
        )
        .execute()
    : [];

  const itemById = new Map(items.map((i) => [Number(i.id), i]));
  const certificates: PricedCertificate[] = [];
  let smartTotal = 0;
  let classicTotal = 0;

  for (const report of reports) {
    const item = itemById.get(Number(report.order_detail_id));
    if (!item) continue;

    const carat = caratOf(report.carat_weight);
    const { band, source } = await resolveBand(Number(order.lab_id), Number(item.category_id), carat);

    const smart = band && item.smart_card ? Number(band.smart_price) : 0;
    const classic = band && item.classic_card ? Number(band.classic_price) : 0;

    smartTotal += smart;
    classicTotal += classic;

    certificates.push({
      report_id: Number(report.id),
      report_no: report.report_no,
      carat_weight: report.carat_weight,
      category_id: Number(item.category_id),
      price_id: band ? Number(band.id) : null,
      price_source: source,
      smart_price: smart,
      classic_price: classic,
      line_total: round2(smart + classic),
    });
  }

  const total = round2(smartTotal + classicTotal);
  const payable = round2(total - discount);
  const withGst = gstOf(payable);

  /*
    What has already been taken against this order, and what is left.

    Money is collected in parts now that paying and delivering are separate
    acts, so "payable" alone is not the figure anybody at the counter needs —
    they need what is still owed. It is summed from the transactions rather
    than read from `orders.paid_amount` so it cannot disagree with the payment
    history printed beside it.
  */
  const taken = await db
    .selectFrom('transactions')
    .select(({ fn }) => fn.sum<number>('amount').as('total'))
    .where('order_id', '=', orderId)
    .where('transaction_type', '=', 'collected_by_order')
    .executeTakeFirst();
  const paid = round2(Number(taken?.total ?? 0));

  return {
    paid_amount: paid,
    // Never negative: an overpayment is somebody's change, not a debt the
    // order owes back.
    balance_due: round2(Math.max(0, withGst - paid)),
    order_id: Number(order.id),
    order_no: order.order_no,
    certificates,
    smart_card_total: round2(smartTotal),
    classic_card_total: round2(classicTotal),
    total_amount: total,
    discount: round2(discount),
    payable_amount: payable,
    amount_with_gst: withGst,
    unpriced_count: certificates.filter((c) => c.price_source === 'unpriced').length,
  };
}

export interface SettleInput {
  discount?: number;
  paid_amount?: number;
  pay_mode?: string;
  transaction_no?: string | null;
}

export function validateSettleInput(body: unknown): SettleInput {
  const b = (body ?? {}) as Record<string, unknown>;
  const discount = b.discount == null ? 0 : Number(b.discount);
  if (!Number.isFinite(discount) || discount < 0) throw badRequest('Discount cannot be negative.');

  const paid = b.paid_amount == null ? undefined : Number(b.paid_amount);
  if (paid !== undefined && (!Number.isFinite(paid) || paid < 0)) {
    throw badRequest('Paid amount cannot be negative.');
  }

  return {
    discount,
    paid_amount: paid,
    pay_mode: b.pay_mode ? String(b.pay_mode) : 'cash',
    transaction_no: b.transaction_no ? String(b.transaction_no) : null,
  };
}

/**
 * Marks an order delivered, writing the totals this service computed rather
 * than any figure supplied by the caller, and recording the collection as a
 * transaction. Everything happens in one database transaction; the PHP writes
 * the order and the transaction separately with neither guarded.
 */
/**
 * Takes the money, and hands the order over only if asked to.
 *
 * They were one act, as they are in the Laravel screen: its bill modal recorded
 * the payment and delivered in the same press. In practice they are two — a
 * customer pays something on account days before collecting, and an order can
 * be handed over with dues outstanding, which is what the dues list is for. So
 * `deliver` decides, and the money is written either way.
 */
export async function settleAndDeliver(
  orderId: number,
  collectedBy: number,
  input: SettleInput,
  deliver = false,
) {
  const quote = await quoteOrder(orderId, input.discount ?? 0);

  if (quote.discount > quote.total_amount) {
    throw badRequest(`Discount of ${quote.discount} exceeds the order total of ${quote.total_amount}.`);
  }

  /*
    This payment, and the running total after it.

    An order is paid in parts — that is what separating payment from delivery
    is for — so what arrives here is the instalment, not the settlement. It is
    checked against what is still owed rather than against the whole bill, and
    added to what has already been taken rather than written over it: the
    second payment used to replace the first, and the order came out owing more
    than the customer had left to pay.
  */
  const instalment = input.paid_amount ?? quote.balance_due;
  if (instalment > quote.balance_due) {
    throw badRequest(
      quote.paid_amount > 0
        ? `${quote.paid_amount} has already been taken against this order. Only ${quote.balance_due} is still owed.`
        : `Paid amount exceeds the payable amount of ${quote.amount_with_gst}.`,
    );
  }

  const paid = round2(quote.paid_amount + instalment);
  const dues = round2(Math.max(0, quote.amount_with_gst - paid));

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable('orders')
      .set({
        total_amount: String(quote.total_amount),
        discount: quote.discount,
        payable_amt: quote.payable_amount,
        paid_amount: String(paid),
        dues_amount: String(dues),
        pay_mode: input.pay_mode ?? 'cash',
        transaction_no: input.transaction_no,
        ...(deliver
          ? {
              status: 'delivered',
              delivery_date: new Date().toISOString().slice(0, 10),
              deliver_by: collectedBy,
            }
          : null),
        updated_at: new Date(),
      })
      .where('id', '=', orderId)
      .execute();

    // The instalment, not the running total: the history is a list of the
    // payments that were made, and writing the total would double-count.
    if (instalment > 0) {
      await trx
        .insertInto('transactions')
        .values({
          amount: String(instalment),
          pay_mode: input.pay_mode ?? 'cash',
          transaction_no: input.transaction_no,
          transaction_type: 'collected_by_order',
          order_id: orderId,
          // Collected from a walk-in customer, who has no user row.
          send_by: 0,
          received_by: collectedBy,
          status: 1,
          seen_by_sender: 1,
          seen_by_receiver: 1,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .execute();
    }
  });

  return { ...quote, paid_amount: paid, balance_due: dues, dues_amount: dues };
}

/**
 * Hands the order over. The money is not touched: an order may be delivered
 * with dues outstanding — that is what the dues list is — and one paid for on
 * Tuesday may be collected on Friday.
 *
 * Refused while certificates are outstanding: handing over an order that is
 * short of the certificates it was taken for is the one mistake this cannot be
 * undone from, since delivering is what closes it.
 */
export async function deliverOrder(orderId: number, deliveredBy: number) {
  const order = await db
    .selectFrom('orders')
    .select(['id', 'status'])
    .where('deleted_at', 'is', null)
    .where('id', '=', orderId)
    .executeTakeFirst();
  if (!order) throw notFound('Order not found.');
  if (order.status === 'delivered') throw badRequest('This order has already been delivered.');

  const quote = await quoteOrder(orderId);
  const items = await db
    .selectFrom('order_details')
    .select(['qty', 'smart_card', 'classic_card'])
    .where('order_id', '=', orderId)
    .execute();

  // A line carrying both card kinds is owed a certificate for each, which is
  // how the list counts it too.
  const owed = items.reduce(
    (n, it) => n + Number(it.qty) * (Number(it.smart_card) + Number(it.classic_card)),
    0,
  );
  if (quote.certificates.length < owed) {
    throw badRequest(
      `${quote.certificates.length} of ${owed} certificates are written. Finish them before delivering.`,
    );
  }

  await db
    .updateTable('orders')
    .set({
      status: 'delivered',
      delivery_date: new Date().toISOString().slice(0, 10),
      deliver_by: deliveredBy,
      updated_at: new Date(),
    })
    .where('id', '=', orderId)
    .execute();

  return { id: orderId, status: 'delivered' as const, certificates: quote.certificates.length };
}
