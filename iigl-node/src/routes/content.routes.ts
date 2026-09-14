import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { requireAdmin } from '../middleware/auth.js';
import { numericId } from '../middleware/params.js';
import { headOfficeOr } from '../services/permission.service.js';
import { locateInBackground, needsLookup, storedPoint } from '../services/geocode.service.js';

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
// Guarded route by route: each tab is a permission head office can give one
// of its employees (see PERMISSION_SCOPE), and the roles below stay head
// office's alone.

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

/*
  The whole record, for the editor. The public list leaves the body out, and an
  editor filled from it saved every article back with its content emptied.
*/
contentRoutes.get(
  '/blogs',
  wrap(async (_req, res) => {
    res.json({ data: await db.selectFrom('blogs').selectAll().orderBy('id', 'desc').execute() });
  }),
);

contentRoutes.post(
  '/blogs',
  headOfficeOr('website_blog', 'create'),
  wrap(async (req, res) => {
    const name = required(req.body?.page_name, 'Title');
    // Blank means "from the title", not an empty address.
    const slug = slugify(String(text(req.body?.slug) ?? name));

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
  headOfficeOr('website_blog', 'update'),
  numericId,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const row = await db.selectFrom('blogs').select('id').where('id', '=', id).executeTakeFirst();
    if (!row) throw notFound('Article not found.');

    const patch = patchFrom(req.body, BLOG_FIELDS);

    // The slug is the public address. Changing it breaks any existing link, so
    // it moves only when asked for explicitly, never as a side effect of a
    // renamed title.
    // A cleared address keeps the one it had rather than becoming empty.
    if (text(req.body?.slug)) {
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
  'city', 'state', 'blurb', 'h1', 'content', 'img', 'alt', 'title', 'description', 'keywords',
  'canonical', 'intro', 'acdnitm1', 'acdnitm2', 'acdnitm3',
  'acdnbd1', 'acdnbd2', 'acdnbd3', 'schm',
] as const;

/** A map coordinate in decimal degrees, or null when left blank. */
function coordinate(v: unknown, field: string, limit: number, example: string): string | null {
  const given = text(v);
  if (given === null) return null;
  const n = Number(given);
  if (!Number.isFinite(n) || Math.abs(n) > limit) {
    throw badRequest(`${field} must be a number between -${limit} and ${limit} — for example ${example}.`);
  }
  return n.toFixed(6);
}

/** The two short columns the website's branch list prints, at their stored widths. */
function checkBranch(body: any) {
  if ((text(body?.state) ?? '').length > 60) throw badRequest('State is at most 60 characters.');
  if ((text(body?.blurb) ?? '').length > 120) throw badRequest('Short line is at most 120 characters.');
}

contentRoutes.get(
  '/branches',
  wrap(async (_req, res) => {
    res.json({ data: await db.selectFrom('branches').selectAll().orderBy('city').execute() });
  }),
);

contentRoutes.post(
  '/branches',
  headOfficeOr('website_home', 'create'),
  wrap(async (req, res) => {
    const city = required(req.body?.city, 'City');
    checkBranch(req.body);
    const pageURL = slugify(String(text(req.body?.pageURL) ?? city));

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
    values.lat = coordinate(req.body?.lat, 'Latitude', 90, '22.5726');
    values.lon = coordinate(req.body?.lon, 'Longitude', 180, '88.3639');

    const result = await db.insertInto('branches').values(values as never).executeTakeFirst();
    res.status(201).json({ data: { id: Number(result.insertId), pageURL } });
  }),
);

contentRoutes.patch(
  '/branches/:id',
  headOfficeOr('website_home', 'update'),
  numericId,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const row = await db.selectFrom('branches').select('id').where('id', '=', id).executeTakeFirst();
    if (!row) throw notFound('Branch page not found.');

    checkBranch(req.body);
    const patch = patchFrom(req.body, BRANCH_FIELDS);
    if (req.body?.lat !== undefined) patch.lat = coordinate(req.body.lat, 'Latitude', 90, '22.5726');
    if (req.body?.lon !== undefined) patch.lon = coordinate(req.body.lon, 'Longitude', 180, '88.3639');
    if (text(req.body?.pageURL)) {
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

// ------------------------------------------------- laboratories as branches

/**
 * Every laboratory, with whether the website lists it as a branch.
 *
 * The website's Branches section is the laboratory network, so this is the
 * list head office ticks on and off. Inactive laboratories are listed too: a
 * closed one that is still ticked is exactly what somebody needs to see here.
 */
contentRoutes.get(
  '/branch-laboratories',
  headOfficeOr('website_home', 'view'),
  wrap(async (_req, res) => {
    const rows = await db
      .selectFrom('users')
      .select([
        'id', 'empid', 'fullname', 'city', 'state', 'is_active', 'show_on_site', 'company_logo',
        'geo_latitude', 'geo_longitude', 'geo_query', 'geo_at',
      ])
      .where('role_id', '=', 2)
      .orderBy('fullname')
      .execute();

    // Any ticked laboratory not yet placed is looked up behind this answer; the
    // panel shows it as pending and has the result on its next load.
    locateInBackground(rows.filter((r) => r.show_on_site));

    res.json({
      data: rows.map((lab) => {
        const { geo_latitude, geo_longitude, geo_query, geo_at, ...r } = lab;
        void geo_latitude; void geo_longitude; void geo_query; void geo_at;
        /*
          How the website will place it:
            city     found — the pin is on the city
            state    the city was not found (often a spelling) — the middle of the state
            pending  not looked up yet
            none     no city on the record
        */
        const map_location = !(r.city ?? '').trim()
          ? 'none'
          : storedPoint(lab)
            ? 'city'
            : needsLookup(lab)
              ? 'pending'
              : 'state';
        return { ...r, map_location };
      }),
    });
  }),
);

/** Shows or hides one laboratory on the website. */
contentRoutes.patch(
  '/branch-laboratories/:id',
  headOfficeOr('website_home', 'update'),
  numericId,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (typeof req.body?.show_on_site !== 'boolean') throw badRequest('show_on_site must be true or false.');
    const row = await db
      .selectFrom('users')
      .select(['id', 'city', 'state', 'geo_latitude', 'geo_longitude', 'geo_query', 'geo_at'])
      .where('id', '=', id)
      .where('role_id', '=', 2)
      .executeTakeFirst();
    if (!row) throw notFound('Laboratory not found.');
    await db
      .updateTable('users')
      .set({ show_on_site: req.body.show_on_site ? 1 : 0, updated_at: new Date() })
      .where('id', '=', id)
      .execute();
    // Placed now, so the pin is ready before anybody opens the website.
    if (req.body.show_on_site) locateInBackground([row]);
    res.json({ ok: true });
  }),
);

// ------------------------------------------- registered customers on the site

/**
 * Every registered customer, with whether the website's Our Registered
 * Customers section lists it. Listed by default (migration 060); head office
 * unticks the ones to keep off the site.
 */
contentRoutes.get(
  '/website-customers',
  headOfficeOr('website_home', 'view'),
  wrap(async (_req, res) => {
    const rows = await db
      .selectFrom('registered_customers as c')
      .leftJoin('users as l', 'l.id', 'c.lab_id')
      .select([
        'c.id', 'c.company_name', 'c.owner_name', 'c.mobile', 'c.area', 'c.city', 'c.state', 'c.logo',
        'c.show_on_site', 'l.fullname as laboratory',
      ])
      .orderBy('c.company_name')
      .execute();
    res.json({ data: rows });
  }),
);

contentRoutes.patch(
  '/website-customers/:id',
  headOfficeOr('website_home', 'update'),
  numericId,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (typeof req.body?.show_on_site !== 'boolean') throw badRequest('show_on_site must be true or false.');
    const row = await db.selectFrom('registered_customers').select('id').where('id', '=', id).executeTakeFirst();
    if (!row) throw notFound('Customer not found.');
    await db
      .updateTable('registered_customers')
      .set({ show_on_site: req.body.show_on_site ? 1 : 0, updated_at: new Date() })
      .where('id', '=', id)
      .execute();
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
  headOfficeOr('website_report', 'create'),
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
  headOfficeOr('website_report', 'update'),
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

/** Where a banner shows: the website's home page slider, or a plain banner. */
function placement(v: unknown): string {
  const given = required(v, 'Type');
  if (given !== 'slider' && given !== 'banner') throw badRequest('Type must be slider or banner.');
  return given;
}

contentRoutes.get(
  '/banners',
  headOfficeOr('website_home', 'view'),
  wrap(async (_req, res) => {
    res.json({ data: await db.selectFrom('banners').selectAll().orderBy('id').execute() });
  }),
);

contentRoutes.post(
  '/banners',
  headOfficeOr('website_home', 'create'),
  wrap(async (req, res) => {
    const result = await db
      .insertInto('banners')
      .values({
        path: required(req.body?.path, 'Image'),
        img_type: placement(req.body?.img_type),
        name: text(req.body?.name),
        url: text(req.body?.url),
        // The picture phones get instead, as the old home page served it.
        mobile_slider: text(req.body?.mobile_slider),
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
  headOfficeOr('website_home', 'update'),
  numericId,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const row = await db.selectFrom('banners').select('id').where('id', '=', id).executeTakeFirst();
    if (!row) throw notFound('Banner not found.');

    const patch: Record<string, unknown> = { updated_at: new Date() };
    for (const k of ['name', 'url', 'mobile_slider'] as const) {
      if (req.body?.[k] !== undefined) patch[k] = text(req.body[k]);
    }
    // Both are NOT NULL: a banner without a picture or a place is not a banner.
    if (req.body?.path !== undefined) patch.path = required(req.body.path, 'Image');
    if (req.body?.img_type !== undefined) patch.img_type = placement(req.body.img_type);
    if (req.body?.status !== undefined) patch.status = req.body.status ? 1 : 0;
    if (Object.keys(patch).length === 1) throw badRequest('Nothing to update.');

    await db.updateTable('banners').set(patch as never).where('id', '=', id).execute();
    res.json({ ok: true });
  }),
);

contentRoutes.delete(
  '/banners/:id',
  headOfficeOr('website_home', 'delete'),
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
  headOfficeOr('website_home', 'view'),
  wrap(async (_req, res) => {
    const rows = await db
      .selectFrom('websites')
      // The whole page: the editor is filled from this list, and a list without
      // the body saved every page back empty.
      .selectAll()
      .orderBy('page_type')
      .execute();
    res.json({ data: rows });
  }),
);

contentRoutes.patch(
  '/pages/:id',
  headOfficeOr('website_home', 'update'),
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
  requireAdmin,
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
  requireAdmin,
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
