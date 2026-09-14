import type { CalendarDay } from '../components/MonthCalendar';

/** One day on somebody's attendance, as `GET /api/attendance` returns it. */
export interface Day {
  id: number;
  date: string;
  clockIn: string;
  clockOut: string | null;
  break_begin: string | null;
  break_end: string | null;
  status: string | null;
}

/**
 * A day is still open until it has a clock-out that is not the seed value.
 *
 * `clockOut` is NOT NULL with no default, so a fresh row is seeded `00:00:00`.
 * That is a sentinel meaning "still working", not a time — read as a time it
 * makes an open day look closed, and an eight-hour shift look like a negative
 * one.
 */
export const isOpen = (d: Day) => !d.clockOut || d.clockOut === '00:00:00';

/** `09:12:00` as `09:12`, and the sentinel as nothing. */
export const time = (v: string | null) => (!v || v === '00:00:00' ? '—' : v.slice(0, 5));

/** The `HH:MM` out of a `YYYY-MM-DD HH:MM:SS` break stamp. */
export const stamp = (v: string | null) => (v ? String(v).slice(11, 16) : '—');

/** Minutes between clock-in and clock-out, or none while the day is open. */
export function minutesWorked(d: Day): number {
  if (isOpen(d) || !d.clockIn) return 0;
  const [a, b] = [d.clockIn, d.clockOut as string].map((t) => {
    const [h, m, s] = t.split(':').map(Number);
    return h * 3600 + m * 60 + (s || 0);
  });
  return b > a ? Math.round((b - a) / 60) : 0;
}

