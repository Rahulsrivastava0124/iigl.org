import path from 'node:path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { db } from '../db/index.js';
import { env } from '../lib/env.js';
import { wrap } from '../lib/async.js';
import { fileRoutes } from './file.routes.js';
import { locateLaboratory, needsLookup, storedPoint, type Point } from '../services/geocode.service.js';
import { notFound } from '../lib/errors.js';
import { expandAttributes } from '../services/report.service.js';
import { numericId, numericParams } from '../middleware/params.js';

export const publicRoutes = Router();

/*
  Every public read answers any site. The website is its own origin, and the
  courses, categories and banners it reads were blocked by the browser while
  only the laboratory and customer lists said so. Set only where CORS has not
  already answered for a listed origin, so the panel keeps its credentialed
  reply; writes (the verify log) are left to the global CORS rules.
*/
publicRoutes.use((req, res, next) => {
  if (req.method === 'GET' && !res.get('Access-Control-Allow-Origin')) {
    res.set('Access-Control-Allow-Origin', '*');
  }
  next();
});

publicRoutes.get(
  '/pages/:pageType',
  wrap(async (req, res) => {
    const row = await db
      .selectFrom('websites')
      .selectAll()
      .where('page_type', '=', String(req.params.pageType))
      .executeTakeFirst();
    if (!row) throw notFound('Page not found.');
    res.json({ data: row });
  }),
);

publicRoutes.get(
  '/blogs',
  wrap(async (_req, res) => {
    const rows = await db
      .selectFrom('blogs')
      .select(['id', 'page_name', 'slug', 'thumbnail', 'banner', 'meta_title', 'meta_description', 'created_at'])
      .orderBy('id', 'desc')
      .execute();
    res.json({ data: rows });
  }),
);

publicRoutes.get(
  '/blogs/:slug',
  wrap(async (req, res) => {
    const row = await db
      .selectFrom('blogs')
      .selectAll()
      .where('slug', '=', String(req.params.slug))
      .executeTakeFirst();
    if (!row) throw notFound('Article not found.');
    res.json({ data: row });
  }),
);

publicRoutes.get(
  '/branches',
  wrap(async (_req, res) => {
    const rows = await db.selectFrom('branches').select(['id', 'city', 'state', 'blurb', 'lat', 'lon', 'pageURL', 'img', 'title']).execute();
    res.json({ data: rows });
  }),
);

/**
 * The laboratories head office has ticked for the website's Branches section.
 * Active ones only, and only what a visitor needs to find them — never the
 * account's contact, bank or identity fields.
 */
publicRoutes.get(
  '/laboratories',
  wrap(async (_req, res) => {
    /*
      Readable from any site. The public website is its own origin, and this
      list carries nothing a session guards; the request sends no cookie. Set
      only when CORS has not already answered for a listed origin, so the panel's
      credentialed answer is left as it is.
    */
    if (!res.get('Access-Control-Allow-Origin')) res.set('Access-Control-Allow-Origin', '*');
    const rows = await db
      .selectFrom('users')
      .select([
        'id', 'fullname', 'city', 'state', 'company_logo',
        'geo_latitude', 'geo_longitude', 'geo_query', 'geo_at',
      ])
      .where('role_id', '=', 2)
      .where('show_on_site', '=', 1)
      .where('is_active', '=', 1)
      .orderBy('fullname')
      .execute();

    /*
      A laboratory whose city has not been looked up yet — just ticked, or its
      city just edited — is looked up now, so the first visitor after the change
      already sees the pin in the right place. Bounded: whatever the geocoder
      has not answered in a few seconds carries on in the background and the
      page gets the state's middle this once.
    */
    const fresh = new Map<number, Point | null>();
    const pending = rows.filter(needsLookup).map((lab) =>
      locateLaboratory(lab).then((point) => {
        if (point) fresh.set(lab.id, point);
      }),
    );
    if (pending.length > 0) {
      await Promise.race([Promise.all(pending), new Promise((r) => setTimeout(r, 4000))]);
    }

    // The logo as a public address rather than its stored path: /api/files
    // needs a session, and the website has none.
    res.json({
      data: rows.map((r) => {
        const point = fresh.get(r.id) ?? storedPoint(r);
        return {
          id: r.id,
          fullname: r.fullname,
          city: r.city,
          state: r.state,
          logo: r.company_logo ? `/public/laboratories/${r.id}/logo` : null,
          latitude: point?.lat ?? null,
          longitude: point?.lon ?? null,
        };
      }),
    });
  }),
);

/**
 * A listed laboratory's logo, for the website.
 *
 * Only for a laboratory the list above would return — ticked and active — so
 * this cannot be used to read any other upload. The file is then served the
 * way `/api/files` serves it (legacy disk first, then storage), by handing the
 * request on with its path rewritten.
 */
