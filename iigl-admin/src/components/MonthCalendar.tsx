import { Box, Stack, Tooltip, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import PrevIcon from '@mui/icons-material/ChevronLeftOutlined';
import NextIcon from '@mui/icons-material/ChevronRightOutlined';
import TodayIcon from '@mui/icons-material/TodayOutlined';
import { IconAction, Panel } from './ui';
import { TONE } from '../lib/theme';
import type { ToneName } from '../lib/theme';

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Sunday first, as the wall calendars in the laboratories are. */
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface Month {
  year: number;
  /** 0–11, as `Date` counts them. */
  month: number;
}

/** What one day looks like. Null from `dayFor` means nothing happened that day. */
export interface CalendarDay {
  tone: ToneName;
  /** Up to two short lines under the date. Times, a count, a figure. */
  lines?: string[];
  tooltip?: string;
}

/**
 * `YYYY-MM-DD` for a local date.
 *
 * Built by hand rather than through `toISOString`, which converts to UTC first
 * and so names the previous day for anywhere east of Greenwich — India is
 * +5:30, and the calendar would light the wrong square every time.
 */
export const dateKey = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** The first and last day of a month, for the `from`/`to` an endpoint takes. */
export function monthRange(m: Month): { from: string; to: string; days: number } {
  const days = new Date(m.year, m.month + 1, 0).getDate();
  return { from: dateKey(m.year, m.month, 1), to: dateKey(m.year, m.month, days), days };
}

export const thisMonth = (): Month => {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
};

/**
 * A month, as a month.
 *
 * Wherever the panel shows something that happened on days — attendance,
 * follow-ups — a calendar says it better than a list of rows: an absence is a
 * gap, and a gap is visible where a missing row is not.
 *
 * The component owns the grid, the month navigation and the colours; the
 * caller owns the data and answers `dayFor` for one date at a time. There is
 * no date library and no `@mui/x-date-pickers` behind it: the picker
 * components exist to *choose* a date, which none of these screens asks for.
 *
 * Fetch the whole month (see `monthRange`) rather than a page of rows. Paging
 * is newest-first, a month can straddle two pages, and a calendar that pages to
 * fill itself in draws holes that look like absences.
 */
export default function MonthCalendar({
  value,
  onChange,
  subtitle,
  actions,
  dayFor,
  legend,
  note,
}: {
  value: Month;
  onChange: (next: Month) => void;
  /** What the calendar is of — "Attendance". The title is the month itself. */
  subtitle?: string;
  /** Controls that belong to the caller, shown before the month navigation. */
  actions?: ReactNode;
  dayFor: (date: string) => CalendarDay | null;
  /** Chips explaining the colours, under the grid. */
  legend?: ReactNode;
  /** A line beside the legend: what a blank day means, or that it is loading. */
  note?: ReactNode;
}) {
  const now = new Date();
  const today = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const { days } = monthRange(value);
  const first = new Date(value.year, value.month, 1);

  const step = (by: number) => {
    const next = new Date(value.year, value.month + by, 1);
    onChange({ year: next.getFullYear(), month: next.getMonth() });
  };

  return (
    <Panel
      title={`${MONTHS[value.month]} ${value.year}`}
      subtitle={subtitle}
      actions={
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          {actions}
          <IconAction label="Previous month" icon={PrevIcon} onClick={() => step(-1)} />
          <IconAction label="This month" icon={TodayIcon} onClick={() => onChange(thisMonth())} />
          <IconAction label="Next month" icon={NextIcon} onClick={() => step(1)} />
        </Stack>
      }
    >
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 1 }}>
          {WEEKDAYS.map((w) => (
            <Typography
              key={w}
              variant="overline"
              color="text.secondary"
              sx={{ textAlign: 'center' }}
            >
              {w}
            </Typography>
          ))}

          {/* The first of the month rarely lands on a Sunday. */}
          {Array.from({ length: first.getDay() }, (_, i) => (
            <Box key={`blank-${i}`} />
          ))}

          {Array.from({ length: days }, (_, i) => {
            const date = dateKey(value.year, value.month, i + 1);
            const day = dayFor(date);
            const tint = day ? TONE[day.tone] : null;
            const future = date > today;

            const cell = (
              <Box
                sx={{
                  border: 1,
                  borderColor: tint ? tint.soft : 'divider',
                  borderRadius: 1,
                  bgcolor: tint ? tint.soft : 'transparent',
                  minHeight: 74,
                  p: 1,
                  opacity: future ? 0.45 : 1,
                  // Today is outlined rather than filled: the fill is spoken
                  // for by whether anything happened.
                  ...(date === today && { outline: '2px solid', outlineColor: 'primary.main' }),
                }}
              >
                <Typography
                  className="tabular"
                  sx={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: tint ? tint.main : 'text.secondary',
                  }}
                >
                  {i + 1}
                </Typography>
                {day?.lines?.map((line, n) => (
                  <Typography
                    key={n}
                    className="tabular"
                    sx={{ fontSize: 11.5, color: tint?.main, lineHeight: 1.5 }}
                  >
                    {line}
                  </Typography>
                ))}
              </Box>
            );

            return day?.tooltip ? (
              <Tooltip key={date} title={day.tooltip}>
                {cell}
              </Tooltip>
            ) : (
              <Box key={date}>{cell}</Box>
            );
          })}
        </Box>

        {(legend || note) && (
          <Stack direction="row" spacing={1.5} sx={{ mt: 2, alignItems: 'center' }}>
            {legend}
            {note && (
              <Typography variant="caption" color="text.secondary">
                {note}
              </Typography>
            )}
          </Stack>
        )}
      </Box>
    </Panel>
  );
}