export const hours = (minutes: number) =>
  `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;

/** The date a day belongs to, as the calendar keys them. */
export const dayKey = (d: Day) => String(d.date).slice(0, 10);

/** A holiday, as `GET /api/holidays` returns it. */
export interface Holiday {
  id: number;
  date: string;
  name: string;
  /** Head office's, and so not this laboratory's to edit. */
  shared: boolean;
}

/**
 * A day the office was shut, as a calendar cell.
 *
 * Yellow, and named. It is not an absence — nobody was asked to come in — and
 * leaving it as the blank square an absence leaves is how a holiday gets
 * queried as one at the end of the month.
 */
export function holidayDay(h: Holiday): CalendarDay {
  return { tone: 'holiday', lines: [h.name], tooltip: `${h.date} · ${h.name} · office shut` };
}

/**
 * A posting's shift: how long a full day is, and when a punch-in is late.
 * Either may be unset, and then nobody is marked short, or late.
 */
export interface Shift {
  /** `HH:MM`. */
  lateAfter: string | null;
  workingHours: number | null;
  /** `HH:MM`, when the day starts and ends. */
  start: string | null;
  end: string | null;
}

/** The shift off an employment as the API returns it. */
export const shiftOf = (
  e?: {
    working_hours?: string | number | null;
    late_after?: string | null;
    shift_start?: string | null;
    shift_end?: string | null;
  } | null,
): Shift => ({
  lateAfter: e?.late_after ? String(e.late_after).slice(0, 5) : null,
  workingHours: Number(e?.working_hours) > 0 ? Number(e?.working_hours) : null,
  start: e?.shift_start ? String(e.shift_start).slice(0, 5) : null,
  end: e?.shift_end ? String(e.shift_end).slice(0, 5) : null,
});

/** Minutes past midnight for `HH:MM` or `HH:MM:SS`. */
const minutesOf = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

/**
 * Hours from a start time to an end time, as the API works them out: a shift
 * that ends at or before it starts runs past midnight. Null without both.
 */
export function hoursBetween(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  let span = minutesOf(end) - minutesOf(start);
  if (span <= 0) span += 24 * 60;
  return Math.round((span / 60) * 100) / 100;
}

/**
 * One attendance day, as a calendar cell.
 *
 * Green for a closed day with the two times on it, amber while it is still
 * open — the same two tones the attendance chip has always used, so a day
 * reads the same on the calendar as it does in a status column.
 *
 * With a shift, the times say how the day went against it: `late` beside a
 * punch-in after `lateAfter`, `short` beside a clock-out that left the day
 * under `workingHours`. The colour stays the day's — they came in.
 */
export function attendanceDay(d: Day, holiday?: Holiday, shift?: Shift): CalendarDay {
  const open = isOpen(d);
  const lateBy =
    shift?.lateAfter && d.clockIn ? minutesOf(d.clockIn) - minutesOf(shift.lateAfter) : 0;
  const worked = minutesWorked(d);
  const shortBy = !open && shift?.workingHours ? Math.round(shift.workingHours * 60) - worked : 0;
  return {
    tone: open ? 'waiting' : 'settled',
    // The red mark at the foot of the day says it; the word beside the time
    // would say it twice.
    late: lateBy > 0,
    lines: [
      time(d.clockIn),
      open ? 'open' : `${time(d.clockOut)}${shortBy > 0 ? ' short' : ''}`,
    ],
    tooltip:
      `${dayKey(d)} · in ${time(d.clockIn)}${lateBy > 0 ? ` (late by ${hours(lateBy)})` : ''} · ` +
      (open
        ? 'still open'
        : `out ${time(d.clockOut)} · ${hours(worked)}${shortBy > 0 ? ` (short by ${hours(shortBy)})` : ''}`) +
      (d.break_begin ? ` · break ${stamp(d.break_begin)}–${stamp(d.break_end)}` : '') +
      // Somebody who came in on a holiday stays green — they worked — but the
      // day still says what it was.
      (holiday ? ` · ${holiday.name}, office shut` : ''),
  };
}

/**
 * The days of the week a posting is off, as the employment stores them.
 *
 * `"0,6"` for Sunday and Saturday — `Date.getDay()` numbering, which is what
 * the column holds so that nothing has to translate. Anything unparseable
 * reads as no fixed day off, the same as an empty column.
 */
export const weekOffDays = (stored: string | null | undefined): Set<number> =>
  new Set(
    String(stored ?? '')
      .split(',')
      .map((n) => n.trim())
      // Blanks dropped before Number, not after: `Number('')` is 0, so an
      // empty column parsed as Sunday and every posting with no fixed day off
      // was shown one.
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
  );

/**
 * A day this person is off every week, as a calendar cell.
 *
 * Slate, and named. It is not an absence — nobody was asked to come in — and
 * left as the blank square an absence leaves, a weekly day off is queried as
 * one at the end of every month.
 *
 * Not the holiday yellow: a holiday is the office shut for everybody, this is one
 * person's own week. They read alike at a glance and mean different things to
 * whoever is asking why somebody was not here.
 */
export function weekOffDay(): CalendarDay {
  return { tone: 'plain', lines: ['week off'], tooltip: 'Week off' };
}

/**
 * When somebody is expected in by, for a posting with no late time of its own.
 * A day with no punch reads as absent only once this — or the posting's
 * `late_after` — has passed: at nine in the morning an empty today means nothing yet.
 */
export const PUNCH_IN_BY = '10:00';

/**
 * The first day somebody can be absent on: the earlier of their joining date
 * and the day their account was made. Either alone is wrong somewhere — a
 * joining date typed in later than the first punch, an account made for
 * somebody who had already started — and before both there was nobody to be
 * absent. Null when neither is known, and then nothing is marked.
 */
export function absentFrom(joining?: string | null, created?: string | null): string | null {
  const days = [joining, created]
    .map((v) => String(v ?? '').slice(0, 10))
    .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v))
    .sort();
  return days[0] ?? null;
}

/**
 * A working day nobody punched in on and nobody said anything about.
 *
 * Only called for a day with no attendance, no holiday, no week off and no
 * note — so this decides when, not whether: any day already over, and today
 * once `PUNCH_IN_BY` has gone. A future day is never absent, and neither is a
 * day before `from`.
 */
export function absentDay(
  date: string,
  from: string | null,
  lateAfter?: string | null,
  now = new Date(),
): CalendarDay | null {
  if (!from || date < from) return null;
  // Local date, not toISOString: India is +5:30 and UTC names yesterday.
  const pad = (n: number) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const clock = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  if (date > today || (date === today && clock < (lateAfter || PUNCH_IN_BY).slice(0, 5))) return null;
  return { tone: 'refused', lines: ['absent'], tooltip: `${date} · absent · no punch and no request` };
}

/**
 * A day somebody has written about, on the calendar.
 *
 * A request names a day — leave on the 9th, a punch to correct on the 3rd —
 * and until now that day looked like every other blank square: the note sat in
 * a list beside a month that knew nothing about it. This is the mark.
 *
 * It never takes a day that already has something on it. Attendance and a
 * holiday are what happened; a request is what somebody has asked for, and it
 * is added to the tooltip of those days rather than painted over them.
 */
export interface DayNote {
  about_date: string | null;
  kind: string;
  body: string;
  resolved_at: string | null;
}

export const noteOn = (notes: DayNote[], date: string) =>
  notes.filter((n) => String(n.about_date ?? '').slice(0, 10) === date);

/** What the notes on one day add to its tooltip. */
export const noteTip = (notes: DayNote[]) =>
  notes
    .map((n) => `${n.kind === 'request' ? 'Request' : 'Message'}: ${n.body}`)
    .join(' · ');

export function noteDay(notes: DayNote[]): CalendarDay {
  const open = notes.some((n) => !n.resolved_at);
  const request = notes.some((n) => n.kind === 'request');
  return {
    // Asked and unanswered reads as waiting; answered is settled. A day that is
    // only a message keeps the plain tone: nothing is pending on it.
    tone: open && request ? 'waiting' : 'plain',
    lines: [notes.length === 1 ? (request ? 'request' : 'message') : `${notes.length} notes`],
    tooltip: noteTip(notes),
  };
}
