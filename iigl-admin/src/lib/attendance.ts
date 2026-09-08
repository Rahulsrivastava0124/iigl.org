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
 * Pink, and named. It is not an absence — nobody was asked to come in — and
 * leaving it as the blank square an absence leaves is how a holiday gets
 * queried as one at the end of the month.
 */
export function holidayDay(h: Holiday): CalendarDay {
  return { tone: 'holiday', lines: [h.name], tooltip: `${h.date} · ${h.name} · office shut` };
}

/**
 * One attendance day, as a calendar cell.
 *
 * Green for a closed day with the two times on it, amber while it is still
 * open — the same two tones the attendance chip has always used, so a day
 * reads the same on the calendar as it does in a status column.
 */
export function attendanceDay(d: Day, holiday?: Holiday): CalendarDay {
  const open = isOpen(d);
  return {
    tone: open ? 'waiting' : 'settled',
    lines: [time(d.clockIn), open ? 'open' : time(d.clockOut)],
    tooltip:
      `${dayKey(d)} · in ${time(d.clockIn)} · ` +
      (open ? 'still open' : `out ${time(d.clockOut)} · ${hours(minutesWorked(d))}`) +
      (d.break_begin ? ` · break ${stamp(d.break_begin)}–${stamp(d.break_end)}` : '') +
      // Somebody who came in on a holiday stays green — they worked — but the
      // day still says what it was.
      (holiday ? ` · ${holiday.name}, office shut` : ''),
  };
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
