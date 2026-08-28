import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { requireAdmin } from '../middleware/auth.js';
import { numericId } from '../middleware/params.js';

/**
 * Content management for the public site: articles, branch city pages,
 * certificate types, banners and the static pages.
 *
 * Reading these is public — the website needs them without a session — so the
 * read endpoints live in public.routes.ts and only the writes are here.
 *
 * Every one of these tables is small and rarely touched. They are grouped in
 * one module because they are the same shape of work, not because they are
 * related.
 */
export const contentRoutes = Router();
contentRoutes.use(requireAdmin);

const text = (v: unknown): string | null => (v == null || v === '' ? null : String(v));

const required = (v: unknown, field: string): string => {
  if (v == null || String(v).trim() === '') throw badRequest(`${field} is required.`);
  return String(v).trim();
};

/** Lower case, hyphenated, no punctuation — what the public URLs use. */
const slugify = (v: string) =>
  v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Applies only the keys present in the body, so a PATCH stays partial. */
function patchFrom(body: any, keys: readonly string[]): Record<string, unknown> {
  const patch: Record<string, unknown> = { updated_at: new Date() };
  for (const k of keys) if (body?.[k] !== undefined) patch[k] = text(body[k]);
  return patch;
}

// ------------------------------------------------------------------- blogs

const BLOG_FIELDS = [
  'page_name',
  'content',
  'thumbnail',
  'banner',
  'meta_title',
  'meta_description',
  'meta_keywords',
] as const;

contentRoutes.post(
  '/blogs',
  wrap(async (req, res) => {
    const name = required(req.body?.page_name, 'Title');
    const slug = slugify(String(req.body?.slug ?? name));

    const clash = await db.selectFrom('blogs').select('id').where('slug', '=', slug).executeTakeFirst();
    if (clash) throw conflict(`An article already uses the address /${slug}.`);

    const result = await db
      .insertInto('blogs')
      .values({
        page_name: name,
        slug,
        content: String(req.body?.content ?? ''),
        thumbnail: text(req.body?.thumbnail),
        banner: text(req.body?.banner),
        meta_title: text(req.body?.meta_title),
        meta_description: text(req.body?.meta_description),
        meta_keywords: text(req.body?.meta_keywords),
        added_by: req.user.id,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .executeTakeFirst();

    res.status(201).json({ data: { id: Number(result.insertId), slug } });
  }),
);

contentRoutes.patch(
  '/blogs/:id',
  numericId,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const row = await db.selectFrom('blogs').select('id').where('id', '=', id).executeTakeFirst();
    if (!row) throw notFound('Article not found.');

    const patch = patchFrom(req.body, BLOG_FIELDS);

    // The slug is the public address. Changing it breaks any existing link, so
    // it moves only when asked for explicitly, never as a side effect of a
    // renamed title.
    if (req.body?.slug !== undefined) {
      const slug = slugify(String(req.body.slug));
      const clash = await db
        .selectFrom('blogs')
        .select('id')
        .where('slug', '=', slug)
        .where('id', '!=', id)
        .executeTakeFirst();
      if (clash) throw conflict(`Another article already uses the address /${slug}.`);
      patch.slug = slug;
    }

    if (Object.keys(patch).length === 1) throw badRequest('Nothing to update.');
    await db.updateTable('blogs').set(patch as never).where('id', '=', id).execute();
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------- branches

const BRANCH_FIELDS = [
  'city', 'h1', 'content', 'img', 'alt', 'title', 'description', 'keywords',
  'canonical', 'intro', 'acdnitm1', 'acdnitm2', 'acdnitm3',
  'acdnbd1', 'acdnbd2', 'acdnbd3', 'schm',
] as const;

contentRoutes.post(
  '/branches',
  wrap(async (req, res) => {
    const city = required(req.body?.city, 'City');
    const pageURL = slugify(String(req.body?.pageURL ?? city));

    const clash = await db
      .selectFrom('branches')
      .select('id')
      .where('pageURL', '=', pageURL)
      .executeTakeFirst();
    if (clash) throw conflict(`A branch page already uses the address /${pageURL}.`);

    const values: Record<string, unknown> = {
      city,
      pageURL,
      created_at: new Date(),
      updated_at: new Date(),
    };
    for (const k of BRANCH_FIELDS) if (k !== 'city') values[k] = text(req.body?.[k]);

    const result = await db.insertInto('branches').values(values as never).executeTakeFirst();
    res.status(201).json({ data: { id: Number(result.insertId), pageURL } });
  }),
);

contentRoutes.patch(
  '/branches/:id',
  numericId,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const row = await db.selectFrom('branches').select('id').where('id', '=', id).executeTakeFirst();
    if (!row) throw notFound('Branch page not found.');

    const patch = patchFrom(req.body, BRANCH_FIELDS);
    if (req.body?.pageURL !== undefined) {
      const pageURL = slugify(String(req.body.pageURL));
      const clash = await db
        .selectFrom('branches')
        .select('id')
        .where('pageURL', '=', pageURL)
        .where('id', '!=', id)
        .executeTakeFirst();
      if (clash) throw conflict(`Another branch page already uses /${pageURL}.`);
      patch.pageURL = pageURL;
    }

    if (Object.keys(patch).length === 1) throw badRequest('Nothing to update.');
    await db.updateTable('branches').set(patch as never).where('id', '=', id).execute();
    res.json({ ok: true });
  }),
);

// ------------------------------------------------------------ report types

const REPORT_TYPE_FIELDS = [
  'name', 'short_description', 'description', 'banner', 'icon',
  'meta_title', 'meta_description', 'meta_keywords',
] as const;

contentRoutes.post(
  '/report-types',
  wrap(async (req, res) => {
    const values: Record<string, unknown> = {
      name: required(req.body?.name, 'Name'),
      added_by: req.user.id,
      created_at: new Date(),
      updated_at: new Date(),
    };
    // These columns are NOT NULL in the live schema with no default.
    for (const k of REPORT_TYPE_FIELDS) if (k !== 'name') values[k] = text(req.body?.[k]) ?? '';

    const result = await db.insertInto('reporttypes').values(values as never).executeTakeFirst();
    res.status(201).json({ data: { id: Number(result.insertId) } });
  }),
);

contentRoutes.patch(
  '/report-types/:id',
  numericId,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const row = await db.selectFrom('reporttypes').select('id').where('id', '=', id).executeTakeFirst();
    if (!row) throw notFound('Report type not found.');

    const patch: Record<string, unknown> = { updated_at: new Date() };
    for (const k of REPORT_TYPE_FIELDS) {
      if (req.body?.[k] !== undefined) patch[k] = text(req.body[k]) ?? '';
    }
    if (Object.keys(patch).length === 1) throw badRequest('Nothing to update.');

    await db.updateTable('reporttypes').set(patch as never).where('id', '=', id).execute();
    res.json({ ok: true });
  }),
);