publicRoutes.get(
  '/laboratories/:id/logo',
  numericId,
  wrap(async (req, res, next) => {
    const lab = await db
      .selectFrom('users')
      .select('company_logo')
      .where('id', '=', Number(req.params.id))
      .where('role_id', '=', 2)
      .where('show_on_site', '=', 1)
      .where('is_active', '=', 1)
      .executeTakeFirst();
    sendUpload(lab?.company_logo, req, res, next);
  }),
);

/**
 * Serves one stored upload path to the public, the way `/api/files` serves it
 * (legacy disk first, then storage), by handing the request on with its path
 * rewritten. Callers decide first that the path belongs to something public.
 */
function sendUpload(stored: string | null | undefined, req: Request, res: Response, next: NextFunction) {
  const path_ = stored?.trim();
  if (!path_ || /^https?:\/\//i.test(path_)) throw notFound('Logo not found.');

  const relative = path_.replace(/^\/*(public\/)?uploads\//, '');
  if (relative.split('/').some((part) => part === '..' || part === '')) throw notFound('Logo not found.');

  // Cached briefly: a logo changes rarely, but one taken off the site should
  // not linger for long.
  res.setHeader('Cache-Control', 'public, max-age=3600');
  const onDisk = path.resolve(env.legacyPublicRoot, 'uploads', relative);
  res.sendFile(onDisk, (err) => {
    if (!err) return;
    if (res.headersSent) return;
    req.url = `/${relative}`;
    fileRoutes(req, res, next);
  });
}

/**
 * The registered customers head office has ticked for the website's Our
 * Registered Customers section, with what the card shows — company, logo,
 * area, city, state and the number to call. Nothing else of the account: not
 * the owner, the email, the GST number or the terms.
 *
 * `state` and `city` narrow the list (case-insensitive). `locations` is always
 * every state and its cities across the whole published list, not the narrowed
 * one, so the website's two dropdowns offer everything there is to pick.
 */
publicRoutes.get(
  '/customers',
  wrap(async (req, res) => {
    if (!res.get('Access-Control-Allow-Origin')) res.set('Access-Control-Allow-Origin', '*');
    const rows = await db
      .selectFrom('registered_customers')
      .select(['id', 'company_name', 'area', 'city', 'state', 'mobile', 'logo'])
      .where('show_on_site', '=', 1)
      .orderBy('company_name')
      .execute();

    const clean = (v: string | null) => (v ?? '').trim().replace(/\s+/g, ' ');
    const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

    // States and their cities, each spelled as first seen, sorted.
    const byState = new Map<string, { state: string; cities: Map<string, string> }>();
    for (const r of rows) {
      const state = clean(r.state);
      const city = clean(r.city);
      if (!state && !city) continue;
      const key = state.toLowerCase();
      const entry = byState.get(key) ?? { state, cities: new Map<string, string>() };
      if (city && !entry.cities.has(city.toLowerCase())) entry.cities.set(city.toLowerCase(), city);
      byState.set(key, entry);
    }
    const locations = [...byState.values()]
      .map((e) => ({ state: e.state, cities: [...e.cities.values()].sort((a, b) => a.localeCompare(b)) }))
      .sort((a, b) => a.state.localeCompare(b.state));

    const wantState = clean(String(req.query.state ?? ''));
    const wantCity = clean(String(req.query.city ?? ''));
    const matched = rows.filter(
      (r) => (!wantState || same(clean(r.state), wantState)) && (!wantCity || same(clean(r.city), wantCity)),
    );

    res.json({
      data: matched.map((r) => ({
        id: Number(r.id),
        company_name: r.company_name,
        area: r.area,
        city: r.city,
        state: r.state,
        mobile: r.mobile,
        logo: r.logo ? `/public/customers/${r.id}/logo` : null,
      })),
      locations,
    });
  }),
);

/** A listed customer's logo. Only for a customer the list above returns. */
publicRoutes.get(
  '/customers/:id/logo',
  numericId,
  wrap(async (req, res, next) => {
    const customer = await db
      .selectFrom('registered_customers')
      .select('logo')
      .where('id', '=', Number(req.params.id))
      .where('show_on_site', '=', 1)
      .executeTakeFirst();
    sendUpload(customer?.logo, req, res, next);
  }),
);

publicRoutes.get(
  '/branches/:slug',
  wrap(async (req, res) => {
    const row = await db
      .selectFrom('branches')
      .selectAll()
      .where('pageURL', '=', String(req.params.slug))
      .executeTakeFirst();
    if (!row) throw notFound('Branch page not found.');
    res.json({ data: row });
  }),
);

/**
 * The courses on offer, as the website's Available Courses cards show them:
 * name, description, duration, lessons, level, categories and picture. Retired
 * courses are left out, and nothing about fees or enrolments is exposed.
 */
publicRoutes.get(
  '/courses',
  wrap(async (_req, res) => {
    const rows = await db
      .selectFrom('courses')
      .select(['id', 'name', 'code', 'description', 'duration', 'lessons', 'level', 'categories', 'image', 'title', 'subtitle'])
      .where('is_active', '=', 1)
      .orderBy('name')
      .execute();
    res.json({ data: rows });
  }),
);

/**
 * The report categories, as the website's Our Report Categories cards show
 * them: name, the short line and the picture (Report Master › Categories).
 * Weight units and anything about pricing stay private.
 */
publicRoutes.get(
  '/categories',
  wrap(async (_req, res) => {
    const rows = await db
      .selectFrom('categories')
      .select(['id', 'name', 'short_description', 'description', 'icon', 'banner'])
      .orderBy('id')
      .execute();
    res.json({ data: rows });
  }),
);

publicRoutes.get(
  '/report-types',
  wrap(async (_req, res) => {
    const rows = await db.selectFrom('reporttypes').selectAll().execute();
    res.json({ data: rows });
  }),
);

publicRoutes.get(
  '/banners',
  wrap(async (req, res) => {
    let q = db.selectFrom('banners').selectAll().where('status', '=', 1);
    if (req.query.type) q = q.where('img_type', '=', String(req.query.type));
    res.json({ data: await q.execute() });
  }),
);

/**
 * Look up by report id rather than report number. Every certificate printed so
 * far carries a QR pointing at /verify-report/{id}, so this path has to keep
 * resolving after cutover or those documents stop verifying.
 */
publicRoutes.get(
  '/verify-by-id/:id',
  numericId,
  wrap(async (req, res, next) => {
    const row = await db
      .selectFrom('reports')
      .select('report_no')
      .where('id', '=', Number(req.params.id))
      // Withheld here as well as on /verify, not only there: this route
      // redirects into that one, but it would otherwise confirm the id exists
      // by the shape of its own answer before ever getting that far.
      .where('hidden_on_site', '=', 0)
      .executeTakeFirst();

    if (!row) {
      res.status(404).json({
        error: 'not_found',
        message: 'No certificate matches that number. Check the digits and try again.',
      });
      return;
    }

    req.url = `/verify/${encodeURIComponent(row.report_no)}`;
    next('route');
  }),
);

/**
 * Certificate verification. Public by design, so it returns only what appears
 * on the card and never the customer record behind it.
 */
publicRoutes.get(
  '/verify/:reportNo',
  wrap(async (req, res) => {
    const report = await db
      .selectFrom('reports')
      .select([
        'id',
        'report_no',
        'subcategory_id',
        'gross_weight',
        'carat_weight',
        'size',
        'item_image',
        'comments',
        'description',
        'created_at',
      ])
      .where('report_no', '=', String(req.params.reportNo))
      /*
        Withheld certificates are not published.

        Filtered in the query rather than checked after it, so there is one
        answer and no branch that could be made to differ: the 404 below is
        reached by a hidden certificate and by a number nobody ever issued, with
        the same status, the same body and the same wording. A refusal an
        outsider could tell apart would itself disclose that the certificate
        exists, which is the thing being withheld.
      */
      .where('hidden_on_site', '=', 0)
      .executeTakeFirst();

    if (!report) {
      res.status(404).json({
        error: 'not_found',
        message: 'No certificate matches that number. Check the digits and try again.',
      });
      return;
    }

    const [subcategory, [attributes]] = await Promise.all([
      db
        .selectFrom('subcategories')
        .select(['id', 'name'])
        .where('id', '=', Number(report.subcategory_id))
        .executeTakeFirst(),
      expandAttributes([report.description]),
    ]);

    const { description, ...card } = report;
    res.json({
      data: {
        ...card,
        subcategory: subcategory?.name ?? null,
        attributes: attributes.filter((a) => a.show_in_smart_card || a.show_in_classic_card),
      },
    });
  }),
);

/** Logs a verification lookup, matching the reportsearches table. */
publicRoutes.post(
  '/verify-log',
  wrap(async (req, res) => {
    const { fullname, mobile, report_no } = req.body ?? {};
    if (fullname && mobile && report_no) {
      await db
        .insertInto('reportsearches')
        .values({
          fullname: String(fullname),
          mobile: String(mobile),
          report_no: String(report_no),
          created_at: new Date(),
          updated_at: new Date(),
        })
        .execute();
    }
    res.json({ ok: true });
  }),
);
