import { Router } from 'express';
import { db } from '../db/index.js';
import { live } from '../services/order.service.js';
import { wrap } from '../lib/async.js';
import { paged, readPage, readSearch } from '../lib/paginate.js';
import { requireLabScope, ROLE } from '../middleware/auth.js';
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

async function customerList(
  user: Express.Request['user'],
  registered: boolean,
  limit: number,
  offset: number,
  search: ((eb: any) => any) | null = null,
) {
  const s = await scope(user);

  const base = () => {
    let q = live(db.selectFrom('orders'));
    if (s.kind === 'lab') q = q.where('lab_id', '=', s.id);
    if (s.kind === 'own') q = q.where('received_by', '=', s.id);
    // A GST number is what makes a customer "registered".
    q = registered
      ? q.where('gst', 'is not', null).where('gst', '!=', '')
      : q.where((eb) => eb.or([eb('gst', 'is', null), eb('gst', '=', '')]));
    // Applied before the grouping, so a match on any of a customer's orders
    // brings the customer back rather than only the row that matched.
    if (search) q = q.where(search);
    return q;
  };

  const [rows, count] = await Promise.all([
    base()
      .select(({ fn }) => [
        'mobile',
        fn.max('customer_name').as('customer_name'),
        fn.max('email').as('email'),
        fn.max('gst').as('gst'),
        fn.max('address').as('address'),
        fn.count('id').as('orders'),
        fn.max('order_date').as('last_order'),
      ])
      .groupBy('mobile')
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
  return { rows, total: count.length };
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
