import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { ROLE, requireEmployer, requireLabScope } from '../middleware/auth.js';
import { numericId } from '../middleware/params.js';

/**
 * Holidays — the days the office is shut.
 *
 * Two lists, not one. Head office keeps the national list, which everybody
 * works to; a laboratory keeps its own, for the days only it closes — a local
 * festival, a wedding, a shutdown for stocktaking. A laboratory reads both and
 * writes only its own, because Republic Day is not one laboratory's opinion and
 * head office has no business being told when a franchise shuts for a fair.
 *
 * `holidays.lab_id` is the list: `0` is head office's — no user has that id —
 * and a user id is that laboratory's. Zero rather than NULL because MySQL
 * counts every NULL as distinct in a unique index, so the one list where a
 * duplicate matters most would have been the one list without a key to stop it
 * (see migration 035). Staff read; the two employer roles write.
 *
 * What reads this:
 *
 *   - the attendance calendar, which draws these days in pink rather than
 *     leaving them as the blank square an absence leaves;
 *   - the salary arithmetic, where a holiday is **not** an absence. Somebody
 *     who was shut is not somebody who did not come in.
 */
export const holidayRoutes = Router();

/** The list somebody writes to. Head office writes the shared one, which is 0. */
const SHARED = 0;
const listOf = (user: { roleId: number | null; id: number }) =>
  user.roleId === ROLE.SUPER ? SHARED : user.id;

const asDate = (v: unknown, field: string): string => {
  const s = String(v ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) {
    throw badRequest(`${field} must be a date, as YYYY-MM-DD.`);
  }
  return s;
};

const asName = (v: unknown): string => {
  const s = String(v ?? '').trim();
  if (!s) throw badRequest('What is the holiday called?');
  if (s.length > 120) throw badRequest('That name is too long — 120 characters at most.');
  return s;
};

/** The row, in the shape the panel reads. `occasion` is Laravel's column name. */
const shape = {
  id: 'holidays.id as id',
  lab_id: 'holidays.lab_id as lab_id',
  date: 'holidays.date as date',
  name: 'holidays.occasion as name',
} as const;

/**
 * The holidays somebody may see, over a range.
 *
 * Head office sees the shared list, or one laboratory's with `lab_id`. Anybody
 * else sees the shared list **and their own laboratory's**, which is the list
 * their calendar and their pay are actually worked out against.
 *
 * `from` and `to` are how a calendar asks — one month at a time. Without them
 * it is the whole list, which is what the settings screen shows.
 */
holidayRoutes.get(
  '/',
  requireLabScope,
  wrap(async (req, res) => {
    let q = db
      .selectFrom('holidays')
      .select([shape.id, shape.lab_id, shape.date, shape.name])
      .where('status', '<>', 0);

    if (req.user.roleId === ROLE.SUPER) {
      q = q.where('lab_id', '=', Number(req.query.lab_id) || SHARED);
    } else {
      // Theirs and everybody's, which together are what applies to them.
      const labId = req.user.labId;
      q = q.where('lab_id', 'in', labId === null ? [SHARED] : [SHARED, labId]);
    }

    if (req.query.from) q = q.where('date', '>=', new Date(`${asDate(req.query.from, 'from')}T00:00:00`));
    if (req.query.to) q = q.where('date', '<=', new Date(`${asDate(req.query.to, 'to')}T00:00:00`));

    const rows = await q.orderBy('date').execute();

    res.json({
      data: rows.map((r) => ({
        id: Number(r.id),
        date: String(r.date).slice(0, 10),
        name: r.name,
        /* Whose it is, so the screen knows which ones it may edit. */
        shared: Number(r.lab_id) === SHARED,
      })),
    });
  }),
);

/** Adds one to the caller's own list. */
holidayRoutes.post(
  '/',
  requireEmployer,
  wrap(async (req, res) => {
    const date = asDate(req.body?.date, 'The date');
    const name = asName(req.body?.name);
    const labId = listOf(req.user);

    const clash = await db
      .selectFrom('holidays')
      .select('id')
      .where('date', '=', new Date(`${date}T00:00:00`))
      .where('lab_id', '=', labId)
      .executeTakeFirst();
    if (clash) throw conflict('That date is already on this list. Edit the one that is there.');

    const result = await db
      .insertInto('holidays')
      .values({
        lab_id: labId,
        date: new Date(`${date}T00:00:00`),
        occasion: name,
        status: 1,
        userid: req.user.id,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .executeTakeFirst();

    res.status(201).json({ data: { id: Number(result.insertId), date, name } });
  }),
);

/**
 * The row, if it is the caller's to touch.
 *
 * A laboratory may not edit head office's list, and head office does not edit a
 * laboratory's: a shared holiday changed by one franchise would silently change
 * everybody's calendar and everybody's pay.
 */
async function ownRow(user: { roleId: number | null; id: number }, id: number) {
  const row = await db
    .selectFrom('holidays')
    .select(['id', 'lab_id'])
    .where('id', '=', id)
    .executeTakeFirst();
  if (!row) throw notFound('Holiday not found.');

  const owner = Number(row.lab_id);
  if (owner !== listOf(user)) {
    throw badRequest(
      owner === SHARED
        ? 'That is head office’s holiday. Only they can change it.'
        : 'That holiday belongs to another laboratory.',
    );
  }
  return row;
}

holidayRoutes.patch(
  '/:id',
  numericId,
  requireEmployer,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    await ownRow(req.user, id);

    const patch: { date?: Date; occasion?: string; updated_at: Date } = { updated_at: new Date() };
    if (req.body?.date !== undefined) {
      patch.date = new Date(`${asDate(req.body.date, 'The date')}T00:00:00`);
    }
    if (req.body?.name !== undefined) patch.occasion = asName(req.body.name);

    await db.updateTable('holidays').set(patch).where('id', '=', id).execute();
    res.json({ data: { id } });
  }),
);

holidayRoutes.delete(
  '/:id',
  numericId,
  requireEmployer,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    await ownRow(req.user, id);
    // A real delete. This is a small list somebody keeps by hand, and a day
    // that is no longer a holiday is not history worth keeping.
    await db.deleteFrom('holidays').where('id', '=', id).execute();
    res.status(204).end();
  }),
);
