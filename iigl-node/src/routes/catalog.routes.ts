import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { badRequest, notFound } from '../lib/errors.js';
import { paged, readPage, readSearch } from '../lib/paginate.js';

export const catalogRoutes = Router();

catalogRoutes.get(
  '/categories',
  wrap(async (_req, res) => {
    const rows = await db
      .selectFrom('categories')
      .select(['id', 'name', 'description', 'short_description', 'banner', 'icon', 'unit'])
      .orderBy('name')
      .execute();
    res.json({ data: rows });
  }),
);

catalogRoutes.get(
  '/categories/:id/subcategories',
  wrap(async (req, res) => {
    const rows = await db
      .selectFrom('subcategories')
      .select(['id', 'name', 'description', 'banner', 'icon', 'category_id'])
      .where('category_id', '=', Number(req.params.id))
      .orderBy('name')
      .execute();
    res.json({ data: rows });
  }),
);

catalogRoutes.get(
  '/subcategories',
  wrap(async (_req, res) => {
    const rows = await db
      .selectFrom('subcategories')
      .select(['id', 'name', 'description', 'category_id'])
      .orderBy('name')
      .execute();
    res.json({ data: rows });
  }),
);

/**
 * Attributes under one column, ordered exactly as ReportController does:
 * MICROSCOPIC is forced last, everything else by order_no.
 */
const liveAttributes = (column: 'subcategory_id' | 'category_id') =>
  wrap(async (req, res) => {
    const rows = await db
      .selectFrom('attributes')
      .selectAll()
      .where(column, '=', Number(req.params.id))
      .where('is_deleted', '=', 0)
      .orderBy('order_no')
      .execute();

    rows.sort((a, b) => {
      const am = a.attr_name === 'MICROSCOPIC' ? 1 : 0;
      const bm = b.attr_name === 'MICROSCOPIC' ? 1 : 0;
      return am - bm || Number(a.order_no) - Number(b.order_no);
    });

    res.json({ data: rows });
  });

catalogRoutes.get('/subcategories/:id/attributes', liveAttributes('subcategory_id'));

/** Every attribute in a category, across all its subcategories. */
catalogRoutes.get('/categories/:id/attributes', liveAttributes('category_id'));

catalogRoutes.get(
  '/attributes/:id/values',
  wrap(async (req, res) => {
    const rows = await db
      .selectFrom('attribute_values')
      .select(['id', 'value_name', 'description', 'icon', 'attr_id'])
      .where('attr_id', '=', Number(req.params.id))
      .where('is_deleted', '=', 0)
      .orderBy('value_name')
      .execute();
    res.json({ data: rows });
  }),
);

/**
 * Attribute values across a branch of the catalogue, the list the Laravel
 * "Attributes Value List" screen showed.
 *
 * At least one of attr_id, subcategory_id or category_id is required: one
 * category alone holds 3,899 values, so an unfiltered list is a page nobody
 * can read and a query nobody should run. `attribute_values` carries both ids
 * itself, so narrowing costs no join.
 */
catalogRoutes.get(
  '/attribute-values',
  wrap(async (req, res) => {
    const filters = ['attr_id', 'subcategory_id', 'category_id'] as const;
    const applied = filters.filter((f) => req.query[f] !== undefined);
    if (applied.length === 0) throw badRequest('Filter by attribute, subcategory or category.');

    const page = readPage(req, 25);
    const search = readSearch(req, ['value_name']);

    let q = db.selectFrom('attribute_values').where('is_deleted', '=', 0);
    for (const f of applied) q = q.where(f, '=', Number(req.query[f]));
    if (search) q = q.where(search);

    const [rows, total] = await Promise.all([
      q
        .select(['id', 'value_name', 'description', 'icon', 'attr_id', 'subcategory_id', 'category_id'])
        .orderBy('value_name')
        .limit(page.limit)
        .offset(page.offset)
        .execute(),
      q.select(db.fn.countAll().as('n')).executeTakeFirst(),
    ]);

    res.json(paged(rows, Number(total?.n ?? 0), page));
  }),
);

catalogRoutes.get(
  '/units',
  wrap(async (_req, res) => {
    res.json({ data: await db.selectFrom('units').selectAll().execute() });
  }),
);

catalogRoutes.get(
  '/report-types',
  wrap(async (_req, res) => {
    const rows = await db
      .selectFrom('reporttypes')
      .select(['id', 'name', 'short_description', 'banner', 'icon'])
      .execute();
    res.json({ data: rows });
  }),
);

catalogRoutes.get(
  '/form-layouts/:categoryId',
  wrap(async (req, res) => {
    const rows = await db
      .selectFrom('formlayouts')
      .selectAll()
      .where('category_id', '=', Number(req.params.categoryId))
      .orderBy('label_order')
      .execute();
    if (!rows.length) throw notFound('No form layout for this category.');
    res.json({ data: rows });
  }),
);

/**
 * The attribute master list: an attribute name under a category, and the values
 * that attribute normally takes.
 *
 * The library the Add Value form is filled from — not values on anything. A
 * master value becomes a real `attribute_values` row only when somebody picks
 * it against a branch, and the two are unrelated from that moment on.
 *
 * Read here rather than under /admin because the form that offers the list is
 * open to whoever may add a value; only changing the library is head office's.
 * Narrowed by `category_id` when one is given, which is what the form does —
 * "Colour" under Diamond is not the same list as "Colour" under Gemstone.
 */
catalogRoutes.get(
  '/attribute-masters',
  wrap(async (req, res) => {
    let masters = db
      .selectFrom('attribute_masters')
      .select(['id', 'category_id', 'attr_name'])
      .orderBy('attr_name');

    const categoryId = Number(req.query.category_id);
    if (Number.isInteger(categoryId) && categoryId > 0) {
      masters = masters.where('category_id', '=', categoryId);
    }
    const rows = await masters.execute();
    if (!rows.length) return void res.json({ data: [] });

    // One query for every value rather than one per master: this is read on
    // every keystroke of the Add Value form's category filter.
    const values = await db
      .selectFrom('attribute_master_values')
      .select(['id', 'master_id', 'value_name'])
      .where(
        'master_id',
        'in',
        rows.map((r) => Number(r.id)),
      )
      .orderBy('order_no')
      .orderBy('id')
      .execute();

    const byMaster = new Map<number, { id: number; value_name: string }[]>();
    for (const v of values) {
      const list = byMaster.get(Number(v.master_id)) ?? [];
      list.push({ id: Number(v.id), value_name: String(v.value_name) });
      byMaster.set(Number(v.master_id), list);
    }

    res.json({
      data: rows.map((r) => ({
        id: Number(r.id),
        category_id: Number(r.category_id),
        attr_name: String(r.attr_name),
        values: byMaster.get(Number(r.id)) ?? [],
      })),
    });
  }),
);
