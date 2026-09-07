import { Router } from 'express';
import { db } from '../db/index.js';
import { sql } from 'kysely';
import { live } from '../services/order.service.js';
import { wrap } from '../lib/async.js';
import { paged, readPage, readSearch } from '../lib/paginate.js';
import { requireLabScope, ROLE } from '../middleware/auth.js';
import { badRequest } from '../lib/errors.js';
import { round2 } from '../lib/money.js';
import { orderVisibility } from '../services/permission.service.js';

/**
 * Customers.
 *
 * There is no customer table — a customer is whoever has placed an order, and
 * the record is the order itself. These are therefore views over `orders`,
 * grouped by mobile number, which is how the Laravel application does it.
 *
 * "Registered" means the customer supplied a GST number. That is the only
 * distinction the data draws.
 */
export const customerRoutes = Router();
customerRoutes.use(requireLabScope);

/** The scope a person may see, matching the order list. */
async function scope(user: Express.Request['user']) {
  if (user.roleId === ROLE.SUPER) return { kind: 'all' as const };
  if ((await orderVisibility(user)) === 'own') return { kind: 'own' as const, id: user.id };
  return { kind: 'lab' as const, id: user.labId };
}

/**
 * The customer list.
 *
 * `registered` is the GST distinction — the only one the data draws — and
 * `null` asks for both, which is head office's "All customers".
 */
async function customerList(
  user: Express.Request['user'],
  registered: boolean | null,
  limit: number,
  offset: number,
  search: ((eb: any) => any) | null = null,
) {
  const s = await scope(user);

  const base = () => {
    let q = live(db.selectFrom('orders'));
    if (s.kind === 'lab') q = q.where('lab_id', '=', s.id);
    if (s.kind === 'own') q = q.where('received_by', '=', s.id);
    // A GST number is what makes a customer "registered". Null asks for both.
    if (registered === true) q = q.where('gst', 'is not', null).where('gst', '!=', '');
    if (registered === false) q = q.where((eb) => eb.or([eb('gst', 'is', null), eb('gst', '=', '')]));
    // Applied before the grouping, so a match on any of a customer's orders
    // brings the customer back rather than only the row that matched.
    if (search) q = q.where(search);
    return q;
  };

  const [rows, count] = await Promise.all([
    base()
      /*
        Qualified with `orders.` throughout, because of the join below: `users`
        carries a mobile, an email and an address of its own, and an unqualified
        name is ambiguous the moment the two tables are in one query.
      */
      .select(({ fn }) => [
        'orders.mobile as mobile',
        fn.max('orders.customer_name').as('customer_name'),
        fn.max('orders.email').as('email'),
        fn.max('orders.gst').as('gst'),
        fn.max('orders.address').as('address'),
        fn.count('orders.id').as('orders'),
        fn.max('orders.order_date').as('last_order'),
        // What the customer has been billed and has paid, over every order
        // under the number. The list said how many orders and when the last one
        // was, which is the shape of the relationship and none of its size.
        fn.sum('orders.payable_amt').as('billed'),
        fn.sum('orders.paid_amount').as('paid'),
        /*
          Which laboratory the customer ordered from.

          Named rather than numbered, and every one of them: a mobile number is
          the only thing that groups these rows, and the same person can walk
          into two franchises. Head office is the reader that needs this — its
          list spans the network, and a customer with no laboratory beside them
          is a row it cannot act on.
        */
        sql<string>`GROUP_CONCAT(DISTINCT ${sql.ref('lab.fullname')} ORDER BY ${sql.ref('lab.fullname')} SEPARATOR ', ')`.as(
          'laboratories',
        ),
      ])
      .leftJoin('users as lab', 'lab.id', 'orders.lab_id')
      .groupBy('orders.mobile')
      .orderBy('orders', 'desc')
      .limit(limit)
      .offset(offset)
      .execute(),
    base()
      .select(({ fn }) => fn.countAll().as('n'))
      .groupBy('mobile')
      .execute(),
  ]);

  // Counting grouped rows needs the group count, not a row count.
  return {
    rows: rows.map((r) => {
      const billed = round2(Number(r.billed) || 0);
      const paid = round2(Number(r.paid) || 0);
      return {
        ...r,
        billed,
        paid,
        // Billed less paid, floored: an overpayment is change owed to the
        // customer, not a debt they still carry.
        due: round2(Math.max(0, billed - paid)),
      };
    }),
    total: count.length,
  };
}

