/**
 * Does commission still come out right on both sets of terms?
 *
 *   npm run check:commission
 *
 * `users.commision` is one number meaning two different things, and four
 * screens report money off it. This builds a laboratory with known orders,
 * reads the figure back both ways, and checks the arithmetic:
 *
 *   percent  ₹1,000 collected at 10%      → 100
 *   per_pc   7 pieces at ₹15 a piece      → 105
 *
 * The per-piece case is the one worth a check: the pieces come from
 * `order_details`, and joining that to `orders` repeats an order's
 * `paid_amount` once per line, so a single-query version of this quietly
 * doubles the collection of any order with two lines. The percentage case is
 * checked against that same two-line order for exactly that reason.
 *
 * Writes nothing that survives: the fixture is built inside a transaction that
 * is always rolled back, so this is safe against the production copy. Every
 * write goes through the transaction handle — a write through the pool handle
 * inside a transaction block is not in the transaction, and no rollback
 * reaches it.
 */
import { db } from '../db/index.js';
import { accruedByLab } from '../services/commission.service.js';
const ROLLBACK = 'rollback: the check is done';
let failures = 0;
const check = (label, got, want) => {
    const ok = Math.abs(got - want) < 0.005;
    if (!ok)
        failures += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(34)} ${got}${ok ? '' : ` (expected ${want})`}`);
};
try {
    await db.transaction().execute(async (trx) => {
        const lab = await trx
            .insertInto('users')
            .values({
            fullname: 'Commission check',
            mobile: `0000${Date.now() % 1000000}`,
            password: 'x',
            role_id: 2,
            is_active: 0,
            status: 0,
            commision: 10,
            commission_type: 'percent',
            created_at: new Date(),
            updated_at: new Date(),
        })
            .executeTakeFirstOrThrow();
        const labId = Number(lab.insertId);
        // One delivered order, ₹1,000 collected, on two lines of 3 and 4 pieces.
        const order = await trx
            .insertInto('orders')
            .values({
            lab_id: labId,
            customer_name: 'Check',
            mobile: '0000000000',
            order_no: `CHK${Date.now()}`,
            order_date: '2026-01-01',
            status: 'delivered',
            paid_amount: '1000',
            received_by: 1,
            created_at: new Date(),
            updated_at: new Date(),
        })
            .executeTakeFirstOrThrow();
        const orderId = Number(order.insertId);
        for (const qty of [3, 4]) {
            await trx
                .insertInto('order_details')
                .values({
                order_id: orderId,
                category_id: 1,
                qty,
                classic_card: 0,
                smart_card: 0,
                created_at: new Date(),
                updated_at: new Date(),
            })
                .execute();
        }
        console.log('commission accrual');
        check('percent, 10% of 1000', (await accruedByLab(labId, trx)).get(labId) ?? 0, 100);
        await trx
            .updateTable('users')
            .set({ commision: 15, commission_type: 'per_pc' })
            .where('id', '=', labId)
            .execute();
        check('per piece, 7 pieces at 15', (await accruedByLab(labId, trx)).get(labId) ?? 0, 105);
        // An undelivered order is not earned yet, on either set of terms.
        await trx.updateTable('orders').set({ status: 'pending' }).where('id', '=', orderId).execute();
        check('per piece, nothing delivered', (await accruedByLab(labId, trx)).get(labId) ?? 0, 0);
        throw new Error(ROLLBACK);
    });
}
catch (e) {
    if (e.message !== ROLLBACK)
        throw e;
}
await db.destroy();
console.log(failures === 0 ? '\nCommission reads correctly on both terms.' : `\n${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
