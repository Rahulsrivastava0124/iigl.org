import { useState } from 'react';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import LoginIcon from '@mui/icons-material/LoginOutlined';
import LogoutIcon from '@mui/icons-material/LogoutOutlined';
import BreakIcon from '@mui/icons-material/FreeBreakfastOutlined';
import { useToast } from '../components/Toast';
import { isSuper, isLab } from '../lib/portal';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf, useAuth } from '../lib/auth';
import MonthCalendar, { monthRange, thisMonth } from '../components/MonthCalendar';
import { Panel, StateChip, attendanceState } from '../components/ui';
import { attendanceDay, dayKey, hours, isOpen, minutesWorked, time } from '../lib/attendance';
import type { Day } from '../lib/attendance';
import type { Paged } from '../lib/api';

interface Today {
  date: string;
  record: Day | null;
  can_clock_in: boolean;
  can_clock_out: boolean;
  on_break: boolean;
}

interface StaffRow {
  id: number;
  fullname: string;
}

/**
 * Attendance: today's clock, and the month behind it.
 *
 * The history used to be a paged table. A month of days is a calendar — the
 * thing anybody opens attendance to find is an absence, and an absence is a gap
 * rather than a row. The same `MonthCalendar` draws an employee's month on
 * their own page.
 */
export default function Attendance() {
  const toast = useToast();
  const { user } = useAuth();
  // Head office and a laboratory may read somebody else's days; a team member
  // reads their own.
  const canReadOthers = isSuper(user) || isLab(user);

  // 'me' rather than '' — an empty MUI select value leaves the label
  // unshrunk, so the field shows its label where the choice should be.
  const [empId, setEmpId] = useState('me');
  const [month, setMonth] = useState(thisMonth());
  const { from, to, days: daysInMonth } = monthRange(month);

  const today = useFetch<{ data: Today }>('/attendance/today');
  const staff = useFetch<{ data: StaffRow[] }>(canReadOthers ? '/users/staff?per_page=200' : null);

  const query = new URLSearchParams({ from, to, per_page: '200' });
  if (empId !== 'me') query.set('emp_id', empId);
  const history = useFetch<Paged<Day>>(`/attendance?${query}`);

  const [busy, setBusy] = useState(false);

  const act = async (path: string, body: unknown, done: string) => {
    setBusy(true);
    try {
      await api.post(path, body);
      toast.ok(done);
      today.reload();
      if (empId === 'me') history.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const t = today.data?.data;
  const rows = history.data?.data ?? [];
  const byDate = new Map(rows.map((d) => [dayKey(d), d]));
  const workedMinutes = rows.reduce((total, d) => total + minutesWorked(d), 0);
  const stillOpen = rows.filter(isOpen).length;

  return (
    <>
      {t && (
        <Panel title="Today" sx={{ mb: 2 }}>
          <Box sx={{ p: 2.5 }}>
            <Stack
              direction="row"
              spacing={2}
              sx={{ alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}
            >
              <div>
                <Typography variant="overline" color="text.secondary" sx={{ display: 'block' }}>
                  Today · {t.date}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
                  {t.record ? (
                    <>
                      <Typography className="tabular" sx={{ fontSize: 18, fontWeight: 600 }}>
                        {time(t.record.clockIn)}
                        {t.record.clockOut && t.record.clockOut !== '00:00:00'
                          ? ` — ${time(t.record.clockOut)}`
                          : ''}
                      </Typography>
                      {t.on_break && <StateChip tone="waiting" label="On break" />}
                      {!t.can_clock_out && !t.can_clock_in && (
                        <StateChip tone="settled" label="Day closed" />
                      )}
                    </>
                  ) : (
                    <Typography color="text.secondary">Not clocked in.</Typography>
                  )}
                </Stack>
              </div>

              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  startIcon={<LoginIcon />}
                  disabled={busy || !t.can_clock_in}
                  onClick={() => act('/attendance/clock-in', {}, 'Clocked in.')}
                >
                  Clock in
                </Button>
                <Button
                  startIcon={<BreakIcon />}
                  disabled={busy || !t.record || !t.can_clock_out}
                  onClick={() =>
                    act(
                      '/attendance/break',
                      { on_break: !t.on_break },
                      t.on_break ? 'Break ended.' : 'Break started.',
                    )
                  }
                >
                  {t.on_break ? 'End break' : 'Start break'}
                </Button>
                <Button
                  startIcon={<LogoutIcon />}
                  disabled={busy || !t.can_clock_out}
                  onClick={() => act('/attendance/clock-out', {}, 'Clocked out.')}
                >
                  Clock out
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Panel>
      )}

      <MonthCalendar
        value={month}
        onChange={setMonth}
        subtitle="Attendance"
        actions={
          canReadOthers ? (
            <TextField
              select
              size="small"
              label="Person"
              value={empId}
              onChange={(e) => setEmpId(e.target.value)}
              sx={{ minWidth: 210, mr: 1 }}
            >
              <MenuItem value="me">Me</MenuItem>
              {(staff.data?.data ?? []).map((s) => (
                <MenuItem key={s.id} value={String(s.id)}>
                  {s.fullname}
                </MenuItem>
              ))}
            </TextField>
          ) : undefined
        }
        dayFor={(date) => {
          const record = byDate.get(date);
          return record ? attendanceDay(record) : null;
        }}
        legend={
          <>
            <StateChip {...attendanceState(true)} />
            <StateChip {...attendanceState(false)} />
          </>
        }
        note={
          history.loading
            ? 'Loading the month…'
            : rows.length === 0
              ? 'No attendance recorded this month.'
              : `${rows.length} of ${daysInMonth} days · ${hours(workedMinutes)} worked` +
                (stillOpen > 0 ? ` · ${stillOpen} still open` : '')
        }
      />
    </>
  );
}
