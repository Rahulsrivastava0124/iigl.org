import { db } from '../db/index.js';
import { badRequest, notFound } from '../lib/errors.js';
/**
 * Follow-ups, for both enquiry books.
 *
 * There are two: `enquiries` (Ask Me, Visitor's Diary, Lead Followup,
 * Complaints) and `student_enquiries` (somebody asking about a course). They
 * are different records but they are worked identically — somebody calls,
 * nobody picks up, they call again on Tuesday — so one log serves both, keyed
 * by `enquiry_type`, and one piece of code writes it.
 *
 * Two log tables would have meant two endpoints, two components, and two
 * chances for the history to be shown one way here and another way there.
 */
export const ENQUIRY_TYPE = ['enquiry', 'student'];
/** How one attempt to reach somebody went. */
export const FOLLOWUP_OUTCOME = [
    'reached',
    'no_answer',
    'interested',
    'not_interested',
    'converted',
];
/**
 * What each book's status column allows. Kept in step with `ENQUIRY_STATUS` in
 * the two route files, which is where each is validated on its own endpoints.
 */
const STATUSES = {
    enquiry: ['new', 'open', 'closed'],
    student: ['new', 'contacted', 'interested', 'converted', 'not_interested'],
};
/**
 * The record itself, from whichever book it is in.
 *
 * Branched rather than a dynamic table name: Kysely types a query against the
 * table it names, and a name held in a variable throws all of that away.
 */
async function findEnquiry(type, id) {
    const row = type === 'enquiry'
        ? await db.selectFrom('enquiries').select(['id', 'status']).where('id', '=', id).executeTakeFirst()
        : await db
            .selectFrom('student_enquiries')
            .select(['id', 'status'])
            .where('id', '=', id)
            .executeTakeFirst();
    if (!row)
        throw notFound('Enquiry not found.');
    return row;
}
const text = (v) => (v == null || v === '' ? null : String(v).trim());
/** `YYYY-MM-DD` in, a Date the column takes out. */
export const dateOf = (v) => {
    const s = text(v);
    if (!s)
        return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s))
        throw badRequest('A date must be YYYY-MM-DD.');
    const d = new Date(`${s}T00:00:00`);
    if (Number.isNaN(d.getTime()))
        throw badRequest(`${s} is not a date.`);
    return d;
};
/** The history of one record, newest first. */
export async function followupsFor(type, id) {
    await findEnquiry(type, id);
    return db
        .selectFrom('enquiry_followups as f')
        .leftJoin('users as u', 'u.id', 'f.done_by')
        .select([
        'f.id',
        'f.enquiry_id',
        'f.note',
        'f.outcome',
        'f.next_follow_up_on',
        'f.status_from',
        'f.status_to',
        'f.done_by',
        'f.created_at',
        'u.fullname as done_by_name',
    ])
        .where('f.enquiry_type', '=', type)
        .where('f.enquiry_id', '=', id)
        .orderBy('f.id', 'desc')
        .execute();
}
/**
 * Record one attempt.
 *
 * Writes three things in step: the log row, the record's next follow-up date,
 * and — when one is asked for and it differs — its status. The move is written
 * onto the log row as well as applied, so the history says how the enquiry
 * reached its status rather than only what that status now is.
 */
export async function recordFollowup(type, id, body, doneBy) {
    const current = await findEnquiry(type, id);
    const outcome = String(body.outcome ?? 'reached');
    if (!FOLLOWUP_OUTCOME.includes(outcome)) {
        throw badRequest(`Unknown outcome. Expected one of: ${FOLLOWUP_OUTCOME.join(', ')}.`);
    }
    const next = dateOf(body.next_follow_up_on);
    const from = String(current.status);
    let to = null;
    if (body.status !== undefined && body.status !== null && body.status !== '') {
        to = String(body.status);
        if (!STATUSES[type].includes(to)) {
            throw badRequest(`Unknown status. Expected one of: ${STATUSES[type].join(', ')}.`);
        }
    }
    // Only recorded when it actually changed, so "called, nothing moved" and
    // "called and closed it" are different entries rather than the same one.
    const moved = to !== null && to !== from;
    const result = await db
        .insertInto('enquiry_followups')
        .values({
        enquiry_type: type,
        enquiry_id: id,
        note: text(body.note),
        outcome,
        next_follow_up_on: next,
        status_from: moved ? from : null,
        status_to: moved ? to : null,
        done_by: doneBy,
        created_at: new Date(),
        updated_at: new Date(),
    })
        .executeTakeFirst();
    const patch = { follow_up_on: next, updated_at: new Date() };
    if (moved) {
        patch.status = to;
        // Only the general book stamps when it was finished; `student_enquiries`
        // has no such column and records conversion through `converted_at`.
        if (type === 'enquiry')
            patch.closed_at = to === 'closed' ? new Date() : null;
    }
    if (type === 'enquiry') {
        await db.updateTable('enquiries').set(patch).where('id', '=', id).execute();
    }
    else {
        await db.updateTable('student_enquiries').set(patch).where('id', '=', id).execute();
    }
    return { id: Number(result.insertId), status: moved ? to : from, follow_up_on: next };
}
/** How many attempts each of these has had, and when the last one was. */
export async function followupCounts(type, ids) {
    if (ids.length === 0)
        return new Map();
    const rows = await db
        .selectFrom('enquiry_followups')
        .select(({ fn }) => ['enquiry_id', fn.countAll().as('n'), fn.max('created_at').as('last_at')])
        .where('enquiry_type', '=', type)
        .where('enquiry_id', 'in', ids)
        .groupBy('enquiry_id')
        .execute();
    return new Map(rows.map((r) => [
        Number(r.enquiry_id),
        { n: Number(r.n), last_at: r.last_at ?? null },
    ]));
}
