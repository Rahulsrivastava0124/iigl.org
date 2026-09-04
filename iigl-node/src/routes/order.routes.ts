import { sql } from 'kysely';
import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { conflict, notFound } from '../lib/errors.js';
import { paged, readPage, readSearch } from '../lib/paginate.js';
import { assertLabOwnership, requireLabScope, ROLE } from '../middleware/auth.js';
import { createOrder, live, liveJoined, updateOrder, validateOrderInput, validateUpdateOrderInput } from '../services/order.service.js';
import {
  deliverOrder,
  quoteOrder,
  settleAndDeliver,
  validateSettleInput,
} from '../services/pricing.service.js';
import { orderVisibility } from '../services/permission.service.js';
import { TRANSACTION_TYPE } from '../services/commission.service.js';
import { numericId, numericParams } from '../middleware/params.js';

export const orderRoutes = Router();
orderRoutes.use(requireLabScope);

/** Restricts a query to the caller's lab. Admins are unrestricted. */
function scopeToLab<Q extends { where: any }>(q: Q, user: Express.Request['user']): Q {
  if (user.roleId === ROLE.SUPER) return q;
  return q.where('orders.lab_id', '=', user.labId) as Q;
}

orderRoutes.get(
  '/',
  wrap(async (req, res) => {
    const p = readPage(req);
    const status = req.query.status ? String(req.query.status) : null;
    // The dues list: delivered, but not paid in full. Laravel calls this
    // EmpOrderDuesList and it is its own screen; here it is a filter.
    const duesOnly = req.query.dues === '1';

    let q = live(db.selectFrom('orders').selectAll());
    let c = live(db.selectFrom('orders').select(db.fn.countAll().as('n')));

    q = scopeToLab(q, req.user);
    c = scopeToLab(c, req.user);

    // Staff without product_collection view and create rights see only the
    // orders they took or were assigned, matching the Laravel behaviour.
    if ((await orderVisibility(req.user)) === 'own') {
      const me = req.user.id;
      const mine = (eb: any) =>
        eb.or([eb('received_by', '=', me), eb('assigned_to', '=', me)]);
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
      const owing = sql<boolean>`dues_amount + 0 > 0`;
      q = q.where('status', '=', 'delivered').where(owing);
      c = c.where('status', '=', 'delivered').where(owing);
    }

    const [rows, count] = await Promise.all([
      q.orderBy('id', 'desc').limit(p.limit).offset(p.offset).execute(),
      c.executeTakeFirstOrThrow(),
    ]);

    res.json(paged(await withCounts(rows), Number(count.n), p));
  }),
);

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
async function withCounts<T extends { id: number; assigned_to: number | null }>(
  rows: T[],
): Promise<
  (T & {
    total_items: number;
    total_reports: number;
    reports_generated: number;
    assigned_to_name: string | null;
  })[]
> {
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id);
  const assignees = [...new Set(rows.map((r) => r.assigned_to).filter((v): v is number => !!v))];

  const [lines, names] = await Promise.all([
    db
      .selectFrom('order_details')
      .select(['id', 'order_id', 'qty', 'smart_card', 'classic_card'])
      .where('order_id', 'in', ids)
      .execute(),
    assignees.length
      ? db.selectFrom('users').select(['id', 'fullname']).where('id', 'in', assignees).execute()
      : Promise.resolve([] as { id: number; fullname: string }[]),
  ]);

  // `reports.order_detail_id` is a varchar, so the ids handed to it have to be
  // strings — a numeric IN list matches nothing. The detail row is what ties a
  // certificate back to its order; `reports.order_no` holds the order id rather
  // than the order number and is not used for this.
  const reports = lines.length
    ? await db
        .selectFrom('reports')
        .select('order_detail_id')
        .where(
          'order_detail_id',
          'in',
          lines.map((l) => String(l.id)),
        )
        .execute()
    : [];

  const reportsPerLine = new Map<string, number>();
  for (const r of reports) {
    reportsPerLine.set(r.order_detail_id, (reportsPerLine.get(r.order_detail_id) ?? 0) + 1);
  }

  const totals = new Map<number, { items: number; ordered: number; generated: number }>();
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

