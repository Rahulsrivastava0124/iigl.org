import { db } from '../db/index.js';
import { badRequest, notFound } from '../lib/errors.js';
import { caratOf, gstOf, round2 } from '../lib/money.js';
/**
 * Resolves the weight band for one certificate. Rows are ordered by id so a
 * weight covered by more than one band resolves the same way as the PHP
 * `first()`, which returns the lowest primary key. Overlapping bands do exist
 * in the live data — category 2 has bands 0–1, 0–15, 1–10 and 15–20.
 */
async function resolveBand(labId, categoryId, caratWeight) {
    const bands = await db
        .selectFrom('prices')
        .select(['id', 'min_wt', 'max_wt', 'smart_price', 'classic_price', 'lab_id'])
        .where('category_id', '=', String(categoryId))
        .where('min_wt', '<=', caratWeight)
        .where('max_wt', '>', caratWeight)
        .orderBy('id')
        .execute();
    const own = bands.find((b) => b.lab_id !== null && Number(b.lab_id) === labId);
    if (own)
        return { band: own, source: 'laboratory' };
    const standard = bands.find((b) => b.lab_id === null);
    if (standard)
        return { band: standard, source: 'standard' };
    return { band: null, source: 'unpriced' };
}
/** Prices an order from its certificates. Read-only. */
export async function quoteOrder(orderId, discount = 0) {
    const order = await db
        .selectFrom('orders')
        .where('deleted_at', 'is', null)
        .select(['id', 'order_no', 'lab_id'])
        .where('id', '=', orderId)
        .executeTakeFirst();
    if (!order)
        throw notFound('Order not found.');
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
            .where('order_detail_id', 'in', items.map((i) => String(i.id)))
            .execute()
        : [];
    const itemById = new Map(items.map((i) => [Number(i.id), i]));
    const certificates = [];
    let smartTotal = 0;
    let classicTotal = 0;
    for (const report of reports) {
        const item = itemById.get(Number(report.order_detail_id));
        if (!item)
            continue;
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
    return {
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
export function validateSettleInput(body) {
    const b = (body ?? {});
    const discount = b.discount == null ? 0 : Number(b.discount);
    if (!Number.isFinite(discount) || discount < 0)
        throw badRequest('Discount cannot be negative.');
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
export async function settleAndDeliver(orderId, collectedBy, input) {
    const quote = await quoteOrder(orderId, input.discount ?? 0);
    if (quote.discount > quote.total_amount) {
        throw badRequest(`Discount of ${quote.discount} exceeds the order total of ${quote.total_amount}.`);
    }
    const paid = input.paid_amount ?? quote.amount_with_gst;
    if (paid > quote.amount_with_gst) {
        throw badRequest(`Paid amount exceeds the payable amount of ${quote.amount_with_gst}.`);
    }
    const dues = round2(quote.amount_with_gst - paid);
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
            status: 'delivered',
            delivery_date: new Date().toISOString().slice(0, 10),
            deliver_by: collectedBy,
            updated_at: new Date(),
        })
            .where('id', '=', orderId)
            .execute();
        if (paid > 0) {
            await trx
                .insertInto('transactions')
                .values({
                amount: String(paid),
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
    return { ...quote, paid_amount: paid, dues_amount: dues };
}
