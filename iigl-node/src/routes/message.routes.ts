import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { paged, readPage } from '../lib/paginate.js';
import { assertEmploys, empidOf, requireLabScope, ROLE } from '../middleware/auth.js';
import { numericId } from '../middleware/params.js';
import type { SessionUser } from '../lib/session.js';

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

/** What a request is about, when it was written from a template. */
const TOPICS = new Set(['leave', 'punch']);

/** How a request was answered. */
const DECISIONS = new Set(['approved', 'declined']);

/**
 * One person's thread, as this reader may see it.
 *
 * Three different answers, and the reason they differ is who the messages were
 * addressed to:
 *
 *   themselves   what they wrote
 *   head office  the whole thread, either direction — a laboratory's employee
 *                writes to the laboratory, never to head office, so "addressed
 *                to me" showed head office an empty inbox beside a calendar
 *                marked with the days those very messages named
 *   an employer  both sides of their own exchange with this person. Not only
 *                what was sent to them: a reply is written back as a message,
 *                and "addressed to me" drops every answer the employer gave,
 *                including the one they wrote a moment ago
 *
 * One builder because the rows and the count are selected by it, and a rule
 * written twice is a pager describing a list nobody is looking at.
 */
function threadWith(eb: any, from: number, user: SessionUser, prefix = '') {
  const col = (name: string) => `${prefix}${name}` as never;
  if (from === user.id) return eb(col('from_user'), '=', from);
  if (user.roleId === ROLE.SUPER) {
    return eb.or([eb(col('from_user'), '=', from), eb(col('to_user'), '=', from)]);
  }
  return eb.or([
    eb.and([eb(col('from_user'), '=', from), eb(col('to_user'), '=', user.id)]),
    eb.and([eb(col('from_user'), '=', user.id), eb(col('to_user'), '=', from)]),
  ]);
}

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
 * Everybody this account may write to.
 *
 * Staff have exactly one recipient — the person who employs them — so the
 * panel does not ask them; it says who it is going to. An employer has a list,
 * and the list is what the compose box selects from:
 *
 *   head office   every laboratory, and everybody they employ
 *   laboratory    its own staff
 *
 * Nobody writes sideways. A message here is between somebody and the person
 * they answer to, in one direction or the other, and a colleague-to-colleague
 * channel is a different feature with different rules about who may read it.
 */
messageRoutes.get(
  '/recipients',
  wrap(async (req, res) => {
    if (req.user.roleId === ROLE.SUPER) {
      const rows = await db
        .selectFrom('users')
        .leftJoin('employements', (join) =>
          join.onRef('employements.user_id', '=', 'users.id').on('employements.is_working', '=', '1'),
        )
        .leftJoin('users as employer', 'employer.empid', 'employements.parent_id')
        .select([
          'users.id as id',
          'users.fullname as fullname',
          'users.empid as empid',
          'users.role_id as role_id',
          'users.profile_photo as profile_photo',
          'employer.fullname as employer_name',
        ])
        .where('users.id', '!=', req.user.id)
        .where('users.is_active', '=', 1)
        /*
          Laboratories, and head office's **own** employees. Not every employee
          of every laboratory: a laboratory's staff answer to that laboratory,
          and head office writing to them past it is exactly the sideways line
          this system does not draw.
        */
        .where((eb) =>
          eb.or([eb('users.role_id', '=', ROLE.LAB), eb('employer.id', '=', req.user.id)]),
        )
        .orderBy('users.role_id')
        .orderBy('users.fullname')
        .execute();
      res.json({ data: rows });
      return;
    }

    /*
      Employer or employee, decided by whether anybody actually works under
      them — not by whether they have an `empid`, which everybody has. Reading
      it that way listed a staff member's own non-existent staff and left them
      with nobody to write to.
    */
    const mine = await empidOf(req.user.id);
    const employs = mine
      ? await db
          .selectFrom('employements')
          .select('id')
          .where('parent_id', '=', mine)
          .where('is_working', '=', '1')
          .executeTakeFirst()
      : undefined;

    if (!employs) {
      // Staff: one recipient, and the panel names it rather than listing it.
      const employer = await employerOf(req.user.id);
      const row = employer
        ? await db
            .selectFrom('users')
            .select(['id', 'fullname', 'empid', 'role_id'])
            .where('id', '=', employer)
            .executeTakeFirst()
        : undefined;
      res.json({ data: row ? [{ ...row, employer_name: null }] : [] });
      return;
    }

    const rows = await db
      .selectFrom('employements')
      .innerJoin('users', 'users.id', 'employements.user_id')
      .select([
        'users.id as id',
        'users.fullname as fullname',
        'users.empid as empid',
        'users.role_id as role_id',
        'users.profile_photo as profile_photo',
      ])
      .where('employements.parent_id', '=', mine as string)
      .where('employements.is_working', '=', '1')
      .where('users.id', '!=', req.user.id)
      .orderBy('users.fullname')
      .execute();

    res.json({ data: rows.map((r) => ({ ...r, employer_name: null })) });
  }),
);

