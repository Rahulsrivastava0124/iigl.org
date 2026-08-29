import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { badRequest, conflict } from '../lib/errors.js';
import { paged, readPage } from '../lib/paginate.js';
import { empidOf, requireLabScope, ROLE } from '../middleware/auth.js';

/**
 * Attendance.
 *
 * One row per person per day: a clock-in time, a clock-out time, and a single
 * break. `status` is 1 once the day is closed.
 *
 * The Laravel version does all four of these over GET, so a link or an image
 * tag could clock someone in or out. They are POST here.
 *
 * It also assumed a row existed — `breakStatus` and `clockOut` dereference the
 * result of the day's lookup without checking, so using them before clocking in
 * produced a 500. They return a clear 400 here instead.
 */
export const attendanceRoutes = Router();
attendanceRoutes.use(requireLabScope);

const today = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toTimeString().slice(0, 8);

/** Midnight today, for the DATE column. */
const todayDate = () => new Date(`${today()}T00:00:00`);

/** `YYYY-MM-DD HH:MM:SS`, the shape the datetime break columns hold. */
const stamp = () => `${today()} ${now()}`;

/**
 * clockOut is NOT NULL with no default, so a fresh row is seeded '00:00:00'.
 * That is a sentinel meaning "still working", not a time — treating it as a
 * real value makes an open day look closed and hides the clock-out button.
 */
const isOpen = (clockOut: string | null | undefined) => !clockOut || clockOut === '00:00:00';

async function todayFor(userId: number) {
  return db
    .selectFrom('attendances')
    .selectAll()
    .where('empId', '=', userId)
    .where('date', '=', todayDate())
    .executeTakeFirst();
}

/** Today's own record, so a client can show the right button. */
attendanceRoutes.get(
  '/today',
  wrap(async (req, res) => {
    const row = await todayFor(req.user.id);
    res.json({
      data: {
        date: today(),
        record: row ?? null,
        can_clock_in: !row,
        can_clock_out: Boolean(row) && isOpen(row?.clockOut),
        on_break: Boolean(row?.break_begin && !row?.break_end),
      },
    });
  }),
);

attendanceRoutes.post(
  '/clock-in',
  wrap(async (req, res) => {
    if (await todayFor(req.user.id)) {
      throw conflict('You have already clocked in today.');
    }

    const result = await db
      .insertInto('attendances')
      .values({
        empId: req.user.id,
        date: todayDate(),
        clockIn: now(),
        // NOT NULL in the live schema with no default, so they are seeded and
        // overwritten when the day actually closes.
        clockOut: '00:00:00',
        break_begin: null,
        break_end: null,
        status: '0',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .executeTakeFirst();

    res.status(201).json({ data: { id: Number(result.insertId), clockIn: now() } });
  }),
);

attendanceRoutes.post(
  '/clock-out',
  wrap(async (req, res) => {
    const row = await todayFor(req.user.id);
    if (!row) throw badRequest('You have not clocked in today.');
    if (!isOpen(row.clockOut)) throw conflict('You have already clocked out today.');

    await db
      .updateTable('attendances')
      .set({ clockOut: now(), status: '1', updated_at: new Date() })
      .where('id', '=', Number(row.id))
      .execute();

    res.json({ data: { clockOut: now() } });
  }),
);

attendanceRoutes.post(
  '/break',
  wrap(async (req, res) => {
    const starting = Boolean(req.body?.on_break);
    const row = await todayFor(req.user.id);
    if (!row) throw badRequest('You have not clocked in today.');

    await db
      .updateTable('attendances')
      .set(
        starting
          ? ({ break_begin: stamp(), updated_at: new Date() } as const)
          : ({ break_end: stamp(), updated_at: new Date() } as const),
      )
      .where('id', '=', Number(row.id))
      .execute();

    res.json({ data: { on_break: starting } });
  }),
);

/**
 * Attendance history. Staff see their own; a laboratory or administrator can
 * read one of their people by passing emp_id. `from` and `to` narrow it to a
 * date range, which is how the calendar asks for a month.
 */
attendanceRoutes.get(
  '/',
  wrap(async (req, res) => {
    const p = readPage(req, 31, 200);
    let target = req.user.id;

    if (req.query.emp_id) {
      const requested = Number(req.query.emp_id);
      if (req.user.roleId === ROLE.SUPER) {
        target = requested;
      } else if (req.user.roleId === ROLE.LAB) {
        // A laboratory may read only its own staff. The employment names the
        // employer by empid, so the laboratory's own is what it matches on —
        // and a laboratory without one employs nobody.
        const mine = await empidOf(req.user.id);
        const employed = mine
          ? await db
              .selectFrom('employements')
              .select('id')
              .where('user_id', '=', requested)
              .where('parent_id', '=', mine)
              .executeTakeFirst()
          : undefined;
        if (!employed) throw badRequest('That person does not work at your laboratory.');
        target = requested;
      } else if (requested !== req.user.id) {
        throw badRequest('You can only read your own attendance.');
      }
    }

    /*
     * A window, for a calendar.
     *
     * The list is paged newest-first, which answers "what happened lately" but
     * not "what did August look like" — a month can straddle two pages, and a
     * calendar that has to page to fill itself in draws holes. `from` and `to`
     * are inclusive and either may be given alone.
     */
    const range = (value: unknown): string | null => {
      const v = String(value ?? '').trim();
      if (!v) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw badRequest('Dates are YYYY-MM-DD.');
      return v;
    };
    const from = range(req.query.from);
    const to = range(req.query.to);

    const scoped = () => {
      let q = db.selectFrom('attendances').where('empId', '=', target);
      if (from) q = q.where('date', '>=', new Date(`${from}T00:00:00`));
      if (to) q = q.where('date', '<=', new Date(`${to}T00:00:00`));
      return q;
    };

    const [rows, count] = await Promise.all([
      scoped()
        .selectAll()
        .orderBy('date', 'desc')
        .limit(p.limit)
        .offset(p.offset)
        .execute(),
      scoped().select(db.fn.countAll().as('n')).executeTakeFirstOrThrow(),
    ]);

    res.json(paged(rows, Number(count.n), p));
  }),
);