orderRoutes.get(
  '/:id',
  numericId,
  wrap(async (req, res) => {
    const order = await live(db.selectFrom('orders').selectAll())
      .where('id', '=', Number(req.params.id))
      .executeTakeFirst();
    if (!order) throw notFound('Order not found.');
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
          .where(
            'order_detail_id',
            'in',
            items.map((i) => String(i.id)),
          )
          .execute()
      : [];

    /*
      What has been taken against this order, newest first.

      Paying and delivering are separate acts, so an order can be paid in parts
      over several visits: the columns on the order hold the running totals and
      say nothing about how they got there. This is how they got there.
    */
    const payments = await db
      .selectFrom('transactions')
      .leftJoin('users', 'users.id', 'transactions.received_by')
      .select([
        'transactions.id as id',
        'transactions.amount as amount',
        'transactions.pay_mode as pay_mode',
        'transactions.transaction_no as transaction_no',
        'transactions.created_at as created_at',
        'users.fullname as received_by_name',
      ])
      .where('transactions.order_id', '=', Number(order.id))
      .where('transactions.transaction_type', '=', TRANSACTION_TYPE.ORDER_COLLECTION)
      .orderBy('transactions.id', 'desc')
      .execute();

    res.json({ data: { ...order, items, reports, payments } });
  }),
);

/** Look up a returning customer by mobile, scoped to the caller's own lab. */
orderRoutes.get(
  '/customer/lookup',
  wrap(async (req, res) => {
    const mobile = String(req.query.mobile ?? '');
    if (!mobile) throw notFound('Provide a mobile number.');

    let q = live(db.selectFrom('orders'))
      .select(['customer_name', 'mobile', 'alt_mobile', 'email', 'gst', 'address'])
      .where((eb) => eb.or([eb('mobile', '=', mobile), eb('alt_mobile', '=', mobile)]));

    if (req.user.roleId !== ROLE.SUPER) q = q.where('lab_id', '=', req.user.labId);

    const row = await q.orderBy('id', 'desc').executeTakeFirst();
    res.json({ data: row ?? null });
  }),
);

orderRoutes.post(
  '/',
  wrap(async (req, res) => {
    const id = await createOrder(req.user, validateOrderInput(req.body));
    res.status(201).json({ data: { id } });
  }),
);

/**
 * Delete an order.
 *
 * New here: the Laravel panel could delete an order *line* — `DeleteDetail` —
 * and never the order, so this has no ported behaviour to match and its rules
 * are set below rather than recovered.
 *
 * **Nothing is removed.** `deleted_at` is stamped and the row stays where it
 * is, with its customer, its date and its lines — see migration 030. Every read
 * of `orders` goes through `live()` or `liveJoined()`, so the order is gone from
 * every list, count and sum, and the record of it having existed is not.
 *
 * That matters here more than in most tables: order numbers are sequential
 * within a month, so a removed row leaves a hole in the sequence that nobody
 * can account for afterwards. A stamped one is still there to be looked at.
 *
 * **Still refused once anything real points at it.** The schema carries no
 * foreign keys, and hiding a row does not make what points at it agree:
 *
 *   - A certificate is a document already in a customer's hands, with a number
 *     the public verification page must go on resolving. Hiding the order it
 *     was issued against leaves a live certificate against an order no screen
 *     will show.
 *   - A transaction is money that was counted. Hiding the order it was
 *     collected against takes the sale out of every total while leaving the
 *     collection in the wallet.
 *
 * A delivered order is refused for the same reason: it has been billed and
 * settled, and its figures are in the day's takings.
 *
 * There is no undelete on any screen. Clearing `deleted_at` restores the order
 * exactly, which is deliberate — the reversal exists, and it is a decision
 * somebody makes at the database rather than a button beside the list.
 */
orderRoutes.delete(
  '/:id',
  numericId,
  wrap(async (req, res) => {
    const orderId = Number(req.params.id);

    const order = await live(db.selectFrom('orders'))
      .select(['id', 'lab_id', 'status', 'order_no'])
      .where('id', '=', orderId)
      .executeTakeFirst();
    if (!order) throw notFound('Order not found.');
    assertLabOwnership(req.user, Number(order.lab_id));

    if (order.status === 'delivered') {
      throw conflict('This order has been delivered and settled. A settled order cannot be deleted.');
    }

    const lines = await db
      .selectFrom('order_details')
      .select('id')
      .where('order_id', '=', orderId)
      .execute();

    // `reports.order_detail_id` is a varchar, so the ids handed to it have to
    // be strings — a numeric IN list matches nothing and would report an order
    // as certificate-free when it is not.
    const certificates = lines.length
      ? await db
          .selectFrom('reports')
          .select(db.fn.countAll().as('n'))
          .where(
            'order_detail_id',
            'in',
            lines.map((l) => String(l.id)),
          )
          .executeTakeFirstOrThrow()
      : { n: 0 };

    if (Number(certificates.n) > 0) {
      throw conflict(
        `${certificates.n} certificate${Number(certificates.n) === 1 ? ' has' : 's have'} been issued against this order. Delete the certificates first, or leave the order in place.`,
      );
    }

    const payments = await db
      .selectFrom('transactions')
      .select(db.fn.countAll().as('n'))
      .where('order_id', '=', orderId)
      .executeTakeFirstOrThrow();

    if (Number(payments.n) > 0) {
      throw conflict('Money has been collected against this order, so it cannot be deleted.');
    }

    // The lines stay with the order. They describe nothing else, and an order
    // restored without them would be an order whose items had vanished.
    await db
      .updateTable('orders')
      .set({ deleted_at: new Date(), updated_at: new Date() })
      .where('id', '=', orderId)
      .execute();

    res.json({ ok: true });
  }),
);