// ----------------------------------------------------------------- banners

contentRoutes.get(
  '/banners',
  wrap(async (_req, res) => {
    res.json({ data: await db.selectFrom('banners').selectAll().orderBy('id').execute() });
  }),
);

contentRoutes.post(
  '/banners',
  wrap(async (req, res) => {
    const result = await db
      .insertInto('banners')
      .values({
        path: required(req.body?.path, 'Image'),
        img_type: required(req.body?.img_type, 'Placement'),
        name: text(req.body?.name),
        url: text(req.body?.url),
        status: req.body?.status === undefined ? 1 : req.body.status ? 1 : 0,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .executeTakeFirst();

    res.status(201).json({ data: { id: Number(result.insertId) } });
  }),
);

contentRoutes.patch(
  '/banners/:id',
  numericId,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const row = await db.selectFrom('banners').select('id').where('id', '=', id).executeTakeFirst();
    if (!row) throw notFound('Banner not found.');

    const patch: Record<string, unknown> = { updated_at: new Date() };
    for (const k of ['path', 'img_type', 'name', 'url'] as const) {
      if (req.body?.[k] !== undefined) patch[k] = text(req.body[k]);
    }
    if (req.body?.status !== undefined) patch.status = req.body.status ? 1 : 0;
    if (Object.keys(patch).length === 1) throw badRequest('Nothing to update.');

    await db.updateTable('banners').set(patch as never).where('id', '=', id).execute();
    res.json({ ok: true });
  }),
);

contentRoutes.delete(
  '/banners/:id',
  numericId,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const row = await db.selectFrom('banners').select('id').where('id', '=', id).executeTakeFirst();
    if (!row) throw notFound('Banner not found.');
    await db.deleteFrom('banners').where('id', '=', id).execute();
    res.json({ ok: true });
  }),
);

// ----------------------------------------------------------- static pages

const PAGE_FIELDS = [
  'page_name', 'content', 'banner', 'meta_title', 'meta_description', 'meta_keywords',
] as const;

contentRoutes.get(
  '/pages',
  wrap(async (_req, res) => {
    const rows = await db
      .selectFrom('websites')
      .select(['id', 'page_name', 'page_type', 'meta_title'])
      .orderBy('page_type')
      .execute();
    res.json({ data: rows });
  }),
);

contentRoutes.patch(
  '/pages/:id',
  numericId,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const row = await db.selectFrom('websites').select('id').where('id', '=', id).executeTakeFirst();
    if (!row) throw notFound('Page not found.');

    const patch: Record<string, unknown> = { updated_at: new Date() };
    for (const k of PAGE_FIELDS) {
      if (req.body?.[k] !== undefined) {
        // page_name and content are NOT NULL in the live schema.
        patch[k] = k === 'page_name' || k === 'content' ? String(req.body[k] ?? '') : text(req.body[k]);
      }
    }
    if (Object.keys(patch).length === 1) throw badRequest('Nothing to update.');

    await db.updateTable('websites').set(patch as never).where('id', '=', id).execute();
    res.json({ ok: true });
  }),
);

// ------------------------------------------------------------------- roles

contentRoutes.post(
  '/roles',
  wrap(async (req, res) => {
    const name = required(req.body?.role_name, 'Role name');
    const clash = await db
      .selectFrom('roles')
      .select('id')
      .where('role_name', '=', name)
      .executeTakeFirst();
    if (clash) throw conflict(`A role called ${name} already exists.`);

    const result = await db
      .insertInto('roles')
      .values({ role_name: name, created_at: new Date(), updated_at: new Date() })
      .executeTakeFirst();

    res.status(201).json({
      data: { id: Number(result.insertId) },
      note: 'New roles start with no permissions. Grant them before anyone signs in.',
    });
  }),
);

contentRoutes.patch(
  '/roles/:id',
  numericId,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const name = required(req.body?.role_name, 'Role name');

    const row = await db.selectFrom('roles').select('id').where('id', '=', id).executeTakeFirst();
    if (!row) throw notFound('Role not found.');

    await db
      .updateTable('roles')
      .set({ role_name: name, updated_at: new Date() })
      .where('id', '=', id)
      .execute();

    res.json({ ok: true });
  }),
);
