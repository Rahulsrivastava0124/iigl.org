import { useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { Box, Button, IconButton, InputAdornment, Popover, Stack, TextField, Typography } from '@mui/material';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import { PickerDay, type PickerDayProps } from '@mui/x-date-pickers/PickerDay';
import CalendarIcon from '@mui/icons-material/CalendarMonthOutlined';

const ISO = 'YYYY-MM-DD';
const SHOWN = 'DD-MM-YYYY';

/**
 * A date range in one field: From and To, picked on one calendar.
 *
 * Built from the free pickers rather than Material UI's `DateRangePicker`.
 * That component, and the single-input field it is made of, are in
 * `@mui/x-date-pickers-pro` — a paid licence, which this project does not have,
 * and without a key they draw a licence watermark over the screen.
 *
 * The first click on the calendar is the start and the second is the end; a
 * second click before the start begins again from there, because that is
 * somebody changing their mind about the start rather than asking for a range
 * that runs backwards. The field shows `08-09-2026 – 14-09-2026`, the same
 * day-month-year the rest of the panel prints.
 *
 * Values are `YYYY-MM-DD`, or empty, exactly as `DateField` speaks — swapping two
 * of those for one of these is a change of tag, not of state.
 */
export default function DateRangeField({
  label = 'Dates',
  from,
  to,
  onChange,
  width = 240,
}: {
  label?: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  width?: number;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  /*
    The range being picked, held apart from the one applied.

    Choosing a start must not refetch the list for a range that has no end yet:
    the statement would flash to "from the 8th, forever" and back. Nothing
    reaches the caller until the second date is chosen.
  */
  const [start, setStart] = useState<Dayjs | null>(null);
  const [end, setEnd] = useState<Dayjs | null>(null);
  const [hover, setHover] = useState<Dayjs | null>(null);

  const open = (el: HTMLElement) => {
    setStart(from ? dayjs(from, ISO) : null);
    setEnd(to ? dayjs(to, ISO) : null);
    setHover(null);
    setAnchor(el);
  };

  const pick = (day: Dayjs | null) => {
    if (!day) return;
    if (!start || end || day.isBefore(start, 'day')) {
      setStart(day);
      setEnd(null);
      return;
    }
    setEnd(day);
    onChange(start.format(ISO), day.format(ISO));
    setAnchor(null);
  };

  const text =
    from && to
      ? `${dayjs(from, ISO).format(SHOWN)} – ${dayjs(to, ISO).format(SHOWN)}`
      : from
        ? `From ${dayjs(from, ISO).format(SHOWN)}`
        : to
          ? `Up to ${dayjs(to, ISO).format(SHOWN)}`
          : '';

  // While only the start is chosen, the range follows the pointer, so
  // somebody picking the end can see the span they are about to ask for.
  const shownEnd = end ?? (start && hover && !hover.isBefore(start, 'day') ? hover : null);

  return (
    <>
      <TextField
        label={label}
        value={text}
        placeholder="From – To"
        onClick={(e) => open(e.currentTarget)}
        sx={{ width }}
        slotProps={{
          // Opens the calendar rather than taking typing: a range typed into one
          // box is two dates and a separator somebody has to get exactly right.
          htmlInput: { readOnly: true, style: { cursor: 'pointer' } },
          inputLabel: { shrink: text !== '' || undefined },
          input: {
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  edge="end"
                  size="small"
                  aria-label="Choose dates"
                  onClick={(e) => {
                    e.stopPropagation();
                    open(e.currentTarget.closest('.MuiFormControl-root') as HTMLElement);
                  }}
                >
                  <CalendarIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          },
        }}
      />
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Box sx={{ pt: 1.5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ px: 2.5 }}>
            {!start ? 'Choose the first day' : !end ? 'Now choose the last day' : 'Choose a new first day'}
          </Typography>
          <DateCalendar
            value={null}
            referenceDate={start ?? (to ? dayjs(to, ISO) : dayjs())}
            onChange={(day) => pick(day as Dayjs | null)}
            slots={{ day: RangeDay }}
            slotProps={{
              day: {
                rangeStart: start,
                rangeEnd: shownEnd,
                onHoverDay: setHover,
              } as Partial<RangeDayProps>,
            }}
          />
          <Stack direction="row" spacing={1} sx={{ px: 2, pb: 1.5, justifyContent: 'flex-end' }}>
            <Button
              size="small"
              onClick={() => {
                onChange('', '');
                setAnchor(null);
              }}
            >
              Clear
            </Button>
          </Stack>
        </Box>
      </Popover>
    </>
  );
}

interface RangeDayProps extends PickerDayProps {
  rangeStart?: Dayjs | null;
  rangeEnd?: Dayjs | null;
  onHoverDay?: (day: Dayjs | null) => void;
}

/**
 * One day of the calendar, shaded when it falls inside the range.
 *
 * The two ends are drawn as selected days; the days between them take a band
 * of the primary colour's pale end with square inner edges, so the span reads
 * as one bar rather than a row of separate dots.
 */
function RangeDay(props: RangeDayProps) {
  const { rangeStart, rangeEnd, onHoverDay, day, outsideCurrentMonth, sx, ...rest } = props;
  const d = day as Dayjs;
  const isStart = !!rangeStart && d.isSame(rangeStart, 'day');
  const isEnd = !!rangeEnd && d.isSame(rangeEnd, 'day');
  const inside =
    !!rangeStart && !!rangeEnd && d.isAfter(rangeStart, 'day') && d.isBefore(rangeEnd, 'day');

  return (
    <PickerDay
      {...rest}
      day={day}
      outsideCurrentMonth={outsideCurrentMonth}
      selected={!outsideCurrentMonth && (isStart || isEnd)}
      onMouseEnter={() => onHoverDay?.(d)}
      sx={[
        !outsideCurrentMonth &&
          inside && {
            borderRadius: 0,
            bgcolor: 'primary.light',
            color: 'primary.contrastText',
            '&:hover, &:focus': { bgcolor: 'primary.main' },
          },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}
