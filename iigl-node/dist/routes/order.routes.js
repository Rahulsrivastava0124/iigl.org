import { sql } from 'kysely';
import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { notFound } from '../lib/errors.js';
import { paged, readPage, readSearch } from '../lib/paginate.js';
import { assertLabOwnership, requireLabScope, ROLE } from '../middleware/auth.js';
import { createOrder, updateOrder, validateOrderInput, validateUpdateOrderInput, } from '../services/order.service.js';
import { quoteOrder, settleAndDeliver, validateSettleInput } from '../services/pricing.service.js';
import { orderVisibility } from '../services/permission.service.js';
import { numericId } from '../middleware/params.js';
export const orderRoutes = Router();
orderRoutes.use(requireLabScope);
/** Restricts a query to the caller's lab. Admins are unrestricted. */
function scopeToLab(q, user) {
    if (user.roleId === ROLE.SUPER)
        return q;
    return q.where('orders.lab_id', '=', user.labId);
}
orderRoutes.get('/', wrap(async (req, res) => {
    const p = readPage(req);
    const status = req.query.status ? String(req.query.status) : null;
    // The dues list: delivered, but not paid in full. Laravel calls this
    // EmpOrderDuesList and it is its own screen; here it is a filter.
    const duesOnly = req.query.dues === '1';
    let q = db.selectFrom('orders').selectAll();
    let c = db.selectFrom('orders').select(db.fn.countAll().as('n'));
    q = scopeToLab(q, req.user);
    c = scopeToLab(c, req.user);
    // Staff without product_collection view and create rights see only the
    // orders they took or were assigned, matching the Laravel behaviour.
    if ((await orderVisibility(req.user)) === 'own') {
        const me = req.user.id;
        const mine = (eb) => eb.or([eb('received_by', '=', me), eb('assigned_to', '=', me)]);
        q = q.where(mine);
        c = c.where(mine);
    }
    if (status) {
        q = q.where('status', '=', status);
        c = c.where('status', '=', status);
    }
    // Free-text search across the columns the list actually shows.
    const search = readSearch(req, ['order_no', 'customer_name', 'mobile']);
    if (search) {
        q = q.where(search);
        c = c.where(search);
    }
    if (duesOnly) {
        // dues_amount is a varchar. Comparing it as a string would put '100'
        // and '0.00' on the wrong side, so it is coerced the way MySQL coerces
        // it for the Laravel query this replaces.
        const owing = sql `dues_amount + 0 > 0`;
        q = q.where('status', '=', 'delivered').where(owing);
        c = c.where('status', '=', 'delivered').where(owing);
    }
    const [rows, count] = await Promise.all([
        q.orderBy('id', 'desc').limit(p.limit).offset(p.offset).execute(),
        c.executeTakeFirstOrThrow(),
    ]);
    res.json(paged(await withCounts(rows), Number(count.n), p));
}));
/**
 * The four columns the Laravel order list carried beside the money: how many
 * pieces the order is for, how many certificates it is owed, how many have been
 * written, and who it is with.
 *
 * `common/order/index.blade.php` computed these inside the row loop — five
 * queries per order and a sixth for the name. They are done here in three, over
 * the whole page at once, and folded onto the rows the list already has.
 *
 * A line can carry both card kinds, and where it does the blade counted its
 * quantity once for each. That is kept, for `total_reports` and for
 * `reports_generated` alike: these say what the order is billed for and how far
 * that is answered, not how many rows are involved.
 */