/**
 * Write a message, to one person or to several.
 *
 * Both directions now. Staff write upward and name nobody: they have exactly
 * one employer, and a field for it would be a field to get wrong. An employer
 * writes downward and says who to — one row per recipient, so each is dealt
 * with, or not, on its own; a single row addressed to nine people is one that
 * eight of them cannot answer.
 *
 * Who may write to whom is checked here rather than trusted from the body:
 * head office to any laboratory or employee, a laboratory to its own staff, and
 * staff to their employer. Nobody writes sideways.
 */
messageRoutes.post(
  '/',
  wrap(async (req, res) => {
    const body = String(req.body?.body ?? '').trim();
    if (body.length > 2000) throw badRequest('That is too long for a note. Keep it under 2000 characters.');

    /*
      A photograph or PDF, uploaded first to uploads/message and named here by
      its path. Only a path inside the uploads area is accepted, so a message
      cannot be made to point at a file somewhere else and have the chat render
      it as though it had been sent.

      A file on its own is a message: a scan needs no sentence to go with it.
    */
    const attachment = String(req.body?.attachment ?? '').trim() || null;
    if (
      attachment &&
      (attachment.length > 255 ||
        attachment.includes('..') ||
        !/^(public\/)?uploads\/message\/[A-Za-z0-9._-]+$/.test(attachment))
    ) {
      throw badRequest('That attachment is not a file sent in a message.');
    }
    if (!body && !attachment) throw badRequest('Write something or attach a file first.');

    const kind = String(req.body?.kind ?? 'message');
    if (!KINDS.has(kind)) throw badRequest('Kind is "message" or "request".');

    /*
      What the request is about, from the template it was written on.

      Leave and a punch to correct are both requests naming a day, and the only
      other thing that told them apart was the sentence — which the person
      writing is free to rewrite. The Employee list has to say whether somebody
      is on leave today, and that is not a question prose can answer.

      Absent for anything typed from scratch, which is honest: it is a request,
      and nothing claims to know which kind.
    */
    const topic = String(req.body?.topic ?? '').trim() || null;
    if (topic && !TOPICS.has(topic)) throw badRequest('Topic is "leave" or "punch".');

    const about = String(req.body?.about_date ?? '').trim();
    if (about && !/^\d{4}-\d{2}-\d{2}$/.test(about)) {
      throw badRequest('The date it is about must be YYYY-MM-DD.');
    }

    /*
      Who it is for.

      Given, it is an employer writing downward and every id is checked. Absent,
      it is staff writing to the one person they answer to, which nobody has to
      name.
    */
    const asked: number[] = Array.isArray(req.body?.to)
      ? (req.body.to as unknown[]).map((v) => Number(v))
      : req.body?.to !== undefined && req.body?.to !== null && req.body?.to !== ''
        ? [Number(req.body.to)]
        : [];

    /*
      A reply goes back to whoever wrote the message it answers — whoever that
      is. Answering somebody who wrote to you needs no other permission: head
      office writing to a laboratory is exactly how a laboratory comes to write
      back to head office, which it has no other way to reach.
    */
    const rawReply = req.body?.reply_to;
    const replyTo = rawReply === undefined || rawReply === null || rawReply === '' ? null : Number(rawReply);

    let recipients: number[];

    if (replyTo !== null) {
      if (!Number.isInteger(replyTo) || replyTo <= 0) throw badRequest('That is not a message.');
      const original = await db
        .selectFrom('staff_messages')
        .select(['id', 'from_user', 'to_user'])
        .where('id', '=', replyTo)
        .executeTakeFirst();
      if (!original) throw notFound('That message is no longer there.');
      if (Number(original.to_user) !== req.user.id) {
        throw forbidden('You can only reply to a message written to you.');
      }
      recipients = [Number(original.from_user)];
    } else if (asked.length > 0) {
      if (asked.some((id) => !Number.isInteger(id) || id <= 0)) {
        throw badRequest('That is not a person.');
      }
      if (asked.length > 100) throw badRequest('That is too many people for one message.');

      if (req.user.roleId !== ROLE.SUPER) {
        // A laboratory writes to the people it employs, and to nobody else.
        for (const id of asked) await assertEmploys(req.user, id);
      } else {
        /*
          Head office writes to laboratories and to its own employees — checked
          here, not only by what the panel lists, so a crafted request cannot
          reach a laboratory's staff past the laboratory.
        */
        const mine = await empidOf(req.user.id);
        const allowed = await db
          .selectFrom('users')
          .leftJoin('employements', (join) =>
            join.onRef('employements.user_id', '=', 'users.id').on('employements.is_working', '=', '1'),
          )
          .select('users.id')
          .where('users.id', 'in', asked)
          .where((eb) =>
            eb.or([
              eb('users.role_id', '=', ROLE.LAB),
              ...(mine ? [eb('employements.parent_id', '=', mine)] : []),
            ]),
          )
          .execute();
        const ok = new Set(allowed.map((r) => Number(r.id)));
        if (asked.some((id) => !ok.has(id))) {
          throw forbidden('Head office writes to laboratories and to its own employees only.');
        }
      }
      recipients = [...new Set(asked)].filter((id) => id !== req.user.id);
      if (recipients.length === 0) throw badRequest('Choose somebody to write to.');
    } else {
      const employer = await employerOf(req.user.id);
      if (!employer) {
        throw badRequest('Nobody employs this account, so there is nobody to write to.');
      }
      recipients = [employer];
    }

    // One row each. A message to nine people is nine things to be dealt with.
    const now = new Date();
    const rows = recipients.map((to) => ({
      from_user: req.user.id,
      to_user: to,
      kind,
      topic,
      body,
      attachment,
      about_date: about ? new Date(`${about}T00:00:00`) : null,
      // Folds the answer under the message it answers, in both inboxes.
      reply_to: replyTo,
      created_at: now,
      updated_at: now,
    }));

    const result = await db.insertInto('staff_messages').values(rows).executeTakeFirst();

    res.status(201).json({ data: { id: Number(result.insertId), sent: recipients.length } });
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
      .leftJoin('users as recipient', 'recipient.id', 'staff_messages.to_user')
      .select([
        'staff_messages.id as id',
        'staff_messages.kind as kind',
        // What the request is about, and how it was answered. Both are what
        // the reader's badge says, and neither can be read off the prose.
        'staff_messages.topic as topic',
        'staff_messages.decision as decision',
        'staff_messages.body as body',
        'staff_messages.attachment as attachment',
        'staff_messages.about_date as about_date',
        'staff_messages.reply_to as reply_to',
        'staff_messages.resolved_at as resolved_at',
        'staff_messages.created_at as created_at',
        'staff_messages.from_user as from_user',
        'staff_messages.to_user as to_user',
        'author.fullname as from_name',
        // Whom it was written to, by name: a conversation list groups what you
        // sent under the person you sent it to, and needs to call them something.
        'recipient.fullname as to_name',
        // Both faces, for the chat's list and header.
        'author.profile_photo as from_photo',
        'recipient.profile_photo as to_photo',
        // Whose words these are, by role. The bell opens a message on the
        // sender's employee page only when the sender is somebody the reader
        // employs; a laboratory's reply to its staff, or head office writing
        // to a laboratory, has no such page, and opening one showed an empty
        // record reading "That account is not one of your employees".
        'author.role_id as from_role_id',
        // And whom they were written to, by role — so a laboratory's page can
        // keep its conversation with head office apart from its staff's.
        'recipient.role_id as to_role_id',
      ]);

    if (req.query.from) {
      const from = Number(req.query.from);
      // Their own, or one of your people's. Anybody else's is not yours to read.
      if (from !== req.user.id) await assertEmploys(req.user, from);
      q = q.where((eb) => threadWith(eb, from, req.user, 'staff_messages.'));
    } else if (req.query.box === 'all') {
      /*
        The whole conversation between this account and everybody it writes to
        or hears from — which, for staff, is their employer. Both directions in
        one list, because a reply read apart from what it replies to is half a
        sentence.
      */
      q = q.where((eb) =>
        eb.or([
          eb('staff_messages.to_user', '=', req.user.id),
          eb('staff_messages.from_user', '=', req.user.id),
        ]),
      );
    } else {
      q = q.where('staff_messages.to_user', '=', req.user.id);
    }

    if (req.query.open === '1') q = q.where('staff_messages.resolved_at', 'is', null);

    const rows = await q.orderBy('staff_messages.id', 'desc').limit(p.limit).offset(p.offset).execute();

    let c = db.selectFrom('staff_messages').select(db.fn.countAll().as('n'));
    if (req.query.from) {
      // The same rule the rows were selected by. Written twice, the two drift
      // and the pager describes a list nobody is looking at.
      c = c.where((eb) => threadWith(eb, Number(req.query.from), req.user));
    } else if (req.query.box === 'all') {
      c = c.where((eb) =>
        eb.or([eb('to_user', '=', req.user.id), eb('from_user', '=', req.user.id)]),
      );
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
      .select(['id', 'to_user', 'from_user', 'about_date', 'resolved_at'])
      .where('id', '=', Number(req.params.id))
      .executeTakeFirst();
    if (!row) throw notFound('That message does not exist.');
    if (Number(row.to_user) !== req.user.id && req.user.roleId !== ROLE.SUPER) {
      throw forbidden('That message was not written to you.');
    }

    const done = req.body?.resolved !== false;

    /*
      What was decided, and what to say about it.

      "Dealt with" was the whole of the answer, and it does not tell the person
      who asked whether they got the day off. A decision is optional so that
      closing a plain message — which nobody approves — still works exactly as
      it did.

      The reply is a message rather than a field on this row: written back to
      whoever asked, in the table that already holds messages, so it reaches
      their inbox instead of sitting on a record they have no reason to reopen.
    */
    const decision = String(req.body?.decision ?? '').trim() || null;
    if (decision && !DECISIONS.has(decision)) {
      throw badRequest('A decision is "approved" or "declined".');
    }
    const reply = String(req.body?.reply ?? '').trim();
    if (reply.length > 2000) throw badRequest('That reply is too long. Keep it under 2000 characters.');

    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable('staff_messages')
        .set({
          resolved_at: done ? new Date() : null,
          resolved_by: done ? req.user.id : null,
          // Reopening drops the decision with the timestamp: a request that is
          // open again has not been answered, whatever was said before.
          decision: done ? decision : null,
          updated_at: new Date(),
        })
        .where('id', '=', Number(row.id))
        .execute();

      if (done && reply && Number(row.from_user) !== req.user.id) {
        const now = new Date();
        await trx
          .insertInto('staff_messages')
          .values({
            from_user: req.user.id,
            to_user: Number(row.from_user),
            // A reply is not itself a request: nothing is expected back, so it
            // must not land in anybody's open list.
            kind: 'message',
            topic: null,
            body: reply,
            // The day the request was about, so the reply sits on the same day
            // of their calendar as the thing it answers.
            about_date: row.about_date ? new Date(row.about_date) : null,
            // And what it answers, so the inbox folds it into that row rather
            // than listing it above as an unrelated message.
            reply_to: Number(row.id),
            created_at: now,
            updated_at: now,
          })
          .execute();
      }
    });

    res.json({ data: { id: Number(row.id), resolved: done, decision: done ? decision : null } });
  }),
);

/** Who this account writes to, so the panel can say so before anybody types. */
messageRoutes.get(
  '/employer',
  wrap(async (req, res) => {
    const id = await employerOf(req.user.id);
    const employer = id
      ? await db.selectFrom('users').select(['id', 'fullname', 'profile_photo']).where('id', '=', id).executeTakeFirst()
      : null;
    res.json({ data: employer ?? null, empid: await empidOf(req.user.id) });
  }),
);
