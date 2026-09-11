/**
 * Every settled order's stored money against its live bill.
 *
 * The order page reads the live bill; the order list, the dashboard's Dues and
 * the customer totals read the columns settlement stored. When the two differ,
 * the same order shows two different amounts owed — which is how 202609-551221
 * came to read 121 on its own page and 829 everywhere else.
 *
 *   npm run check:order-money          report drift, exit 1 if there is any
 *   npm run check:order-money -- --fix bring drifted orders back in step
 *
 * Read-only without --fix.
 */
import { db } from '../db/index.js';
import { quoteOrder, refreshOrderMoney } from '../services/pricing.service.js';

const fix = process.argv.includes('--fix');

async function drifted() {
  const orders = await db
    .selectFrom('orders')
    .select(['id', 'order_no', 'discount', 'total_amount', 'payable_amt', 'paid_amount', 'dues_amount'])
    .where('deleted_at', 'is', null)
    .where('payable_amt', 'is not', null)
    .execute();

  const out: { id: number; order_no: string; stored: string; live: string }[] = [];
  for (const o of orders) {
    const q = await quoteOrder(Number(o.id), Number(o.discount ?? 0));
    const same =
      Number(o.total_amount) === q.total_amount &&
      Number(o.payable_amt) === q.payable_amount &&
      Number(o.paid_amount) === q.paid_amount &&
      Number(o.dues_amount) === q.balance_due;
    if (!same) {
      out.push({
        id: Number(o.id),
        order_no: String(o.order_no),
        stored: `payable ${o.payable_amt} paid ${o.paid_amount} dues ${o.dues_amount}`,
        live: `payable ${q.payable_amount} paid ${q.paid_amount} dues ${q.balance_due}`,
      });
    }
  }
  return { checked: orders.length, drift: out };
}

async function main() {
  const first = await drifted();
  console.log(`${first.checked} settled orders checked`);
  for (const d of first.drift) {
    console.log(`  ${d.order_no}\n    stored: ${d.stored}\n    live  : ${d.live}`);
  }

  if (first.drift.length === 0) {
    console.log('Every settled order is in step with its bill.');
    process.exit(0);
  }
  if (!fix) {
    console.log(`\n${first.drift.length} drifted. Run with --fix to correct them.`);
    process.exit(1);
  }

  for (const d of first.drift) await refreshOrderMoney(d.id);
  const after = await drifted();
  console.log(`\nfixed ${first.drift.length}; drifted now: ${after.drift.length}`);
  process.exit(after.drift.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
