import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { requireAdmin } from '../middleware/auth.js';
import { numericId } from '../middleware/params.js';

/**
 * Catalogue and pricing administration.
 *
 * Reading these is open to every laboratory through /api/catalog; changing them
 * is administrator-only, which is why they live here rather than alongside the
 * read routes.
 */
export const adminRoutes = Router();
adminRoutes.use(requireAdmin);

const text = (v: unknown): string | null => (v == null || v === '' ? null : String(v));

const requireText = (v: unknown, field: string): string => {
  if (v == null || String(v).trim() === '') throw badRequest(`${field} is required.`);
  return String(v).trim();
};

const flag = (v: unknown): number => (v ? 1 : 0);

const positive = (v: unknown, field: string): number => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw badRequest(`${field} must be a number of zero or more.`);
  return n;
};

// ---------------------------------------------------------------- categories

adminRoutes.post(
  '/categories',
  wrap(async (req, res) => {
    const name = requireText(req.body?.name, 'Name');

    const clash = await db
      .selectFrom('categories')
      .select('id')
      .where('name', '=', name)
      .executeTakeFirst();
    if (clash) throw conflict(`A category called ${name} already exists.`);

    const result = await db
      .insertInto('categories')
      .values({
        name,
        // NOT NULL with no default. Holds a units.id — 1 carat, 5 gram — and
        // exists in production but in no migration file.
        unit: String(positive(req.body?.unit, 'Weight unit')),
        description: text(req.body?.description),
        short_description: text(req.body?.short_description),
        banner: text(req.body?.banner),
        icon: text(req.body?.icon),
        added_by: req.user.id,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .executeTakeFirst();

    res.status(201).json({ data: { id: Number(result.insertId) } });
  }),
);

adminRoutes.patch(
  '/categories/:id',
  numericId,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const row = await db.selectFrom('categories').select('id').where('id', '=', id).executeTakeFirst();
    if (!row) throw notFound('Category not found.');

    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (req.body?.name !== undefined) patch.name = requireText(req.body.name, 'Name');
    if (req.body?.unit !== undefined) patch.unit = String(positive(req.body.unit, 'Weight unit'));
    for (const key of ['description', 'short_description', 'banner', 'icon'] as const) {
      if (req.body?.[key] !== undefined) patch[key] = text(req.body[key]);
    }
    if (Object.keys(patch).length === 1) throw badRequest('Nothing to update.');

    await db.updateTable('categories').set(patch as never).where('id', '=', id).execute();
    res.json({ ok: true });
  }),
);

// ------------------------------------------------------------- subcategories