async function withCounts(rows) {
    if (!rows.length)
        return [];
    const ids = rows.map((r) => r.id);
    const assignees = [...new Set(rows.map((r) => r.assigned_to).filter((v) => !!v))];
    const [lines, names] = await Promise.all([
        db
            .selectFrom('order_details')
            .select(['id', 'order_id', 'qty', 'smart_card', 'classic_card'])
            .where('order_id', 'in', ids)
            .execute(),
        assignees.length
            ? db.selectFrom('users').select(['id', 'fullname']).where('id', 'in', assignees).execute()
            : Promise.resolve([]),
    ]);
    // `reports.order_detail_id` is a varchar, so the ids handed to it have to be
    // strings — a numeric IN list matches nothing. The detail row is what ties a
    // certificate back to its order; `reports.order_no` holds the order id rather
    // than the order number and is not used for this.
    const reports = lines.length
        ? await db
            .selectFrom('reports')
            .select('order_detail_id')
            .where('order_detail_id', 'in', lines.map((l) => String(l.id)))
            .execute()
        : [];
    const reportsPerLine = new Map();
    for (const r of reports) {
        reportsPerLine.set(r.order_detail_id, (reportsPerLine.get(r.order_detail_id) ?? 0) + 1);
    }
    const totals = new Map();
    for (const line of lines) {
        const kinds = line.smart_card + line.classic_card;
        const t = totals.get(line.order_id) ?? { items: 0, ordered: 0, generated: 0 };
        t.items += line.qty;
        t.ordered += line.qty * kinds;
        t.generated += (reportsPerLine.get(String(line.id)) ?? 0) * kinds;
        totals.set(line.order_id, t);
    }
    const nameById = new Map(names.map((u) => [u.id, u.fullname]));
    return rows.map((r) => {
        const t = totals.get(r.id);
        return {
            ...r,
            total_items: t?.items ?? 0,
            total_reports: t?.ordered ?? 0,
            reports_generated: t?.generated ?? 0,
            // Null rather than a crash when the order is with nobody. Laravel called
            // `User::find($order->assigned_to)->fullname` unguarded, which is a fatal
            // error on an unassigned order.
            assigned_to_name: r.assigned_to ? (nameById.get(r.assigned_to) ?? null) : null,
        };
    });
}
orderRoutes.get('/:id', numericId, wrap(async (req, res) => {
    const order = await db
        .selectFrom('orders')
        .selectAll()
        .where('id', '=', Number(req.params.id))
        .executeTakeFirst();
    if (!order)
        throw notFound('Order not found.');
    assertLabOwnership(req.user, Number(order.lab_id));
    // The category by name, not by id. The Laravel detail screen resolved it
    // with `Category::find($item->category_id)->name` per row; the panel had
    // nothing to resolve it with and was printing the number.
    const items = await db
        .selectFrom('order_details')
        .leftJoin('categories', 'categories.id', 'order_details.category_id')
        .selectAll('order_details')
        .select('categories.name as category_name')
        .where('order_details.order_id', '=', Number(order.id))
        .execute();
    // Reached through order_details.id — reports.order_no holds the order id,
    // not the order number, so joining on the number finds nothing.
    const reports = items.length
        ? await db
            .selectFrom('reports')
            .select(['id', 'report_no', 'order_detail_id'])
            .where('order_detail_id', 'in', items.map((i) => String(i.id)))
            .execute()
        : [];
    res.json({ data: { ...order, items, reports } });
}));
/** Look up a returning customer by mobile, scoped to the caller's own lab. */
orderRoutes.get('/customer/lookup', wrap(async (req, res) => {
    const mobile = String(req.query.mobile ?? '');
    if (!mobile)
        throw notFound('Provide a mobile number.');
    let q = db
        .selectFrom('orders')
        .select(['customer_name', 'mobile', 'alt_mobile', 'email', 'gst', 'address'])
        .where((eb) => eb.or([eb('mobile', '=', mobile), eb('alt_mobile', '=', mobile)]));
    if (req.user.roleId !== ROLE.SUPER)
        q = q.where('lab_id', '=', req.user.labId);
    const row = await q.orderBy('id', 'desc').executeTakeFirst();
    res.json({ data: row ?? null });
}));
orderRoutes.post('/', wrap(async (req, res) => {
    const id = await createOrder(req.user, validateOrderInput(req.body));
    res.status(201).json({ data: { id } });
}));
orderRoutes.delete('/items/:id', numericId, wrap(async (req, res) => {
    const item = await db
        .selectFrom('order_details')
        .innerJoin('orders', 'orders.id', 'order_details.order_id')
        .select(['order_details.id as id', 'orders.lab_id as lab_id'])
        .where('order_details.id', '=', Number(req.params.id))
        .executeTakeFirst();
    if (!item)
        throw notFound('Order item not found.');
    assertLabOwnership(req.user, Number(item.lab_id));
    await db.deleteFrom('order_details').where('id', '=', Number(item.id)).execute();
    res.json({ ok: true });
}));
/** Price an order without changing it. Safe to call repeatedly. */
orderRoutes.get('/:id/quote', numericId, wrap(async (req, res) => {
    const order = await db
        .selectFrom('orders')
        .select(['id', 'lab_id'])
        .where('id', '=', Number(req.params.id))
        .executeTakeFirst();
    if (!order)
        throw notFound('Order not found.');
    assertLabOwnership(req.user, Number(order.lab_id));
    const discount = req.query.discount ? Number(req.query.discount) : 0;
    res.json({ data: await quoteOrder(Number(order.id), discount) });
}));
/**
 * Settle and deliver. Totals are computed from the price bands, never taken
 * from the request — the Laravel screen posts total_amount from the browser,
 * so any figure the client sends is stored as the bill.
 */
orderRoutes.post('/:id/deliver', numericId, wrap(async (req, res) => {
    const order = await db
        .selectFrom('orders')
        .select(['id', 'lab_id', 'status'])
        .where('id', '=', Number(req.params.id))
        .executeTakeFirst();
    if (!order)
        throw notFound('Order not found.');
    assertLabOwnership(req.user, Number(order.lab_id));
    const result = await settleAndDeliver(Number(order.id), req.user.id, validateSettleInput(req.body));
    res.json({ data: result });
}));
/** Amend an order. Items already certified cannot be removed or shrunk below what was issued. */
orderRoutes.patch('/:id', numericId, wrap(async (req, res) => {
    const order = await db
        .selectFrom('orders')
        .select(['id', 'lab_id', 'status'])
        .where('id', '=', Number(req.params.id))
        .executeTakeFirst();
    if (!order)
        throw notFound('Order not found.');
    assertLabOwnership(req.user, Number(order.lab_id));
    await updateOrder(Number(order.id), validateUpdateOrderInput(req.body));
    const updated = await db
        .selectFrom('orders')
        .selectAll()
        .where('id', '=', Number(order.id))
        .executeTakeFirstOrThrow();
    // The category by name, not by id. The Laravel detail screen resolved it
    // with `Category::find($item->category_id)->name` per row; the panel had
    // nothing to resolve it with and was printing the number.
    const items = await db
        .selectFrom('order_details')
        .leftJoin('categories', 'categories.id', 'order_details.category_id')
        .selectAll('order_details')
        .select('categories.name as category_name')
        .where('order_details.order_id', '=', Number(order.id))
        .execute();
    res.json({ data: { ...updated, items } });
}));
