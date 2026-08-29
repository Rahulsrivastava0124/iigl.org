import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { notFound } from '../lib/errors.js';
import { expandAttributes } from '../services/report.service.js';
import { numericId } from '../middleware/params.js';
export const publicRoutes = Router();
publicRoutes.get('/pages/:pageType', wrap(async (req, res) => {
    const row = await db
        .selectFrom('websites')
        .selectAll()
        .where('page_type', '=', String(req.params.pageType))
        .executeTakeFirst();
    if (!row)
        throw notFound('Page not found.');
    res.json({ data: row });
}));
publicRoutes.get('/blogs', wrap(async (_req, res) => {
    const rows = await db
        .selectFrom('blogs')
        .select(['id', 'page_name', 'slug', 'thumbnail', 'banner', 'meta_title', 'meta_description', 'created_at'])
        .orderBy('id', 'desc')
        .execute();
    res.json({ data: rows });
}));
publicRoutes.get('/blogs/:slug', wrap(async (req, res) => {
    const row = await db
        .selectFrom('blogs')
        .selectAll()
        .where('slug', '=', String(req.params.slug))
        .executeTakeFirst();
    if (!row)
        throw notFound('Article not found.');
    res.json({ data: row });
}));
publicRoutes.get('/branches', wrap(async (_req, res) => {
    const rows = await db.selectFrom('branches').select(['id', 'city', 'pageURL', 'img', 'title']).execute();
    res.json({ data: rows });
}));
publicRoutes.get('/branches/:slug', wrap(async (req, res) => {
    const row = await db
        .selectFrom('branches')
        .selectAll()
        .where('pageURL', '=', String(req.params.slug))
        .executeTakeFirst();
    if (!row)
        throw notFound('Branch page not found.');
    res.json({ data: row });
}));
publicRoutes.get('/report-types', wrap(async (_req, res) => {
    const rows = await db.selectFrom('reporttypes').selectAll().execute();
    res.json({ data: rows });
}));
publicRoutes.get('/banners', wrap(async (req, res) => {
    let q = db.selectFrom('banners').selectAll().where('status', '=', 1);
    if (req.query.type)
        q = q.where('img_type', '=', String(req.query.type));
    res.json({ data: await q.execute() });
}));
/**
 * Look up by report id rather than report number. Every certificate printed so
 * far carries a QR pointing at /verify-report/{id}, so this path has to keep
 * resolving after cutover or those documents stop verifying.
 */
publicRoutes.get('/verify-by-id/:id', numericId, wrap(async (req, res, next) => {
    const row = await db
        .selectFrom('reports')
        .select('report_no')
        .where('id', '=', Number(req.params.id))
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
}));
/**
 * Certificate verification. Public by design, so it returns only what appears
 * on the card and never the customer record behind it.
 */
publicRoutes.get('/verify/:reportNo', wrap(async (req, res) => {
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
}));
/** Logs a verification lookup, matching the reportsearches table. */
publicRoutes.post('/verify-log', wrap(async (req, res) => {
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
}));