adminRoutes.post(
  '/subcategories',
  wrap(async (req, res) => {
    const name = requireText(req.body?.name, 'Name');
    const categoryId = positive(req.body?.category_id, 'Category');

    const clash = await db
      .selectFrom('subcategories')
      .select('id')
      .where('name', '=', name)
      .executeTakeFirst();
    if (clash) throw conflict(`A subcategory called ${name} already exists.`);

    const result = await db
      .insertInto('subcategories')
      .values({
        name,
        category_id: categoryId,
        // NOT NULL in the live schema, with no default.
        description: text(req.body?.description) ?? '',
        banner: text(req.body?.banner) ?? '',
        icon: text(req.body?.icon) ?? '',
        added_by: req.user.id,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .executeTakeFirst();

    res.status(201).json({ data: { id: Number(result.insertId) } });
  }),
);

adminRoutes.patch(
  '/subcategories/:id',
  numericId,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const row = await db.selectFrom('subcategories').select('id').where('id', '=', id).executeTakeFirst();
    if (!row) throw notFound('Subcategory not found.');

    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (req.body?.name !== undefined) patch.name = requireText(req.body.name, 'Name');
    if (req.body?.category_id !== undefined) patch.category_id = positive(req.body.category_id, 'Category');
    for (const key of ['description', 'banner', 'icon'] as const) {
      if (req.body?.[key] !== undefined) patch[key] = text(req.body[key]) ?? '';
    }
    if (Object.keys(patch).length === 1) throw badRequest('Nothing to update.');

    await db.updateTable('subcategories').set(patch as never).where('id', '=', id).execute();
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------- attributes

adminRoutes.post(
  '/attributes',
  wrap(async (req, res) => {
    const result = await db
      .insertInto('attributes')
      .values({
        attr_name: requireText(req.body?.attr_name, 'Attribute name'),
        category_id: positive(req.body?.category_id, 'Category'),
        subcategory_id: positive(req.body?.subcategory_id, 'Subcategory'),
        show_in_smart_card: flag(req.body?.show_in_smart_card),
        show_in_classic_card: flag(req.body?.show_in_classic_card),
        show_description: flag(req.body?.show_description),
        show_image: flag(req.body?.show_image),
        is_opensource: flag(req.body?.is_opensource),
        is_required: flag(req.body?.is_required),
        order_no: Number(req.body?.order_no) || 0,
        is_deleted: 0,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .executeTakeFirst();

    res.status(201).json({ data: { id: Number(result.insertId) } });
  }),
);

adminRoutes.patch(
  '/attributes/:id',
  numericId,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const row = await db.selectFrom('attributes').select('id').where('id', '=', id).executeTakeFirst();
    if (!row) throw notFound('Attribute not found.');

    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (req.body?.attr_name !== undefined) patch.attr_name = requireText(req.body.attr_name, 'Attribute name');
    if (req.body?.order_no !== undefined) patch.order_no = Number(req.body.order_no) || 0;
    // An attribute can be moved between subcategories. Certificates already
    // issued keep the values they stored against this id — the move only
    // changes which form the field appears on from here on.
    if (req.body?.category_id !== undefined) patch.category_id = positive(req.body.category_id, 'Category');
    if (req.body?.subcategory_id !== undefined)
      patch.subcategory_id = positive(req.body.subcategory_id, 'Subcategory');
    for (const key of [
      'show_in_smart_card',
      'show_in_classic_card',
      'show_description',
      'show_image',
      'is_opensource',
      'is_required',
    ] as const) {
      if (req.body?.[key] !== undefined) patch[key] = flag(req.body[key]);
    }
    if (Object.keys(patch).length === 1) throw badRequest('Nothing to update.');

    await db.updateTable('attributes').set(patch as never).where('id', '=', id).execute();
    res.json({ ok: true });
  }),
);

/**
 * Retire an attribute. Soft delete only: 22,103 certificates hold attribute ids
 * inside reports.description, and removing the row would render those cards
 * with a blank field.
 */
adminRoutes.delete(
  '/attributes/:id',
  numericId,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const row = await db.selectFrom('attributes').select('id').where('id', '=', id).executeTakeFirst();
    if (!row) throw notFound('Attribute not found.');

    await db
      .updateTable('attributes')
      .set({ is_deleted: 1, updated_at: new Date() })
      .where('id', '=', id)
      .execute();

    res.json({ ok: true, note: 'Retired. Existing certificates keep their values.' });
  }),
);

// ---------------------------------------------------------- attribute values

adminRoutes.post(
  '/attribute-values',
  wrap(async (req, res) => {
    const attrId = positive(req.body?.attr_id, 'Attribute');
    const valueName = requireText(req.body?.value_name, 'Value');

    const attr = await db
      .selectFrom('attributes')
      .select(['id', 'category_id', 'subcategory_id'])
      .where('id', '=', attrId)
      .executeTakeFirst();
    if (!attr) throw badRequest('That attribute does not exist.');

    const clash = await db
      .selectFrom('attribute_values')
      .select('id')
      .where('attr_id', '=', attrId)
      .where('value_name', '=', valueName)
      .executeTakeFirst();
    if (clash) throw conflict(`${valueName} is already a value for this attribute.`);

    const result = await db
      .insertInto('attribute_values')
      .values({
        attr_id: attrId,
        value_name: valueName,
        category_id: Number(attr.category_id),
        subcategory_id: Number(attr.subcategory_id),
        description: text(req.body?.description),
        icon: text(req.body?.icon),
        is_deleted: 0,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .executeTakeFirst();

    res.status(201).json({ data: { id: Number(result.insertId) } });
  }),
);

adminRoutes.patch(
  '/attribute-values/:id',
  numericId,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const row = await db.selectFrom('attribute_values').select('id').where('id', '=', id).executeTakeFirst();
    if (!row) throw notFound('Attribute value not found.');

    const patch: Record<string, unknown> = { updated_at: new Date() };
    if (req.body?.value_name !== undefined) patch.value_name = requireText(req.body.value_name, 'Value');
    for (const key of ['description', 'icon'] as const) {
      if (req.body?.[key] !== undefined) patch[key] = text(req.body[key]);
    }

    // A value can be moved to another attribute. Its category and subcategory
    // are denormalised copies of that attribute's, so they move with it —
    // leaving them behind would file the value under a branch it no longer
    // belongs to, which is what the list endpoint filters on.
    if (req.body?.attr_id !== undefined) {
      const attr = await db
        .selectFrom('attributes')
        .select(['id', 'category_id', 'subcategory_id'])
        .where('id', '=', positive(req.body.attr_id, 'Attribute'))
        .executeTakeFirst();
      if (!attr) throw badRequest('That attribute does not exist.');
      patch.attr_id = Number(attr.id);
      patch.category_id = Number(attr.category_id);
      patch.subcategory_id = Number(attr.subcategory_id);
    }
    if (Object.keys(patch).length === 1) throw badRequest('Nothing to update.');

    await db.updateTable('attribute_values').set(patch as never).where('id', '=', id).execute();
    res.json({ ok: true });
  }),
);

adminRoutes.delete(
  '/attribute-values/:id',
  numericId,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const row = await db.selectFrom('attribute_values').select('id').where('id', '=', id).executeTakeFirst();
    if (!row) throw notFound('Attribute value not found.');

    // Soft delete, for the same reason as attributes: certificates reference
    // these ids from inside a JSON column that no foreign key protects.
    await db
      .updateTable('attribute_values')
      .set({ is_deleted: 1, updated_at: new Date() })
      .where('id', '=', id)
      .execute();

    res.json({ ok: true, note: 'Retired. Existing certificates keep their values.' });
  }),
);

