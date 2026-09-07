import { Router } from 'express';
import { db } from '../db/index.js';
import { wrap } from '../lib/async.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { paged, readPage } from '../lib/paginate.js';
import { assertEmploys, empidOf, requireEmployer, requireLabScope, ROLE } from '../middleware/auth.js';
import { numericId } from '../middleware/params.js';

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
 * Record a day that was never punched.
 *
 * The clock in the bar can only ever record now, so a day nobody punched at all
 * — the machine was down, they were at a fair, somebody simply forgot — has no
 * row for `PATCH` to correct. This writes one.
 *
 * **The employer only**, for the same reason correcting is: a person writing
 * their own attendance for a day they were not at work is a person writing
 * their own timesheet.
 *
 * Not for the future. A day that has not happened cannot be attended, and a row
 * dated forward would count in the month's hours before it was worked.
 */
attendanceRoutes.post(
  '/',
  requireEmployer,
  wrap(async (req, res) => {
    const empId = Number(req.body?.emp_id);
    if (!Number.isInteger(empId) || empId <= 0) throw badRequest('Which employee?');
    await assertEmploys(req.user, empId);

    const date = String(req.body?.date ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw badRequest('The date must be YYYY-MM-DD.');
    if (date > today()) throw badRequest('That day has not happened yet.');

    const existing = await db
      .selectFrom('attendances')
      .select('id')
      .where('empId', '=', empId)
      .where('date', '=', new Date(`${date}T00:00:00`))
      .executeTakeFirst();
    if (existing) throw conflict('That day is already recorded. Edit it instead.');

    const clock = (value: unknown, field: string): string => {
      const text = String(value ?? '').trim();
      const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(text);
      if (!match) throw badRequest(`${field} must be a time, as HH:MM.`);
      return `${match[1]}:${match[2]}:${match[3] ?? '00'}`;
    };

    const clockIn = clock(req.body?.clock_in, 'Clock in');
    // Blank leaves the day open, which is the sentinel this schema uses.
    const clockOut =
      req.body?.clock_out === undefined || req.body?.clock_out === null || req.body?.clock_out === ''
        ? '00:00:00'
        : clock(req.body.clock_out, 'Clock out');
    if (clockOut !== '00:00:00' && clockOut <= clockIn) {
      throw badRequest('The clock-out has to be after the clock-in.');
    }

    const result = await db
      .insertInto('attendances')
      .values({
        empId,
        date: new Date(`${date}T00:00:00`),
        clockIn,
        clockOut,
        break_begin: null,
        break_end: null,
        status: clockOut === '00:00:00' ? '0' : '1',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .executeTakeFirst();

    res.status(201).json({ data: { id: Number(result.insertId), date, clockIn, clockOut } });
  }),
);

/**
 * Correct a day.
 *
 * Somebody forgets to punch out and the day stays open forever; somebody
 * punches in an hour after they arrived. Neither is fixable from the clock in
 * the bar — that only records now — so the day is corrected here.
 *
 * **The employer only.** A person editing their own attendance is a person
 * writing their own timesheet, so `assertEmploys` is the whole guard: head
 * office passes for anyone, a laboratory for the people it employs, and a
 * member of staff for nobody, including themselves.
 *
 * Times are `HH:MM` or `HH:MM:SS` as the columns hold them. `clock_out: null`
 * reopens a day — the sentinel `00:00:00` is what "still working" means here —
 * and a break is cleared the same way.
 */
attendanceRoutes.patch(
  '/:id',
  numericId,
  requireEmployer,
  wrap(async (req, res) => {
    const row = await db
      .selectFrom('attendances')
      .selectAll()
      .where('id', '=', Number(req.params.id))
      .executeTakeFirst();
    if (!row) throw notFound('That attendance record does not exist.');

    await assertEmploys(req.user, Number(row.empId));

    /** `9:5` is not a time; `09:05` and `09:05:00` are. Seconds default to 00. */
    const clock = (value: unknown, field: string): string => {
      const text = String(value ?? '').trim();
      const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(text);
      if (!match) throw badRequest(`${field} must be a time, as HH:MM.`);
      return `${match[1]}:${match[2]}:${match[3] ?? '00'}`;
    };

    const patch: Record<string, unknown> = { updated_at: new Date() };

    if (req.body?.clock_in !== undefined) patch.clockIn = clock(req.body.clock_in, 'Clock in');

    if (req.body?.clock_out !== undefined) {
      // Null reopens the day, which is the sentinel rather than a real NULL:
      // the column is NOT NULL in this schema.
      patch.clockOut =
        req.body.clock_out === null || req.body.clock_out === ''
          ? '00:00:00'
          : clock(req.body.clock_out, 'Clock out');
      patch.status = patch.clockOut === '00:00:00' ? '0' : '1';
    }

    // The break columns are datetimes, so a time is stamped onto the day the
    // record belongs to rather than onto today.
    const day = String(row.date instanceof Date ? row.date.toISOString().slice(0, 10) : row.date).slice(0, 10);
    for (const [field, column] of [
      ['break_begin', 'break_begin'],
      ['break_end', 'break_end'],
    ] as const) {
      if (req.body?.[field] === undefined) continue;
      patch[column] =
        req.body[field] === null || req.body[field] === ''
          ? null
          : `${day} ${clock(req.body[field], field === 'break_begin' ? 'Break start' : 'Break end')}`;
    }

    if (Object.keys(patch).length === 1) throw badRequest('Nothing to change.');

    /*
      A day that ends before it starts is a typo, and one stored would show as
      negative hours on the tile above the calendar.
    */
    const opensAt = String(patch.clockIn ?? row.clockIn);
    const closesAt = String(patch.clockOut ?? row.clockOut ?? '00:00:00');
    if (closesAt !== '00:00:00' && closesAt <= opensAt) {
      throw badRequest('The clock-out has to be after the clock-in.');
    }

    await db
      .updateTable('attendances')
      .set(patch as never)
      .where('id', '=', Number(row.id))
      .execute();

    const updated = await db
      .selectFrom('attendances')
      .selectAll()
      .where('id', '=', Number(row.id))
      .executeTakeFirstOrThrow();

    res.json({ data: updated });
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
