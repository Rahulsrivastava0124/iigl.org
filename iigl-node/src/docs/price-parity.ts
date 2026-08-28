/**
 * Compares the ported pricing against the totals the Laravel application
 * already wrote, for every order that carries one.
 *
 *   npx tsx src/docs/price-parity.ts
 *
 * Read-only. This is the phase 04 gate for pricing: the calculation moved from
 * browser JavaScript into the server, and it has to land on the same number.
 */
import { db } from '../db/index.js';
import { quoteOrder } from '../services/pricing.service.js';

const priced = await db
  .selectFrom('orders')
  .select(['id', 'order_no', 'lab_id', 'total_amount', 'discount', 'payable_amt', 'paid_amount'])
  .where('total_amount', 'is not', null)
  .where('total_amount', '!=', '')
  .orderBy('id')
  .execute();

console.log(`orders carrying a stored total: ${priced.length}\n`);

let match = 0;
const mismatches: Array<{ id: number; stored: number; computed: number; diff: number; unpriced: number }> = [];
let noCertificates = 0;

for (const order of priced) {
  const stored = Number(order.total_amount);
  const quote = await quoteOrder(Number(order.id), Number(order.discount ?? 0));

  if (quote.certificates.length === 0) noCertificates++;

  if (Math.abs(quote.total_amount - stored) < 0.01) {
    match++;
  } else {
    mismatches.push({
      id: Number(order.id),
      stored,
      computed: quote.total_amount,
      diff: Number((quote.total_amount - stored).toFixed(2)),
      unpriced: quote.unpriced_count,
    });
  }
}

const pct = ((match / priced.length) * 100).toFixed(1);
console.log(`exact match:  ${match}/${priced.length}  (${pct}%)`);
console.log(`mismatched:   ${mismatches.length}`);
console.log(`no certificates issued yet: ${noCertificates}`);

if (mismatches.length) {
  const withUnpriced = mismatches.filter((m) => m.unpriced > 0).length;
  const computedZero = mismatches.filter((m) => m.computed === 0).length;

  console.log(`\n  of the mismatches:`);
  console.log(`    ${withUnpriced} contain a certificate with no matching price band`);
  console.log(`    ${computedZero} compute to zero (no certificates, or none priced)`);

  console.log('\n  first 15:');
  console.log('    order    stored   computed      diff  unpriced');
  for (const m of mismatches.slice(0, 15)) {
    console.log(
      `    ${String(m.id).padEnd(8)} ${String(m.stored).padStart(6)} ${String(m.computed).padStart(10)} ${String(m.diff).padStart(9)} ${String(m.unpriced).padStart(9)}`,
    );
  }
}

await db.destroy();