/**
 * The GST a course fee or a price band is quoted at.
 *
 * One of two, never both: a row from the master list, or a percent typed on
 * the record itself. Choosing either clears the other, so nothing downstream
 * has to decide which of two answers is the real one.
 */
function gstChoice(b: Record<string, unknown>) {
  const id = b.gst_id ? Number(b.gst_id) : null;
  if (id) return { gst_id: id, gst_percent: null };

  const raw = b.gst_percent;
  if (raw == null || raw === '') return { gst_id: null, gst_percent: null };

  const percent = Number(raw);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw badRequest('GST percent must be a number between 0 and 100.');
  }
  return { gst_id: null, gst_percent: String(percent) };
}

// -------------------------------------------------------------------- prices

/** Every price band, standard and laboratory-specific. */
adminRoutes.get(
  '/prices',
  wrap(async (req, res) => {
    let q = db.selectFrom('prices').selectAll();
    if (req.query.lab_id === 'standard') q = q.where('lab_id', 'is', null);
    else if (req.query.lab_id) q = q.where('lab_id', '=', String(Number(req.query.lab_id)));
    if (req.query.category_id) q = q.where('category_id', '=', String(Number(req.query.category_id)));

    res.json({ data: await q.orderBy('category_id').orderBy('min_wt').execute() });
  }),
);

/**
 * Rejects a band that overlaps an existing one for the same category and
 * laboratory. Overlaps already exist in the live data — category 2 has 0–1,
 * 0–15, 1–10 and 15–20 — and they make pricing depend on row order rather than
 * on the weight.
 */
async function assertNoOverlap(
  categoryId: string,
  labId: string | null,
  minWt: number,
  maxWt: number,
  excludeId?: number,
) {
  let q = db
    .selectFrom('prices')
    .select(['id', 'min_wt', 'max_wt'])
    .where('category_id', '=', categoryId)
    .where('min_wt', '<', maxWt)
    .where('max_wt', '>', minWt);

  q = labId === null ? q.where('lab_id', 'is', null) : q.where('lab_id', '=', labId);
  if (excludeId) q = q.where('id', '!=', excludeId);

  const clash = await q.executeTakeFirst();
  if (clash) {
    throw conflict(
      `That range overlaps an existing band of ${clash.min_wt} to ${clash.max_wt}. Adjust the range or edit that band.`,
    );
  }
}