customerRoutes.get(
  '/registered',
  wrap(async (req, res) => {
    const p = readPage(req);
    const search = readSearch(req, ['customer_name', 'mobile', 'email', 'gst']);
    const { rows, total } = await customerList(req.user, true, p.limit, p.offset, search);
    res.json(paged(rows, total, p));
  }),
);

/**
 * Everybody, registered or not.
 *
 * Head office's list spans the network and the GST split is not how it reads
 * it — "who has ordered from us" is one question, and answering it meant paging
 * two screens and adding them up. A laboratory may ask too; its own scope
 * applies either way.
 */
customerRoutes.get(
  '/all',
  wrap(async (req, res) => {
    const p = readPage(req);
    const search = readSearch(req, ['customer_name', 'mobile', 'email', 'gst']);
    const { rows, total } = await customerList(req.user, null, p.limit, p.offset, search);
    res.json(paged(rows, total, p));
  }),
);

customerRoutes.get(
  '/unregistered',
  wrap(async (req, res) => {
    const p = readPage(req);
    const search = readSearch(req, ['customer_name', 'mobile', 'email', 'gst']);
    const { rows, total } = await customerList(req.user, false, p.limit, p.offset, search);
    res.json(paged(rows, total, p));
  }),
);

/**
 * One customer's orders, and what they come to.
 *
 * Keyed by mobile number, because that is what a customer is here: there is no
 * customer table, and the list above groups the orders by it. Every order the
 * caller may see under that number comes back, newest first, with the four
 * figures the screen shows above them.
 *
 * The money is read from the orders rather than recomputed from the price
 * bands: this is a history of what was billed and collected, and re-pricing it
 * today would answer a different question — what the same work would cost now.
 * `paid` is the sum of the collections, which is what `orders.paid_amount`
 * holds once a payment is recorded against it.
 *
 * Scoped exactly as the customer list is, through the same `scope()`: a
 * laboratory sees its own orders, a team member may see only their own, and
 * head office sees them all. A mobile number is not a secret, but the orders
 * under it are somebody's business.
 */
customerRoutes.get(
  '/:mobile/orders',
  wrap(async (req, res) => {
    const mobile = String(req.params.mobile).trim();
    if (!mobile) throw badRequest('A mobile number is required.');

    const s = await scope(req.user);
    let q = live(db.selectFrom('orders')).where('mobile', '=', mobile);
    if (s.kind === 'lab') q = q.where('lab_id', '=', s.id);
    if (s.kind === 'own') q = q.where('received_by', '=', s.id);

    const orders = await q
      .select([
        'id',
        'order_no',
        'order_date',
        'delivery_date',
        'status',
        'customer_name',
        'payable_amt',
        'paid_amount',
        'dues_amount',
        'total_amount',
      ])
      .orderBy('id', 'desc')
      .execute();

    const sum = (pick: (o: (typeof orders)[number]) => unknown) =>
      round2(orders.reduce((total, o) => total + (Number(pick(o)) || 0), 0));

    const billed = sum((o) => o.payable_amt);
    const paid = sum((o) => o.paid_amount);

    res.json({
      data: {
        mobile,
        // The most recent spelling of the name: a customer who gave it twice is
        // two spellings, and the newest is the one they last confirmed.
        customer_name: orders[0]?.customer_name ?? null,
        orders,
        totals: {
          orders: orders.length,
          billed,
          paid,
          // From billed less paid rather than by summing `dues_amount`: that
          // column is written at settlement and says nothing about an order
          // billed and not yet paid at all.
          due: round2(Math.max(0, billed - paid)),
        },
      },
    });
  }),
);

/**
 * People who looked up a certificate on the public site. Kept in
 * `reportsearches` by the verification form, one row per lookup, so this
 * groups them by number.
 */
customerRoutes.get(
  '/verifiers',
  wrap(async (req, res) => {
    const p = readPage(req);
    const search = readSearch(req, ['fullname', 'mobile', 'report_no']);
    const base = () => {
      const q = db.selectFrom('reportsearches');
      return search ? q.where(search) : q;
    };

    const [rows, groups] = await Promise.all([
      base()
        .select(({ fn }) => [
          'mobile',
          fn.max('fullname').as('fullname'),
          fn.count('id').as('lookups'),
          fn.max('created_at').as('last_lookup'),
        ])
        .groupBy('mobile')
        .orderBy('lookups', 'desc')
        .limit(p.limit)
        .offset(p.offset)
        .execute(),
      base()
        .select(({ fn }) => fn.countAll().as('n'))
        .groupBy('mobile')
        .execute(),
    ]);

    res.json(paged(rows, groups.length, p));
  }),
);
