import { useState } from 'react';
import { Grid, TextField, Typography } from '@mui/material';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { Dialog } from './ui';
import { useToast } from './Toast';
import { isOpen, stamp, time, type Day } from '../lib/attendance';

/**
 * Correcting one day.
 *
 * The clock in the bar only ever records now, so the day somebody forgot to
 * punch out of is not fixable from it — it stays open forever, and the hours
 * for the month are short by a shift. This is where that is put right.
 *
 * The employer's screen only: `PATCH /api/attendance/{id}` refuses anybody
 * editing their own, because a person writing their own timesheet is not an
 * attendance record.
 *
 * Blank means "no time": clearing the clock-out reopens the day, which is what
 * the column's `00:00:00` sentinel means, and clearing a break removes it.
 */
export default function AttendanceEdit({
  day,
  date,
  empId,
  name,
  onClose,
  onSaved,
}: {
  /** The record being corrected. Absent for a day that was never punched. */
  day: Day | null;
  /** Which day, when there is no record to take it from. */
  date: string;
  /** Whose day, for a record that does not exist yet. */
  empId: number;
  name?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const blank = (v: string) => (v === '—' ? '' : v);

  const [clockIn, setClockIn] = useState(day ? blank(time(day.clockIn)) : '');
  const [clockOut, setClockOut] = useState(
    day && !isOpen(day) ? blank(time(day.clockOut)) : '',
  );
  const [breakBegin, setBreakBegin] = useState(day ? blank(stamp(day.break_begin)) : '');
  const [breakEnd, setBreakEnd] = useState(day ? blank(stamp(day.break_end)) : '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      if (day) {
        await api.patch(`/attendance/${day.id}`, {
          clock_in: clockIn,
          // Empty is a real answer here — it reopens the day — so it is sent as
          // null rather than left out.
          clock_out: clockOut.trim() === '' ? null : clockOut,
          break_begin: breakBegin.trim() === '' ? null : breakBegin,
          break_end: breakEnd.trim() === '' ? null : breakEnd,
        });
        toast.ok('Attendance corrected.');
      } else {
        // A day nobody punched has no row to correct, so one is written. Breaks
        // are not asked for here: a day being reconstructed after the fact is
        // reconstructed from when somebody arrived and left.
        await api.post('/attendance', {
          emp_id: empId,
          date,
          clock_in: clockIn,
          clock_out: clockOut.trim() === '' ? null : clockOut,
        });
        toast.ok('Attendance recorded.');
      }
      onSaved();
      onClose();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, value: string, set: (v: string) => void, help?: string) => (
    <Grid size={{ xs: 6 }}>
      <TextField
        label={label}
        type="time"
        value={value}
        onChange={(e) => set(e.target.value)}
        helperText={help}
        slotProps={{ inputLabel: { shrink: true } }}
      />
    </Grid>
  );

  return (
    <Dialog
      title={`${date}${name ? ` — ${name}` : ''}`}
      onClose={onClose}
      onSubmit={save}
      submitLabel="Save"
      busy={busy}
      disabled={clockIn.trim() === ''}
    >
      <Grid container spacing={2}>
        {field('Punched in', clockIn, setClockIn)}
        {field('Punched out', clockOut, setClockOut, 'Leave empty to reopen the day')}
        {/* Only where there is a break to change. A day being written from
            scratch is written from arrival and departure. */}
        {day && field('Break from', breakBegin, setBreakBegin)}
        {day && field('Break to', breakEnd, setBreakEnd)}
      </Grid>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        {day
          ? 'Only their employer can change this, and the change is not recorded as theirs — correct what actually happened, not what should have.'
          : 'Nothing was punched on this day. Recording it here writes the day as their employer, not as them.'}
      </Typography>
    </Dialog>
  );
}
