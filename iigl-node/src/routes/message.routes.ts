import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { paged, readPage } from '../lib/paginate.js';
import { assertEmploys, empidOf, requireLabScope, ROLE } from '../middleware/auth.js';
import { numericId } from '../middleware/params.js';

/**
 * Messages and requests, from staff to the person who employs them.
 *
 * The Laravel sidebars drew a Message menu and never built it — both entries
 * are `href="#"`. This is the whole of it: an employee writes a line to their
 * employer, and the employer reads it on that employee's page, beside the
 * attendance it is usually about.
 *
 * Deliberately not a mail system. No threads, no replies, no attachments, no
 * writing sideways to a colleague. One direction, because that is the direction
 * the need runs in: "I forgot to punch out on Tuesday", "I need Friday off".
 *
 * A request is a message that expects something to happen, and `resolved_at`
 * is the whole of its state — unread and unactioned are the same thing to the
 * person who has to act on it.
 */
export const messageRoutes = Router();
messageRoutes.use(requireLabScope);

const KINDS = new Set(['message', 'request']);

/** The account this person answers to: their employer, by `employements`. */
async function employerOf(userId: number): Promise<number | null> {
  const posting = await db
    .selectFrom('employements')
    .select('parent_id')
    .where('user_id', '=', userId)
    .where('is_working', '=', '1')
    .executeTakeFirst();
  if (!posting?.parent_id) return null;

  const employer = await db
    .selectFrom('users')
    .select('id')
    .where('empid', '=', posting.parent_id)
    .executeTakeFirst();
  return employer ? Number(employer.id) : null;
}

/**
 * Write to your employer.
 *
 * There is no recipient in the body: staff have exactly one employer, and a
 * field for it would be a field to get wrong. Somebody nobody employs — a
 * laboratory, head office — has nobody to write to, and is told so rather than
 * having the message go nowhere.
 */
messageRoutes.post(
  '/',
  wrap(async (req, res) => {
    const body = String(req.body?.body ?? '').trim();
    if (!body) throw badRequest('Write something first.');
    if (body.length > 2000) throw badRequest('That is too long for a note. Keep it under 2000 characters.');

    const kind = String(req.body?.kind ?? 'message');
    if (!KINDS.has(kind)) throw badRequest('Kind is "message" or "request".');

    const about = String(req.body?.about_date ?? '').trim();
    if (about && !/^\d{4}-\d{2}-\d{2}$/.test(about)) {
      throw badRequest('The date it is about must be YYYY-MM-DD.');
    }

    const employer = await employerOf(req.user.id);
    if (!employer) {
      throw badRequest('Nobody employs this account, so there is nobody to write to.');
    }

    const result = await db
      .insertInto('staff_messages')
      .values({
        from_user: req.user.id,
        to_user: employer,
        kind,
        body,
        about_date: about ? new Date(`${about}T00:00:00`) : null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .executeTakeFirst();

    res.status(201).json({ data: { id: Number(result.insertId) } });
  }),
);

/**
 * The inbox, or one employee's messages.
 *
 * Without `from` it is what has been written to you. With it, what one person
 * has written — the employee page asks that way, and `assertEmploys` decides
 * whether they are yours to read.
 *
 * `open=1` narrows to what has not been dealt with, which is what the page
 * showing it beside somebody's attendance actually wants.
 */
messageRoutes.get(
  '/',
  wrap(async (req, res) => {
    const p = readPage(req, 50, 200);

    let q = db
      .selectFrom('staff_messages')
      .leftJoin('users as author', 'author.id', 'staff_messages.from_user')
      .select([
        'staff_messages.id as id',
        'staff_messages.kind as kind',
        'staff_messages.body as body',
        'staff_messages.about_date as about_date',
        'staff_messages.resolved_at as resolved_at',
        'staff_messages.created_at as created_at',
        'staff_messages.from_user as from_user',
        'author.fullname as from_name',
      ]);

    if (req.query.from) {
      const from = Number(req.query.from);
      // Their own, or one of your people's. Anybody else's is not yours to read.
      if (from !== req.user.id) await assertEmploys(req.user, from);
      q = q.where('staff_messages.from_user', '=', from);
      // A person reading their own sees what they sent; an employer sees what
      // was sent to them, which for their own staff is the same rows.
      if (from !== req.user.id) q = q.where('staff_messages.to_user', '=', req.user.id);
    } else {
      q = q.where('staff_messages.to_user', '=', req.user.id);
    }

    if (req.query.open === '1') q = q.where('staff_messages.resolved_at', 'is', null);

    const rows = await q.orderBy('staff_messages.id', 'desc').limit(p.limit).offset(p.offset).execute();

    let c = db.selectFrom('staff_messages').select(db.fn.countAll().as('n'));
    if (req.query.from) {
      c = c.where('from_user', '=', Number(req.query.from));
      if (Number(req.query.from) !== req.user.id) c = c.where('to_user', '=', req.user.id);
    } else {
      c = c.where('to_user', '=', req.user.id);
    }
    if (req.query.open === '1') c = c.where('resolved_at', 'is', null);
    const count = await c.executeTakeFirstOrThrow();

    res.json(paged(rows, Number(count.n), p));
  }),
);

/** Mark one dealt with. The reader's, not the writer's: they asked, you answer. */
messageRoutes.patch(
  '/:id/resolve',
  numericId,
  wrap(async (req, res) => {
    const row = await db
      .selectFrom('staff_messages')
      .select(['id', 'to_user', 'resolved_at'])
      .where('id', '=', Number(req.params.id))
      .executeTakeFirst();
    if (!row) throw notFound('That message does not exist.');
    if (Number(row.to_user) !== req.user.id && req.user.roleId !== ROLE.SUPER) {
      throw forbidden('That message was not written to you.');
    }

    const done = req.body?.resolved !== false;
    await db
      .updateTable('staff_messages')
      .set({
        resolved_at: done ? new Date() : null,
        resolved_by: done ? req.user.id : null,
        updated_at: new Date(),
      })
      .where('id', '=', Number(row.id))
      .execute();

    res.json({ data: { id: Number(row.id), resolved: done } });
  }),
);

/** Who this account writes to, so the panel can say so before anybody types. */
messageRoutes.get(
  '/employer',
  wrap(async (req, res) => {
    const id = await employerOf(req.user.id);
    const employer = id
      ? await db.selectFrom('users').select(['id', 'fullname']).where('id', '=', id).executeTakeFirst()
      : null;
    res.json({ data: employer ?? null, empid: await empidOf(req.user.id) });
  }),
);
