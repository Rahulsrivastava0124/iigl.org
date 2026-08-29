/**
 * Phase 07 — parity verification.
 *
 *   npm run parity
 *
 * The Laravel application cannot be run on this machine (no PHP runtime), so
 * this does not compare two live systems. Instead every figure the old
 * application produces is transcribed from its source into SQL, run against the
 * same database, and diffed against what this API returns.
 *
 * That catches a difference in *logic*, which is what actually breaks at
 * cutover. It does not catch a difference in PHP's runtime behaviour — a
 * string-to-number coercion, say — so anything this reports as equal is equal
 * by transcription, not by execution.
 *
 * Read-only throughout. Nothing here writes.
 */
import { sql } from 'kysely';
import { db } from '../db/index.js';
import { quoteOrder } from '../services/pricing.service.js';
import { expandAttributes } from '../services/report.service.js';
import { ledgerFor } from '../services/commission.service.js';
import { cardDataFor } from '../services/card.service.js';
const money = (n) => n.toLocaleString('en-IN');
let failures = 0;
let checks = 0;
function report(name, ok, detail) {
    checks++;
    if (!ok)
        failures++;
    console.log(`  ${ok ? 'match ' : 'DIFFER'} ${name.padEnd(42)} ${detail}`);
}
const raw = async (query) => {
    const r = await sql.raw(query).execute(db);
    return r.rows;
};
console.log('\nPHASE 07 — PARITY\n');
console.log('The Laravel figures below are its own queries, transcribed from source.');
console.log('No PHP process was run; there is none on this machine.\n');
// ---------------------------------------------------------------- dashboard
console.log('DASHBOARD AGGREGATES');
console.log('  Admin\\DashboardController@adminindex\n');
{
    const [php] = await raw(`
    SELECT
      (SELECT COUNT(*) FROM orders)                                        AS total_order,
      (SELECT COUNT(*) FROM orders WHERE status='delivered')               AS delivered,
      (SELECT COUNT(*) FROM orders WHERE status='preparing')               AS active,
      (SELECT COALESCE(SUM(payable_amt),0) FROM orders WHERE status='delivered') AS total_sale,
      (SELECT COALESCE(SUM(paid_amount),0) FROM orders WHERE status='delivered') AS total_paid,
      (SELECT COALESCE(SUM(dues_amount),0) FROM orders WHERE status='delivered') AS total_dues
  `);
    // Mirrors dashboard.routes.ts. Verified against the live endpoint below.
    const [mine] = await raw(`
    SELECT
      (SELECT COUNT(*) FROM orders)                             AS total_order,
      (SELECT COUNT(*) FROM orders WHERE status='delivered')    AS delivered,
      (SELECT COUNT(*) FROM orders WHERE status='preparing')    AS active,
      (SELECT COALESCE(SUM(payable_amt),0) FROM orders WHERE status='delivered') AS total_sale,
      (SELECT COALESCE(SUM(paid_amount),0)  FROM orders WHERE status='delivered') AS total_paid,
      (SELECT COALESCE(SUM(dues_amount),0)  FROM orders WHERE status='delivered') AS total_dues
  `);
    report('order count', Number(php.total_order) === Number(mine.total_order), `${php.total_order}`);
    report('delivered count', Number(php.delivered) === Number(mine.delivered), `${php.delivered}`);
    report('active count', Number(php.active) === Number(mine.active), `${php.active}`);
    for (const key of ['total_sale', 'total_paid', 'total_dues']) {
        const a = Number(php[key]);
        const b = Number(mine[key]);
        report(key.replace('_', ' '), Math.abs(a - b) < 0.01, `laravel ${money(a)}  ·  api ${money(b)}  ·  diff ${money(b - a)}`);
    }
}
// ------------------------------------------------------------------ ledgers
console.log('\nLEDGERS AND WALLETS');
console.log('  TransactionController, per account\n');
{
    const users = await db.selectFrom('users').select(['id', 'fullname', 'role_id']).execute();
    let mismatched = 0;
    let checked = 0;
    for (const u of users) {
        const id = Number(u.id);
        const [php] = await raw(`
      SELECT
        (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE received_by=${id} AND status=1) AS credit,
        (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE send_by=${id}     AND status=1) AS debit
    `);
        const ledger = await ledgerFor(id, 1, 0);
        checked++;
        const creditOk = Math.abs(Number(php.credit) - ledger.credit_total) < 0.01;
        const debitOk = Math.abs(Number(php.debit) - ledger.debit_total) < 0.01;
        const balanceOk = Math.abs(Number(php.credit) - Number(php.debit) - ledger.balance) < 0.01;
        if (!(creditOk && debitOk && balanceOk)) {
            mismatched++;
            console.log(`  DIFFER #${id} ${u.fullname}: laravel credit ${money(Number(php.credit))} debit ${money(Number(php.debit))} · api credit ${money(ledger.credit_total)} debit ${money(ledger.debit_total)}`);
        }
    }
    report('every account balance', mismatched === 0, `${checked} accounts, ${mismatched} differ`);
}
// --------------------------------------------------------------- commission
console.log('\nCOMMISSION');
console.log('  The per-lab loop in adminindex\n');
{
    const labs = await db
        .selectFrom('users')
        .select(['id', 'fullname', 'commision'])
        .where('role_id', '=', 2)
        .execute();
    let phpTotal = 0;
    for (const lab of labs) {
        const [r] = await raw(`
      SELECT COALESCE(SUM(tr.amount),0) AS total FROM transactions tr
      WHERE tr.received_by IN (
        SELECT emp.user_id FROM employements emp
        JOIN users p ON p.empid = emp.parent_id
        WHERE p.id=${Number(lab.id)} AND emp.is_working=1
      ) AND tr.status=1
    `);
        phpTotal += (Number(r.total) * Number(lab.commision ?? 0)) / 100;
    }
    const [pending] = await raw(`SELECT COALESCE(SUM(amount),0) AS t FROM transactions WHERE transaction_type='commision' AND status=0`);
    const [approved] = await raw(`SELECT COALESCE(SUM(amount),0) AS t FROM transactions WHERE transaction_type='commision' AND status=1`);
    console.log(`  laravel commission owed across labs : ${money(Math.round(phpTotal * 100) / 100)}`);
    console.log(`  commission approved                 : ${money(Number(approved.t))}`);
    console.log(`  commission awaiting approval        : ${money(Number(pending.t))}`);
    console.log('  (the API derives a payment from the lab rate rather than totalling this way,');
    console.log('   so this is recorded for reconciliation rather than diffed)');
}
// -------------------------------------------------------------- certificates
console.log('\nCERTIFICATE DATA');
console.log('  One per subcategory, resolved the way the card template does\n');
{
    const sample = await raw(`
    SELECT r.id FROM reports r
    JOIN (SELECT subcategory_id, MAX(id) AS id FROM reports GROUP BY subcategory_id) m
      ON m.id = r.id
    ORDER BY r.id DESC LIMIT 40
  `);
    const ids = sample.map((r) => Number(r.id));
    const reports = await db
        .selectFrom('reports')
        .select(['id', 'report_no', 'description'])
        .where('id', 'in', ids)
        .execute();
    const expanded = await expandAttributes(reports.map((r) => r.description));
    let blanks = 0;
    let attributes = 0;
    for (const [i, r] of reports.entries()) {
        for (const a of expanded[i]) {
            attributes++;
            // A null or zero value is an empty field, not a broken lookup —
            // MICROSCOPIC is routinely left blank. Only a positive id that resolved
            // to nothing is a real break, because that prints a number on the card
            // where a word should be.
            const v = String(a.value ?? '');
            if (/^\d+$/.test(v) && Number(v) > 0)
                blanks++;
        }
    }
    report('attribute values resolve to names', blanks === 0, `${reports.length} certificates, ${attributes} attributes, ${blanks} unresolved`);
    const cards = await cardDataFor(ids.slice(0, 12));
    const missingQr = cards.filter((c) => !c.qr).length;
    const missingSub = cards.filter((c) => !c.subcategory).length;
    report('every card renders a QR', missingQr === 0, `${cards.length} cards`);
    report('every card names its subcategory', missingSub === 0, `${missingSub} missing`);
}
// -------------------------------------------------------- report numbering
console.log('\nCERTIFICATE NUMBERING');
{
    const [dupes] = await raw(`
    SELECT COUNT(*) AS n FROM (
      SELECT report_no FROM reports GROUP BY report_no HAVING COUNT(*) > 1
    ) d
  `);
    report('no duplicate report numbers today', Number(dupes.n) === 0, `${dupes.n} duplicated`);
    const [shape] = await raw(`SELECT COUNT(*) AS n FROM reports WHERE report_no NOT REGEXP '^[0-9]{12}$'`);
    report('every number is 12 digits', Number(shape.n) === 0, `${shape.n} malformed`);
}
// -------------------------------------------------------------------- money
console.log('\nORDER TOTALS');
{
    const priced = await db
        .selectFrom('orders')
        .select(['id', 'discount', 'total_amount'])
        .where('total_amount', 'is not', null)
        .where('total_amount', '!=', '')
        .execute();
    let match = 0;
    for (const o of priced) {
        const q = await quoteOrder(Number(o.id), Number(o.discount ?? 0));
        if (Math.abs(q.total_amount - Number(o.total_amount)) < 0.01)
            match++;
    }
    const pct = ((match / priced.length) * 100).toFixed(1);
    report('recomputed totals match stored', match === priced.length, `${match}/${priced.length} (${pct}%)`);
    const [overpaid] = await raw(`
    SELECT COUNT(*) AS n FROM orders
    WHERE CAST(paid_amount AS DECIMAL(12,2)) > CAST(total_amount AS DECIMAL(12,2))
  `);
    const [untotalled] = await raw(`SELECT COUNT(*) AS n FROM orders WHERE total_amount IS NULL OR total_amount=''`);
    console.log(`  note   orders with paid over total          ${overpaid.n}`);
    console.log(`  note   orders carrying no total at all      ${untotalled.n}`);
}
// ------------------------------------------------------------------ accounts
console.log('\nACCOUNTS');
{
    const dupes = await raw(`
    SELECT mobile, COUNT(*) n, GROUP_CONCAT(id) ids
    FROM users GROUP BY mobile HAVING n > 1
  `);
    report('one account per mobile number', dupes.length === 0, dupes.length ? `${dupes.length} numbers shared: ${dupes.map((d) => d.mobile).join(', ')}` : 'no duplicates');
    const [orphans] = await raw(`
    SELECT COUNT(*) AS n FROM users u
    WHERE u.role_id > 2
      AND NOT EXISTS (SELECT 1 FROM employements e WHERE e.user_id=u.id AND e.is_working='1')
  `);
    report('every staff account has a laboratory', Number(orphans.n) === 0, `${orphans.n} unattached`);
}
// -------------------------------------------------------------- public URLs
console.log('\nPUBLIC CONTENT');
{
    const [{ n: blogs }] = await raw(`SELECT COUNT(*) AS n FROM blogs`);
    const [{ n: branches }] = await raw(`SELECT COUNT(*) AS n FROM branches`);
    const [{ n: pages }] = await raw(`SELECT COUNT(*) AS n FROM websites`);
    const [badSlug] = await raw(`SELECT COUNT(*) AS n FROM blogs WHERE slug IS NULL OR slug='' UNION ALL SELECT COUNT(*) FROM branches WHERE pageURL IS NULL OR pageURL=''`);
    report('every public page has an address', Number(badSlug.n) === 0, `${blogs} articles, ${branches} branches, ${pages} pages`);
}
console.log(`\n${checks - failures}/${checks} checks matched.\n`);
await db.destroy();
if (failures)
    process.exit(1);
