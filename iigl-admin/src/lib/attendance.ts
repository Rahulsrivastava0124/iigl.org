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

/**
 * One attendance day, as a calendar cell.
 *
 * Green for a closed day with the two times on it, amber while it is still
 * open — the same two tones the attendance chip has always used, so a day
 * reads the same on the calendar as it does in a status column.
 */
export function attendanceDay(d: Day): CalendarDay {
  const open = isOpen(d);
  return {
    tone: open ? 'waiting' : 'settled',
    lines: [time(d.clockIn), open ? 'open' : time(d.clockOut)],
    tooltip:
      `${dayKey(d)} · in ${time(d.clockIn)} · ` +
      (open ? 'still open' : `out ${time(d.clockOut)} · ${hours(minutesWorked(d))}`) +
      (d.break_begin ? ` · break ${stamp(d.break_begin)}–${stamp(d.break_end)}` : ''),
  };
}