orderRoutes.delete(
  '/items/:id',
  numericId,
  wrap(async (req, res) => {
    const item = await liveJoined(
      db
        .selectFrom('order_details')
        .innerJoin('orders', 'orders.id', 'order_details.order_id'),
    )
      .select(['order_details.id as id', 'orders.lab_id as lab_id'])
      .where('order_details.id', '=', Number(req.params.id))
      .executeTakeFirst();
    if (!item) throw notFound('Order item not found.');
    assertLabOwnership(req.user, Number(item.lab_id));

    await db.deleteFrom('order_details').where('id', '=', Number(item.id)).execute();
    res.json({ ok: true });
  }),
);

/** Price an order without changing it. Safe to call repeatedly. */
orderRoutes.get(
  '/:id/quote',
  numericId,
  wrap(async (req, res) => {
    const order = await live(db.selectFrom('orders'))
      .select(['id', 'lab_id', 'discount'])
      .where('id', '=', Number(req.params.id))
      .executeTakeFirst();
    if (!order) throw notFound('Order not found.');
    assertLabOwnership(req.user, Number(order.lab_id));

    /*
      The discount the caller is trying, or the one the order already carries.
      Defaulting to zero meant an order settled at a discount priced back at
      full rate the next time anybody opened it, and the balance owing jumped
      by the discount somebody had already given.
    */
    const discount =
      req.query.discount === undefined || req.query.discount === ''
        ? Number(order.discount ?? 0)
        : Number(req.query.discount);
    res.json({ data: await quoteOrder(Number(order.id), discount) });
  }),
);

/**
 * Take the money. Totals are computed from the price bands, never taken from
 * the request — the Laravel screen posts total_amount from the browser, so any
 * figure the client sends is stored as the bill.
 *
 * Delivering is `POST /:id/deliver` and is a separate act: a customer can pay
 * on account days before collecting, and an order can be handed over with dues
 * outstanding. Send `deliver: true` to do both in one press, which is what the
 * Laravel bill modal did.
 */
orderRoutes.post(
  '/:id/settle',
  numericId,
  wrap(async (req, res) => {
    const order = await live(db.selectFrom('orders'))
      .select(['id', 'lab_id', 'status'])
      .where('id', '=', Number(req.params.id))
      .executeTakeFirst();
    if (!order) throw notFound('Order not found.');
    assertLabOwnership(req.user, Number(order.lab_id));

    // Paying and delivering are two acts. `deliver` says whether this one is
    // both; the panel's Pay dialog sends false and hands over separately.
    const result = await settleAndDeliver(
      Number(order.id),
      req.user.id,
      validateSettleInput(req.body),
      req.body?.deliver === true,
    );

    res.json({ data: result });
  }),
);

/** Hand the order over. The money is settled separately, and may be owing. */
orderRoutes.post(
  '/:id/deliver',
  numericId,
  wrap(async (req, res) => {
    const order = await live(db.selectFrom('orders'))
      .select(['id', 'lab_id'])
      .where('id', '=', Number(req.params.id))
      .executeTakeFirst();
    if (!order) throw notFound('Order not found.');
    assertLabOwnership(req.user, Number(order.lab_id));

    res.json({ data: await deliverOrder(Number(order.id), req.user.id) });
  }),
);

/** Amend an order. Items already certified cannot be removed or shrunk below what was issued. */
orderRoutes.patch(
  '/:id',
  numericId,
  wrap(async (req, res) => {
    const order = await live(db.selectFrom('orders'))
      .select(['id', 'lab_id', 'status'])
      .where('id', '=', Number(req.params.id))
      .executeTakeFirst();
    if (!order) throw notFound('Order not found.');
    assertLabOwnership(req.user, Number(order.lab_id));

    await updateOrder(Number(order.id), validateUpdateOrderInput(req.body));

    const updated = await live(db.selectFrom('orders').selectAll())
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
  }),
);
