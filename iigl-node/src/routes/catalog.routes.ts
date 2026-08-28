import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { notFound } from '../lib/errors.js';

export const catalogRoutes = Router();

catalogRoutes.get(
  '/categories',
  wrap(async (_req, res) => {
    const rows = await db
      .selectFrom('categories')
      .select(['id', 'name', 'description', 'short_description', 'banner', 'icon'])
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
      .select(['id', 'name', 'category_id'])
      .orderBy('name')
      .execute();
    res.json({ data: rows });
  }),
);

/**
 * Attributes for a subcategory, ordered exactly as ReportController does:
 * MICROSCOPIC is forced last, everything else by order_no.
 */
catalogRoutes.get(
  '/subcategories/:id/attributes',
  wrap(async (req, res) => {
    const rows = await db
      .selectFrom('attributes')
      .selectAll()
      .where('subcategory_id', '=', Number(req.params.id))
      .where('is_deleted', '=', 0)
      .orderBy('order_no')
      .execute();

    rows.sort((a, b) => {
      const am = a.attr_name === 'MICROSCOPIC' ? 1 : 0;
      const bm = b.attr_name === 'MICROSCOPIC' ? 1 : 0;
      return am - bm || Number(a.order_no) - Number(b.order_no);
    });

    res.json({ data: rows });
  }),
);

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
