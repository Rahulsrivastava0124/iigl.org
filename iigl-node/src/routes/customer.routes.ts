import { Router } from 'express';
import { db } from '../db/index.js';
import { sql } from 'kysely';
import { live } from '../services/order.service.js';
import { wrap } from '../lib/async.js';
import { paged, readPage, readSearch } from '../lib/paginate.js';
import { requireLabScope, ROLE } from '../middleware/auth.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { numericId } from '../middleware/params.js';
import { round2 } from '../lib/money.js';
import { orderVisibility } from '../services/permission.service.js';
import { isHeadOffice, requirePermission } from '../services/permission.service.js';

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
  // Head office, and its staff with Customers → View, read the whole network.
  if (await isHeadOffice(user)) return { kind: 'all' as const };
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
  requirePermission('customer', 'view'),
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
  requirePermission('customer', 'view'),
  wrap(async (req, res) => {
    const p = readPage(req);
    const search = readSearch(req, ['customer_name', 'mobile', 'email', 'gst']);
    const { rows, total } = await customerList(req.user, null, p.limit, p.offset, search);
    res.json(paged(rows, total, p));
  }),
);

customerRoutes.get(
  '/unregistered',
  requirePermission('customer', 'view'),
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
  requirePermission('customer', 'view'),
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

// ------------------------------------------------------ registered accounts

/** How a category discount is expressed: a share of the price, or rupees off each piece. */
const DISCOUNT_TYPES = new Set(['percent', 'per_pc']);

interface DiscountInput {
  category_id: number;
  discount_type: 'percent' | 'per_pc';
  value: number;
}

/**
 * The discounts a form sent, checked.
 *
 * A category given twice keeps its last value rather than being refused: the
 * form's "apply to all" writes every row and a person may then correct one,
 * and both of those are the same category said twice on purpose. A zero is
 * dropped, because "no discount" is the absence of a row and not a row of 0.
 */
function readDiscounts(given: unknown): DiscountInput[] {
  if (given === undefined || given === null) return [];
  if (!Array.isArray(given)) throw badRequest('Send the discounts as a list.');
  const byCategory = new Map<number, DiscountInput>();
  for (const raw of given as Record<string, unknown>[]) {
    const categoryId = Number(raw?.category_id);
    if (!Number.isInteger(categoryId) || categoryId <= 0) throw badRequest('A discount needs a category.');
    const type = String(raw?.discount_type ?? 'percent');
    if (!DISCOUNT_TYPES.has(type)) throw badRequest('A discount is "percent" or "per_pc".');
    const value = Number(raw?.value ?? 0);
    if (!Number.isFinite(value) || value < 0) throw badRequest('A discount cannot be negative.');
    // A percentage over 100 is a typo for a rupee amount, and honouring it would
    // bill a customer less than nothing.
    if (type === 'percent' && value > 100) throw badRequest('A percentage discount cannot be over 100.');
    if (value === 0) {
      byCategory.delete(categoryId);
      continue;
    }
    byCategory.set(categoryId, {
      category_id: categoryId,
      discount_type: type as DiscountInput['discount_type'],
      value: round2(value),
    });
  }
  return [...byCategory.values()];
}

/** Text that may be left blank, stored as NULL rather than the empty string. */
const optional = (v: unknown) => {
  const t = String(v ?? '').trim();
  return t === '' ? null : t;
};

const required = (v: unknown, label: string) => {
  const t = String(v ?? '').trim();
  if (!t) throw badRequest(`${label} is required.`);
  return t;
};

/**
 * What this customer wants printed on their certificates.
 *
 * The same four fields an order carries, under the same names, so a later order
 * can take them as a straight copy. Switched off, the value that depends on the
 * switch is cleared rather than kept: a name or a file left behind a "no" is one
 * somebody switches back on months later and prints without looking at.
 */
function cardDisplay(body: Record<string, unknown> | undefined) {
  const on = (v: unknown) => (v === true || v === 1 || v === '1' ? 1 : 0);
  const showName = on(body?.show_name_in_card);
  const showImage = on(body?.show_image_in_card);
  return {
    show_name_in_card: showName,
    show_name_input: showName ? optional(body?.show_name_input) : null,
    show_image_in_card: showImage,
    show_image_in_card_file: showImage ? optional(body?.show_image_in_card_file) : null,
  };
}

/**
 * Which laboratory a new account belongs to.
 *
 * A laboratory registers its own customers and its staff register them for it,
 * so for both the session already says. Head office — and its staff with
 * Customers → Add — may name one, or none: a customer with no laboratory is
 * head office's own (migration 053), and only head office sees it.
 */
async function owningLab(user: Express.Request['user'], given: unknown): Promise<number | null> {
  if (await isHeadOffice(user)) {
    if (given === undefined || given === null || given === '') return null;
    const id = Number(given);
    if (!Number.isInteger(id) || id <= 0) throw badRequest('That is not a laboratory.');
    return id;
  }
  if (!user.labId) throw forbidden('This account does not belong to a laboratory.');
  return Number(user.labId);
}

/** Loads one account the caller may act on, or refuses. */
async function accountFor(user: Express.Request['user'], id: number) {
  const row = await db.selectFrom('registered_customers').selectAll().where('id', '=', id).executeTakeFirst();
  if (!row) throw notFound('Customer not found.');
  if (!(await isHeadOffice(user)) && Number(row.lab_id) !== Number(user.labId)) {
    throw forbidden('That customer belongs to another laboratory.');
  }
  return row;
}

async function writeDiscounts(customerId: number, discounts: DiscountInput[], trx: typeof db) {
  await trx.deleteFrom('customer_category_discounts').where('customer_id', '=', customerId).execute();
  if (!discounts.length) return;
  const now = new Date();
  await trx
    .insertInto('customer_category_discounts')
    .values(discounts.map((d) => ({ customer_id: customerId, ...d, created_at: now, updated_at: now })))
    .execute();
}

/**
 * The Registered list: every stored account, and every order-derived GST
 * customer who has no account yet.
 *
 * Two sources because both are real. A customer registered this morning has no
 * order to be found by, and the customers who gave a GST number on an order
 * before this screen existed have no record — dropping either would make the
 * list lie in a different direction. They are matched on mobile, which is what
 * every other customer screen already groups by.
 *
 * ponytail: merged in memory, which is fine for a franchise's trade customers
 * (dozens to low thousands). If a single scope passes ~20k registered customers
 * this wants to become one UNION query paginated in SQL.
 */
customerRoutes.get(
  '/accounts',
  requirePermission('customer', 'view'),
  wrap(async (req, res) => {
    const p = readPage(req);
    const term = String(req.query.q ?? '').trim().toLowerCase();

    let stored = db.selectFrom('registered_customers').selectAll();
    if (!(await isHeadOffice(req.user))) stored = stored.where('lab_id', '=', Number(req.user.labId));
    const accounts = await stored.orderBy('company_name').execute();

    const [discounts, derived] = await Promise.all([
      accounts.length
        ? db
            .selectFrom('customer_category_discounts')
            .select(['customer_id', 'category_id', 'discount_type', 'value'])
            .where('customer_id', 'in', accounts.map((a) => Number(a.id)))
            .execute()
        : Promise.resolve([]),
      customerList(req.user, true, 20_000, 0),
    ]);

    const discountsOf = new Map<number, { category_id: number; discount_type: string; value: number }[]>();
    for (const d of discounts) {
      const list = discountsOf.get(Number(d.customer_id)) ?? [];
      list.push({ category_id: Number(d.category_id), discount_type: String(d.discount_type), value: Number(d.value) });
      discountsOf.set(Number(d.customer_id), list);
    }
    const statsOf = new Map(derived.rows.map((r) => [String(r.mobile), r]));
    const registeredMobiles = new Set(accounts.map((a) => String(a.mobile)));

    const rows = [
      ...accounts.map((a) => {
        const s = statsOf.get(String(a.mobile));
        return {
          account_id: Number(a.id),
          company_name: a.company_name,
          owner_name: a.owner_name,
          customer_name: s?.customer_name ?? null,
          mobile: a.mobile,
          email: a.email,
          city: a.city,
          gst: a.gst_no,
          lab_id: a.lab_id === null ? null : Number(a.lab_id),
          laboratories: s?.laboratories ?? null,
          orders: Number(s?.orders ?? 0),
          billed: s?.billed ?? 0,
          paid: s?.paid ?? 0,
          due: s?.due ?? 0,
          last_order: s?.last_order ?? null,
          discounts: discountsOf.get(Number(a.id)) ?? [],
          show_on_site: Number(a.show_on_site) === 1,
        };
      }),
      // Order-derived GST customers not yet given a record. No terms, because
      // nobody has set any; they can be registered from here.
      ...derived.rows
        .filter((r) => !registeredMobiles.has(String(r.mobile)))
        .map((r) => ({
          account_id: null,
          company_name: null,
          owner_name: null,
          customer_name: r.customer_name,
          mobile: r.mobile,
          email: r.email,
          city: null,
          gst: r.gst,
          lab_id: null,
          laboratories: r.laboratories,
          orders: Number(r.orders ?? 0),
          billed: r.billed,
          paid: r.paid,
          due: r.due,
          last_order: r.last_order,
          discounts: [],
          // No record yet, so nothing for the website to show.
          show_on_site: null,
        })),
    ];

    const matched = term
      ? rows.filter((r) =>
          [r.company_name, r.owner_name, r.customer_name, r.mobile, r.email, r.city, r.gst]
            .some((v) => v != null && String(v).toLowerCase().includes(term)),
        )
      : rows;

    res.json(paged(matched.slice(p.offset, p.offset + p.limit), matched.length, p));
  }),
);

customerRoutes.get(
  '/accounts/:id',
  requirePermission('customer', 'view'),
  numericId,
  wrap(async (req, res) => {
    const account = await accountFor(req.user, Number(req.params.id));
    const discounts = await db
      .selectFrom('customer_category_discounts')
      .select(['category_id', 'discount_type', 'value'])
      .where('customer_id', '=', Number(account.id))
      .execute();
    res.json({
      data: {
        ...account,
        discounts: discounts.map((d) => ({ category_id: Number(d.category_id), discount_type: d.discount_type, value: Number(d.value) })),
      },
    });
  }),
);

customerRoutes.post(
  '/accounts',
  requirePermission('customer', 'create'),
  wrap(async (req, res) => {
    const labId = await owningLab(req.user, req.body?.lab_id);
    const mobile = required(req.body?.mobile, 'Contact No.');
    if (!/^\d{10}$/.test(mobile)) throw badRequest('Contact No. must be ten digits.');

    const values = {
      lab_id: labId,
      company_name: required(req.body?.company_name, 'Company Name'),
      owner_name: required(req.body?.owner_name, 'Owner Name'),
      mobile,
      email: optional(req.body?.email),
      area: optional(req.body?.area),
      city: optional(req.body?.city),
      state: optional(req.body?.state),
      logo: optional(req.body?.logo),
      // Registered has always meant a GST number here; a registered customer
      // without one is the first row that would break that.
      gst_no: required(req.body?.gst_no, 'GST No.').toUpperCase(),
      ...cardDisplay(req.body),
    };
    const discounts = readDiscounts(req.body?.discounts);

    // `lab_id = NULL` matches nothing, and the unique key lets NULLs repeat, so
    // head office's own customers are checked with IS NULL.
    const clash = await db
      .selectFrom('registered_customers')
      .select('id')
      .where('lab_id', labId === null ? 'is' : '=', labId)
      .where('mobile', '=', mobile)
      .executeTakeFirst();
    if (clash) {
      throw conflict(
        labId === null
          ? 'That contact number is already one of head office’s registered customers.'
          : 'That contact number is already a registered customer of this laboratory.',
      );
    }

    const id = await db.transaction().execute(async (trx) => {
      const now = new Date();
      const result = await trx
        .insertInto('registered_customers')
        .values({ ...values, created_by: req.user.id, created_at: now, updated_at: now })
        .executeTakeFirst();
      const id = Number(result.insertId);
      await writeDiscounts(id, discounts, trx as typeof db);
      return id;
    });

    res.status(201).json({ data: { id } });
  }),
);

customerRoutes.patch(
  '/accounts/:id',
  requirePermission('customer', 'update'),
  numericId,
  wrap(async (req, res) => {
    const account = await accountFor(req.user, Number(req.params.id));
    const patch: Record<string, unknown> = { updated_at: new Date() };

    if (req.body?.company_name !== undefined) patch.company_name = required(req.body.company_name, 'Company Name');
    if (req.body?.owner_name !== undefined) patch.owner_name = required(req.body.owner_name, 'Owner Name');
    if (req.body?.email !== undefined) patch.email = optional(req.body.email);
    if (req.body?.city !== undefined) patch.city = optional(req.body.city);
    if (req.body?.area !== undefined) patch.area = optional(req.body.area);
    if (req.body?.state !== undefined) patch.state = optional(req.body.state);
    if (req.body?.logo !== undefined) patch.logo = optional(req.body.logo);
    // Whether the website's Our Registered Customers section lists them.
    if (req.body?.show_on_site !== undefined) {
      if (typeof req.body.show_on_site !== 'boolean') throw badRequest('show_on_site must be true or false.');
      patch.show_on_site = req.body.show_on_site ? 1 : 0;
    }
    if (req.body?.gst_no !== undefined) patch.gst_no = required(req.body.gst_no, 'GST No.').toUpperCase();
    // Each switch travels with the value it governs, so a pair is only ever
    // written together and never half-updated.
    if (req.body?.show_name_in_card !== undefined) {
      const c = cardDisplay(req.body);
      patch.show_name_in_card = c.show_name_in_card;
      patch.show_name_input = c.show_name_input;
    }
    if (req.body?.show_image_in_card !== undefined) {
      const c = cardDisplay(req.body);
      patch.show_image_in_card = c.show_image_in_card;
      patch.show_image_in_card_file = c.show_image_in_card_file;
    }
    if (req.body?.mobile !== undefined) {
      const mobile = required(req.body.mobile, 'Contact No.');
      if (!/^\d{10}$/.test(mobile)) throw badRequest('Contact No. must be ten digits.');
      const clash = await db
        .selectFrom('registered_customers')
        .select('id')
        .where('lab_id', account.lab_id === null ? 'is' : '=', account.lab_id)
        .where('mobile', '=', mobile)
        .where('id', '!=', Number(account.id))
        .executeTakeFirst();
      if (clash) throw conflict('That contact number is already a registered customer of this laboratory.');
      patch.mobile = mobile;
    }

    await db.transaction().execute(async (trx) => {
      await trx.updateTable('registered_customers').set(patch as never).where('id', '=', Number(account.id)).execute();
      // Absent leaves the terms alone; a list replaces them whole.
      if (req.body?.discounts !== undefined) {
        await writeDiscounts(Number(account.id), readDiscounts(req.body.discounts), trx as typeof db);
      }
    });

    res.json({ ok: true });
  }),
);

customerRoutes.delete(
  '/accounts/:id',
  requirePermission('customer', 'delete'),
  numericId,
  wrap(async (req, res) => {
    const account = await accountFor(req.user, Number(req.params.id));
    // The record and its terms. The customer's orders are untouched: they are
    // the order history, and removing the registration does not unbill anybody.
    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom('customer_category_discounts').where('customer_id', '=', Number(account.id)).execute();
      await trx.deleteFrom('registered_customers').where('id', '=', Number(account.id)).execute();
    });
    res.json({ ok: true });
  }),
);