adminRoutes.post(
  '/prices',
  wrap(async (req, res) => {
    const categoryId = String(positive(req.body?.category_id, 'Category'));
    const labId = req.body?.lab_id == null ? null : String(positive(req.body.lab_id, 'Laboratory'));
    const minWt = positive(req.body?.min_wt, 'Minimum weight');
    const maxWt = positive(req.body?.max_wt, 'Maximum weight');

    if (maxWt <= minWt) throw badRequest('Maximum weight must be greater than the minimum.');
    await assertNoOverlap(categoryId, labId, minWt, maxWt);

    const result = await db
      .insertInto('prices')
      .values({
        category_id: categoryId,
        lab_id: labId,
        min_wt: minWt,
        max_wt: maxWt,
        rate: String(req.body?.rate ?? '0'),
        smart_price: positive(req.body?.smart_price, 'Smart card price'),
        classic_price: positive(req.body?.classic_price, 'Classic card price'),
        // One of the two, never both. Order pricing applies the ported 18%
        // either way; this records what the band is quoted at.
        ...gstChoice(req.body ?? {}),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .executeTakeFirst();

    res.status(201).json({ data: { id: Number(result.insertId) } });
  }),
);

adminRoutes.patch(
  '/prices/:id',
  numericId,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const row = await db.selectFrom('prices').selectAll().where('id', '=', id).executeTakeFirst();
    if (!row) throw notFound('Price band not found.');

    const minWt = req.body?.min_wt === undefined ? Number(row.min_wt) : positive(req.body.min_wt, 'Minimum weight');
    const maxWt = req.body?.max_wt === undefined ? Number(row.max_wt) : positive(req.body.max_wt, 'Maximum weight');
    if (maxWt <= minWt) throw badRequest('Maximum weight must be greater than the minimum.');

    if (req.body?.min_wt !== undefined || req.body?.max_wt !== undefined) {
      await assertNoOverlap(String(row.category_id), row.lab_id, minWt, maxWt, id);
    }

    const patch: Record<string, unknown> = { updated_at: new Date(), min_wt: minWt, max_wt: maxWt };
    if (req.body?.rate !== undefined) patch.rate = String(req.body.rate);
    if (req.body?.smart_price !== undefined) patch.smart_price = positive(req.body.smart_price, 'Smart card price');
    if (req.body?.classic_price !== undefined) patch.classic_price = positive(req.body.classic_price, 'Classic card price');
    if (req.body?.gst_id !== undefined || req.body?.gst_percent !== undefined) {
      Object.assign(patch, gstChoice(req.body ?? {}));
    }

    await db.updateTable('prices').set(patch as never).where('id', '=', id).execute();
    res.json({ ok: true });
  }),
);

adminRoutes.delete(
  '/prices/:id',
  numericId,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const row = await db.selectFrom('prices').select('id').where('id', '=', id).executeTakeFirst();
    if (!row) throw notFound('Price band not found.');

    // Prices are not referenced by any stored record — an order keeps the total
    // it was billed, not the band that produced it — so this is a real delete.
    await db.deleteFrom('prices').where('id', '=', id).execute();
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------- laboratory commission

adminRoutes.patch(
  '/laboratories/:id/commission',
  numericId,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const rate = Number(req.body?.commision ?? req.body?.rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      throw badRequest('Commission rate must be between 0 and 100.');
    }

    const row = await db
      .selectFrom('users')
      .select(['id', 'role_id'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) throw notFound('Laboratory not found.');
    if (Number(row.role_id) !== 2) throw badRequest('That account is not a laboratory.');

    await db
      .updateTable('users')
      .set({ commision: rate, updated_at: new Date() })
      .where('id', '=', id)
      .execute();

    res.json({ ok: true });
  }),
);
