import path from 'node:path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { sql } from 'kysely';
import { db } from '../db/index.js';
import { env } from '../lib/env.js';
import { wrap } from '../lib/async.js';
import { fileRoutes } from './file.routes.js';
import { locateLaboratory, needsLookup, storedPoint, type Point } from '../services/geocode.service.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { sendRegistrationReceived } from '../lib/mail.js';
import { assertNotRegistered, courseForRegistration, courseGstPercent, gstOn, insertRegistration, readRegistration } from '../services/registration.service.js';
import { assertPublicPayment, confirmPayment, paymentConfig, startRegistrationPayment } from '../services/payment.service.js';
import { verifyWebhook } from '../lib/cashfree.js';
import { expandAttributes } from '../services/report.service.js';
import { cardDataFor, loadChrome } from '../services/card.service.js';
import { renderCardsPdf, type CardKind } from '../services/pdf.service.js';
import { numericId, numericParams } from '../middleware/params.js';
import { HEAD_OFFICE, siteProfile } from './site.routes.js';

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
  '/blogs',
  wrap(async (_req, res) => {
    const rows = await db
      .selectFrom('blogs')
      .select(['id', 'page_name', 'slug', 'excerpt', 'category', 'author', 'published_on', 'thumbnail', 'banner', 'meta_title', 'meta_description', 'created_at'])
      // Newest publish date first; an article with none sorts after, newest added first.
      .orderBy('published_on', 'desc')
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
/** Head office's own website settings: the footer's social links, its gallery and content. */
publicRoutes.get(
  '/site',
  wrap(async (_req, res) => {
    res.json({ data: await siteProfile(HEAD_OFFICE) });
  }),
);

/**
 * One listed branch's page: the laboratory as the list shows it, with its own
 * banner, content, gallery and social links. Only a ticked, active laboratory.
 */
publicRoutes.get(
  '/laboratories/:id',
  numericId,
  wrap(async (req, res) => {
    const lab = await db
      .selectFrom('users')
      .select(['id', 'fullname', 'city', 'state', 'company_logo'])
      .where('id', '=', Number(req.params.id))
      .where('role_id', '=', 2)
      .where('show_on_site', '=', 1)
      .where('is_active', '=', 1)
      .executeTakeFirst();
    if (!lab) throw notFound('Branch not found.');
    res.json({
      data: {
        id: lab.id,
        fullname: lab.fullname,
        city: lab.city,
        state: lab.state,
        logo: lab.company_logo ? `/public/laboratories/${lab.id}/logo` : null,
        ...(await siteProfile(lab.id)),
      },
    });
  }),
);

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
 * name, description, duration, lessons, level, categories and picture — and the
 * fee a student pays to register (`fee`, `gst_percent`, `fee_total` = fee plus
 * GST), which the registration form quotes before taking it online. Retired
 * courses are left out; nothing about enrolments is exposed.
 */
publicRoutes.get(
  '/courses',
  wrap(async (_req, res) => {
    const rows = await db
      .selectFrom('courses')
      .select(['id', 'name', 'code', 'description', 'duration', 'lessons', 'level', 'categories', 'image', 'title', 'subtitle', 'details', 'syllabus', 'fee', 'gst_id', 'gst_percent'])
      .where('is_active', '=', 1)
      .orderBy('name')
      .execute();
    const data = await Promise.all(
      rows.map(async ({ gst_id, gst_percent, fee, ...r }) => {
        const percent = await courseGstPercent({ gst_id, gst_percent });
        const base = Number(fee ?? 0);
        return { ...r, fee: base, gst_percent: percent, fee_total: Math.round((base + gstOn(base, percent)) * 100) / 100 };
      }),
    );
    res.json({ data });
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
 * Register for a course from the website: every detail the panel's New
 * Registration form takes except the documents, saved as a pending registration
 * (Student › Registration) for head office to confirm, and a confirmation mailed
 * to the student. No session; rate-limited in app.ts.
 *
 * The photograph, ID proof and qualification are not taken here: an upload
 * anyone on the internet can make is a storage bill and a malware host. Head
 * office attaches them when the student comes in.
 */
publicRoutes.post(
  '/student-registrations',
  wrap(async (req, res) => {
    // Posted as a plain form from the website's own origin, which reads the reply.
    res.set('Access-Control-Allow-Origin', '*');
    const details = readRegistration(req.body ?? {});
    const course = await courseForRegistration(details.course_id);
    await assertNotRegistered(details.mobile, course);

    const { registrationNo } = await db.transaction().execute((trx) =>
      insertRegistration(trx as typeof db, details, course, { remark: 'Registered on the website.', addedBy: null }),
    );

    // Saved whatever the mail does: a refused mail must not lose the registration.
    let mailed = true;
    try {
      await sendRegistrationReceived(details.email, { name: details.name, registrationNo, course: course.name });
    } catch (e) {
      mailed = false;
      console.warn(`[registration ${registrationNo}] confirmation mail not sent: ${(e as Error).message}`);
    }
    res.status(201).json({ data: { registration_no: registrationNo, course: course.name, mailed } });
  }),
);

// ------------------------------------------------------------ online payment

/** Whether the website may offer to pay online, and whether it is test mode. */
publicRoutes.get('/payments/config', (_req, res) => {
  res.json({ data: paymentConfig() });
});

/**
 * Register for a course and pay its fee online. Takes the same details as
 * `/student-registrations`, prices the course (fee plus GST) on the server, and
 * returns the Cashfree session the website opens its checkout with. Nothing is
 * registered until the payment is confirmed. Rate-limited with registrations.
 */
publicRoutes.post(
  '/student-registrations/pay',
  wrap(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.status(201).json({ data: await startRegistrationPayment(req.body ?? {}, null) });
  }),
);

/**
 * Where a website registration payment stands, checked with Cashfree. Once it
 * is paid the student is registered and enrolled, and the answer carries the
 * registration number. Only for payments the website itself started.
 */
publicRoutes.post(
  '/payments/:orderId/confirm',
  wrap(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    const orderId = String(req.params.orderId);
    await assertPublicPayment(orderId);
    const outcome = await confirmPayment(orderId);
    // The student's own registration, nothing about who else paid.
    res.json({ data: outcome });
  }),
);

/**
 * Cashfree's server-to-server notice that a payment settled. Only believed
 * when its signature checks out against the raw body; even then it is used
 * only as a prompt to read the order back from Cashfree, the same as the
 * browser's confirm. Always answers 200 once verified, so Cashfree does not
 * keep retrying a payment that is already handled.
 */
publicRoutes.post(
  '/payments/webhook',
  wrap(async (req, res) => {
    const raw = (req as typeof req & { rawBody?: string }).rawBody ?? '';
    if (!verifyWebhook(raw, req.get('x-webhook-timestamp'), req.get('x-webhook-signature'))) {
      res.status(401).json({ error: 'invalid_signature', message: 'Signature does not match.' });
      return;
    }
    const orderId = req.body?.data?.order?.order_id;
    if (typeof orderId === 'string' && orderId) {
      try {
        await confirmPayment(orderId);
      } catch (e) {
        console.warn(`[payment webhook ${orderId}] ${(e as Error).message}`);
      }
    }
    res.json({ ok: true });
  }),
);

/**
 * Register for a course, or ask a question, from the website. Filed as a new enquiry in Student ›
 * Enquiry, source Website, for head office to call back and convert. The
 * visitor has no session, so this reads none; it is rate-limited in app.ts and
 * takes only a name, a number, an email and a note.
 */
publicRoutes.post(
  '/course-enquiries',
  wrap(async (req, res) => {
    // Posted as a plain form from the website's own origin, which reads the reply.
    res.set('Access-Control-Allow-Origin', '*');
    const b = req.body ?? {};
    const clean = (v: unknown) => String(v ?? '').trim();
    const name = clean(b.name);
    const mobile = clean(b.mobile).replace(/[\s-]/g, '');
    const email = clean(b.email);
    const message = clean(b.message);
    if (!name || name.length > 150) throw badRequest('Enter your name, up to 150 characters.');
    if (!/^\+?\d{10,15}$/.test(mobile)) throw badRequest('Enter a valid mobile number.');
    if (email && (email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      throw badRequest('Enter a valid email address, or leave it blank.');
    }
    if (message.length > 1000) throw badRequest('The message is at most 1000 characters.');

    // A course page names its course; the Education page's Contact us names none.
    const course = b.course_id
      ? await db
          .selectFrom('courses')
          .select(['id', 'name', 'title'])
          .where('id', '=', Number(b.course_id) || 0)
          .where('is_active', '=', 1)
          .executeTakeFirst()
      : null;
    if (b.course_id && !course) throw notFound('Course not found.');

    await db
      .insertInto('student_enquiries')
      .values({
        name,
        mobile,
        email: email || null,
        course_id: course?.id ?? null,
        course_interested: course ? String(course.title || course.name || '').slice(0, 150) : null,
        enquiry_date: new Date(),
        source: 'Website',
        status: 'new',
        remarks: message || null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();
    res.status(201).json({ ok: true });
  }),
);

/** The Education page's Course Gallery: the active pictures, in the order added. */
publicRoutes.get(
  '/education-gallery',
  wrap(async (_req, res) => {
    const rows = await db
      .selectFrom('education_gallery')
      .select(['id', 'title', 'image'])
      .where('status', '=', 1)
      .orderBy('id')
      .execute();
    res.json({ data: rows });
  }),
);

/**
 * Verify a course certificate by its number, as the Education page asks.
 *
 * ponytail: the number alone answers with the student's name, and the numbers
 * run in sequence, so the only thing between this and a list of every student
 * is the rate limit in app.ts (60 lookups an hour per address). Asking for the
 * name as printed as well closes it, if that is ever wanted.
 */
publicRoutes.get(
  '/student-certificates/:no',
  wrap(async (req, res) => {
    const row = await db
      .selectFrom('student_certificates as cert')
      .innerJoin('students as s', 's.id', 'cert.student_id')
      .leftJoin('student_courses as sc', 'sc.id', 'cert.student_course_id')
      .leftJoin('courses as c', 'c.id', 'sc.course_id')
      .select([
        'cert.certificate_no',
        'cert.grade',
        sql<string | null>`DATE_FORMAT(cert.issued_on, '%Y-%m-%d')`.as('issued_on'),
        's.name as student_name',
        'c.name as course_name',
        'c.title as course_title',
      ])
      .where('cert.certificate_no', '=', String(req.params.no).trim().toUpperCase())
      .executeTakeFirst();

    if (!row) {
      res.status(404).json({
        error: 'not_found',
        message: 'No certificate matches that number. Check it exactly as printed on the certificate.',
      });
      return;
    }
    res.json({
      data: {
        certificate_no: row.certificate_no,
        student_name: row.student_name,
        course: row.course_title || row.course_name,
        grade: row.grade,
        issued_on: row.issued_on,
      },
    });
  }),
);

/**
 * The tally the website's home page prints: work done and where it is done.
 * Counts only — no customer, no laboratory, no money.
 */
publicRoutes.get(
  '/stats',
  wrap(async (_req, res) => {
    const count = (q: { executeTakeFirstOrThrow: () => Promise<{ n: unknown }> }) =>
      q.executeTakeFirstOrThrow().then((r) => Number(r.n));

    const [items, tested, pending, branches] = await Promise.all([
      // Every item handed in — an order can carry several.
      count(db.selectFrom('order_details').select(db.fn.countAll().as('n'))),
      // One report is one item examined, whether or not it is public to verify.
      count(db.selectFrom('reports').select(db.fn.countAll().as('n'))),
      // Items on an order still being prepared: in the laboratory now.
      count(
        db
          .selectFrom('order_details')
          .innerJoin('orders', 'orders.id', 'order_details.order_id')
          .select(db.fn.countAll().as('n'))
          .where('orders.status', '=', 'preparing'),
      ),
      count(
        db
          .selectFrom('users')
          .select(db.fn.countAll().as('n'))
          .where('role_id', '=', 2)
          .where('show_on_site', '=', 1)
          .where('is_active', '=', 1),
      ),
    ]);

    // A tally moves slowly; a few minutes stale is cheaper than counting per visitor.
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({ data: { items, tested, pending, branches } });
  }),
);

/** The website's Our Company Certificates carousel: the active ones, in the order added. */
publicRoutes.get(
  '/company-certificates',
  wrap(async (_req, res) => {
    const rows = await db
      .selectFrom('company_certificates')
      .select(['id', 'title', 'subtitle', 'icon', 'image'])
      .where('status', '=', 1)
      .orderBy('id')
      .execute();
    res.json({ data: rows });
  }),
);

/** The website's Our Reviews cards: the active reviews head office wrote, in the order added. */
publicRoutes.get(
  '/reviews',
  wrap(async (req, res) => {
    const rows = await db
      .selectFrom('reviews')
      .select(['id', 'name', 'trade', 'quote', 'rating'])
      .where('status', '=', 1)
      // Clients' by default; ?kind=student for the Education page's testimonials.
      .where('kind', '=', req.query.kind === 'student' ? 'student' : 'client')
      .orderBy('id')
      .execute();
    res.json({ data: rows });
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
        'order_detail_id',
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

    const [subcategory, [attributes], cards] = await Promise.all([
      db
        .selectFrom('subcategories')
        .select(['id', 'name'])
        .where('id', '=', Number(report.subcategory_id))
        .executeTakeFirst(),
      expandAttributes([report.description]),
      issuedCards(report.order_detail_id),
    ]);

    const { description, order_detail_id, ...card } = report;
    res.json({
      data: {
        ...card,
        // The picture as a public address: the reports folder needs a session.
        image: report.item_image ? `/public/verify/${encodeURIComponent(report.report_no)}/image` : null,
        // The original certificates the order paid for, each at /public/verify/<no>/pdf/<kind>.
        cards,
        subcategory: subcategory?.name ?? null,
        attributes: attributes.filter((a) => a.show_in_smart_card || a.show_in_classic_card),
      },
    });
  }),
);

/** The certificates an order paid for — smart, classic or both — as the Laravel verify page read them. */
async function issuedCards(orderDetailId: string | number | null): Promise<CardKind[]> {
  const od = await db
    .selectFrom('order_details')
    .select(['smart_card', 'classic_card'])
    .where('id', '=', Number(orderDetailId) || 0)
    .executeTakeFirst();
  const kinds: CardKind[] = [];
  if (Number(od?.smart_card)) kinds.push('smart');
  if (Number(od?.classic_card)) kinds.push('classic');
  return kinds;
}

/**
 * The original certificate as a PDF, for the Verify Report page: the card the
 * laboratory printed, rendered from the record the same way the panel prints
 * it. Only a kind the order paid for, and only for a verifiable report; any
 * other asks answer not found alike.
 *
 * ponytail: rendered on every request (a headless browser page each) and held
 * back by the render limit in app.ts; cache the PDF per report if traffic grows.
 */
publicRoutes.get(
  '/verify/:reportNo/pdf/:kind',
  wrap(async (req, res) => {
    const kind = String(req.params.kind) as CardKind;
    const report = await db
      .selectFrom('reports')
      .select(['id', 'order_detail_id'])
      .where('report_no', '=', String(req.params.reportNo))
      .where('hidden_on_site', '=', 0)
      .executeTakeFirst();
    if (!report || !(await issuedCards(report.order_detail_id)).includes(kind)) {
      throw notFound('Certificate not found.');
    }

    const [cards, chrome] = await Promise.all([cardDataFor([Number(report.id)]), loadChrome()]);
    const pdf = await renderCardsPdf(kind, cards, chrome);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${cards[0].report_no}-${kind}.pdf"`);
    res.setHeader('Content-Length', String(pdf.length));
    res.setHeader('Cache-Control', 'public, max-age=300');
    // Shown inside the website's Verify Report page, which is another origin:
    // helmet's SAMEORIGIN would blank the frame. A PDF view has no action to hijack.
    res.removeHeader('X-Frame-Options');
    res.end(pdf);
  }),
);

/**
 * A verifiable report's item picture, for the website's Verify Report page.
 * Only for a report /verify would show — withheld ones answer not found, the
 * same as a number never issued.
 */
publicRoutes.get(
  '/verify/:reportNo/image',
  wrap(async (req, res, next) => {
    const report = await db
      .selectFrom('reports')
      .select('item_image')
      .where('report_no', '=', String(req.params.reportNo))
      .where('hidden_on_site', '=', 0)
      .executeTakeFirst();
    sendUpload(report?.item_image, req, res, next);
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
