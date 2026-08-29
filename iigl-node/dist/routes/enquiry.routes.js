import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { badRequest, notFound } from '../lib/errors.js';
import { paged, readPage } from '../lib/paginate.js';
import { requireAdmin } from '../middleware/auth.js';
import { numericId } from '../middleware/params.js';
/**
 * Enquiries.
 *
 * The Laravel sidebar's Enquiry menu had four entries — Enquiry from Ask Me,
 * Visitor's Diary, Lead followup, Complain — all `href="#"`, with no table
 * behind any of them. New ground; see migrations/003.
 *
 * They are one table with a `kind`, because the four differ in what they are
 * about rather than in what is recorded: a name, a number, what was said, who
 * is dealing with it, and whether it is finished.
 *
 * Nothing here is public. The website's own form does not post to this yet —
 * an unauthenticated write endpoint is a spam target and wants a rate limit and
 * a captcha decision of its own, which is a separate piece of work.
 */
export const enquiryRoutes = Router();
enquiryRoutes.use(requireAdmin);
/** What the enquiry is about. The old menu's four entries. */
export const ENQUIRY_KIND = ['ask', 'visit', 'lead', 'complaint'];
/** How far along it is. */
export const ENQUIRY_STATUS = ['new', 'open', 'closed'];
const text = (v) => (v == null || v === '' ? null : String(v).trim());
const requireText = (v, field) => {
    const s = text(v);
    if (!s)
        throw badRequest(`${field} is required.`);
    return s;
};
const kindOf = (v, fallback) => {
    if (v == null || v === '') {
        if (fallback)
            return fallback;
        throw badRequest('A kind is required.');
    }
    const s = String(v);
    if (!ENQUIRY_KIND.includes(s)) {
        throw badRequest(`Unknown kind. Expected one of: ${ENQUIRY_KIND.join(', ')}.`);
    }
    return s;
};
const statusOf = (v, fallback) => {
    if (v == null || v === '') {
        if (fallback)
            return fallback;
        throw badRequest('A status is required.');
    }
    const s = String(v);
    if (!ENQUIRY_STATUS.includes(s)) {
        throw badRequest(`Unknown status. Expected one of: ${ENQUIRY_STATUS.join(', ')}.`);
    }
    return s;
};
enquiryRoutes.get('/', wrap(async (req, res) => {
    const p = readPage(req);
    const kind = req.query.kind ? kindOf(req.query.kind) : null;
    const status = req.query.status ? statusOf(req.query.status) : null;
    const term = String(req.query.q ?? '').trim();
    const filtered = (q) => {
        let out = q;
        if (kind)
            out = out.where('kind', '=', kind);
        if (status)
            out = out.where('status', '=', status);
        if (term) {
            const like = `%${term}%`;
            out = out.where((eb) => eb.or([
                eb('name', 'like', like),
                eb('mobile', 'like', like),
                eb('email', 'like', like),
                eb('subject', 'like', like),
            ]));
        }
        return out;
    };
    const [rows, count] = await Promise.all([
        filtered(db.selectFrom('enquiries').selectAll())
            // Newest first, but anything still open outranks anything closed: the
            // list is a queue of work, not an archive.
            .orderBy('status', 'asc')
            .orderBy('id', 'desc')
            .limit(p.limit)
            .offset(p.offset)
            .execute(),
        filtered(db.selectFrom('enquiries').select(db.fn.countAll().as('n'))).executeTakeFirstOrThrow(),
    ]);
    res.json(paged(rows, Number(count.n), p));
}));
/** Counts per kind and per status, for the tabs and the badge. */
enquiryRoutes.get('/summary', wrap(async (_req, res) => {
    const [byKind, byStatus] = await Promise.all([
        db
            .selectFrom('enquiries')
            .select(({ fn }) => ['kind', fn.countAll().as('n')])
            .groupBy('kind')
            .execute(),
        db
            .selectFrom('enquiries')
            .select(({ fn }) => ['status', fn.countAll().as('n')])
            .groupBy('status')
            .execute(),
    ]);
    const kinds = Object.fromEntries(ENQUIRY_KIND.map((k) => [k, 0]));
    for (const r of byKind)
        kinds[String(r.kind)] = Number(r.n);
    const statuses = Object.fromEntries(ENQUIRY_STATUS.map((s) => [s, 0]));
    for (const r of byStatus)
        statuses[String(r.status)] = Number(r.n);
    res.json({ data: { kinds, statuses, waiting: statuses.new + statuses.open } });
}));
enquiryRoutes.get('/:id', numericId, wrap(async (req, res) => {
    const row = await db
        .selectFrom('enquiries')
        .selectAll()
        .where('id', '=', Number(req.params.id))
        .executeTakeFirst();
    if (!row)
        throw notFound('Enquiry not found.');
    res.json({ data: row });
}));
enquiryRoutes.post('/', wrap(async (req, res) => {
    const b = req.body ?? {};
    const result = await db
        .insertInto('enquiries')
        .values({
        kind: kindOf(b.kind, 'ask'),
        name: requireText(b.name, 'Name'),
        mobile: requireText(b.mobile, 'Mobile number'),
        email: text(b.email),
        subject: text(b.subject),
        message: text(b.message),
        source: text(b.source),
        status: statusOf(b.status, 'new'),
        assigned_to: b.assigned_to ? Number(b.assigned_to) : null,
        lab_id: b.lab_id ? Number(b.lab_id) : null,
        remark: text(b.remark),
        added_by: req.user.id,
        created_at: new Date(),
        updated_at: new Date(),
    })
        .executeTakeFirstOrThrow();
    res.status(201).json({ data: { id: Number(result.insertId) } });
}));
enquiryRoutes.patch('/:id', numericId, wrap(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await db
        .selectFrom('enquiries')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
    if (!existing)
        throw notFound('Enquiry not found.');
    const b = req.body ?? {};
    const patch = {};
    if (b.kind !== undefined)
        patch.kind = kindOf(b.kind);
    if (b.name !== undefined)
        patch.name = requireText(b.name, 'Name');
    if (b.mobile !== undefined)
        patch.mobile = requireText(b.mobile, 'Mobile number');
    if (b.email !== undefined)
        patch.email = text(b.email);
    if (b.subject !== undefined)
        patch.subject = text(b.subject);
    if (b.message !== undefined)
        patch.message = text(b.message);
    if (b.source !== undefined)
        patch.source = text(b.source);
    if (b.remark !== undefined)
        patch.remark = text(b.remark);
    if (b.assigned_to !== undefined) {
        patch.assigned_to = b.assigned_to ? Number(b.assigned_to) : null;
    }
    if (b.status !== undefined) {
        const status = statusOf(b.status);
        patch.status = status;
        // Closing stamps the time; reopening clears it, so the column always
        // answers "when was this finished" rather than "when was it last closed".
        patch.closed_at = status === 'closed' ? new Date() : null;
    }
    if (Object.keys(patch).length === 0)
        throw badRequest('Nothing to update.');
    patch.updated_at = new Date();
    await db.updateTable('enquiries').set(patch).where('id', '=', id).execute();
    res.json({ ok: true });
}));
enquiryRoutes.delete('/:id', numericId, wrap(async (req, res) => {
    const result = await db
        .deleteFrom('enquiries')
        .where('id', '=', Number(req.params.id))
        .executeTakeFirst();
    if (!Number(result.numDeletedRows))
        throw notFound('Enquiry not found.');
    res.json({ ok: true });
}));
