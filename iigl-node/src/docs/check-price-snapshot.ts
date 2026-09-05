/**
 * Does a certificate hold the price it was issued at?
 *
 *   npm run check:price-snapshot
 *
 * An order is priced per certificate, and until migration 031 every price was
 * read from the `prices` bands at the moment somebody opened the order. Edit a
 * band and orders taken months ago re-priced themselves: a customer who had
 * paid in full grew a due out of a rate change nobody had told them about.
 *
 * This builds a laboratory, an order and a certificate, prices it, then moves
 * the band underneath it and asks what the order is worth:
 *
 *   issued at 220        the band said 220 when the certificate was written
 *   band doubled to 440  the quote still says 220 — the snapshot rules
 *   weight amended       re-priced, because the weight is what chooses a band
 *   legacy certificate   priced_at NULL still follows the live band, as before
 *
 * Writes nothing that survives: everything happens inside a transaction that is
 * always rolled back, so this is safe against the production copy. Every write
 * goes through the transaction handle — a write through the pool handle inside
 * a transaction block is not in the transaction, and no rollback reaches it.
 */
import { db } from '../db/index.js';
import { quoteOrder } from '../services/pricing.service.js';
import { createReport, updateReport } from '../services/report.service.js';
import { ROLE } from '../middleware/auth.js';

const ROLLBACK = 'rollback: the check is done';
let failures = 0;

const check = (label: string, got: number, want: number) => {
  const ok = Math.abs(got - want) < 0.005;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(38)} ${got}${ok ? '' : ` (expected ${want})`}`);
};

try {
  await db.transaction().execute(async (trx) => {
    const lab = await trx
      .insertInto('users')
      .values({
        fullname: 'Price snapshot check',
        mobile: `0000${Date.now() % 1000000}`,
        password: 'x',
        role_id: 2,
        is_active: 0,
        status: 0,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .executeTakeFirstOrThrow();
    const labId = Number(lab.insertId);

    const category = await trx
      .insertInto('categories')
      .values({
        name: 'Snapshot check',
        added_by: 1,
        unit: '',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .executeTakeFirstOrThrow();
    const categoryId = Number(category.insertId);

    // One band, 0 to 5 carat, smart 220.
    const band = await trx
      .insertInto('prices')
      .values({
        category_id: String(categoryId),
        lab_id: null,
        min_wt: 0,
        max_wt: 5,
        smart_price: 220,
        classic_price: 1100,
        rate: '0',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .executeTakeFirstOrThrow();
    const bandId = Number(band.insertId);

    const order = await trx
      .insertInto('orders')
      .values({
        lab_id: labId,
        customer_name: 'Check',
        mobile: '0000000000',
        order_no: `SNAP${Date.now()}`,
        order_date: '2026-01-01',
        status: 'preparing',
        received_by: 1,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .executeTakeFirstOrThrow();
    const orderId = Number(order.insertId);

    const detail = await trx
      .insertInto('order_details')
      .values({
        order_id: orderId,
        category_id: categoryId,
        qty: 1,
        smart_card: 1,
        classic_card: 0,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .executeTakeFirstOrThrow();
    const detailId = Number(detail.insertId);

    /** Issued through the real path, so what it stamps is what is checked. */
    const issue = (carat: string) =>
      createReport(
        { id: 1, roleId: ROLE.LAB, labId, empid: null } as never,
        {
          order_id: orderId,
          order_detail_id: detailId,
          subcategory_id: 1,
          carat_weight: carat,
          gross_weight: '1',
          gross_wt_unit: 1,
          stone_wt_unit: 1,
          size: null,
          comments: null,
          item_image: null,
          attributes: [],
        } as never,
        trx,
      );

    const reportId = await issue('1.00');

    const total = async () => (await quoteOrder(orderId, 0, trx)).total_amount;
    const source = async () => (await quoteOrder(orderId, 0, trx)).certificates[0]?.price_source;

    console.log('certificate price snapshot');
    check('issued at the band price', await total(), 220);

    // The rate moves. Every screen that reads this order used to move with it.
    await trx.updateTable('prices').set({ smart_price: 440 }).where('id', '=', bandId).execute();
    check('band doubled, order unchanged', await total(), 220);
    console.log(`  ${(await source()) === 'agreed' ? 'ok  ' : 'FAIL'}  priced from the certificate      ${await source()}`);
    if ((await source()) !== 'agreed') failures += 1;

    // The weight decides the band, so amending it re-prices — at the rate that
    // stands when the amendment is made, which is now 440.
    await updateReport(reportId, { carat_weight: '2.00' }, trx);
    check('weight amended, re-priced', await total(), 440);

    // A certificate written before the migration carries no snapshot and is
    // still priced from whatever the band says now — which is the 440 the band
    // was moved to, not the 220 its two placeholder columns would suggest.
    await trx
      .updateTable('reports')
      .set({ priced_at: null, smart_card_price: '200', classic_card_price: '400' })
      .where('id', '=', reportId)
      .execute();
    check('legacy certificate, live band', await total(), 440);

    throw new Error(ROLLBACK);
  });
} catch (e) {
  if ((e as Error).message !== ROLLBACK) throw e;
}

await db.destroy();
console.log(
  failures === 0
    ? '\nA certificate is billed at the price it was issued at.'
    : `\n${failures} failed.`,
);
