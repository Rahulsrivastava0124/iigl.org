import { useState } from 'react';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import LoginIcon from '@mui/icons-material/LoginOutlined';
import LogoutIcon from '@mui/icons-material/LogoutOutlined';
import BreakIcon from '@mui/icons-material/FreeBreakfastOutlined';
import { useToast } from '../components/Toast';
import { isSuper, isLab } from '../lib/portal';
import { usePermissions } from '../lib/permissions';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf, useAuth } from '../lib/auth';
import MonthCalendar, { monthRange, thisMonth } from '../components/MonthCalendar';
import { Panel, StateChip } from '../components/ui';
import MessageCompose from '../components/MessageCompose';
import MessageIcon from '@mui/icons-material/ForumOutlined';
import {
  attendanceDay,
  dayKey,
  holidayDay,
  hours,
  isOpen,
  minutesWorked,
  time,
} from '../lib/attendance';
import type { Day, Holiday } from '../lib/attendance';
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
  // A laboratory always may; its staff may when they have been granted it.
  const { can } = usePermissions();
  const canMessage = canReadOthers || can('message', 'create');

  // 'me' rather than '' — an empty MUI select value leaves the label
  // unshrunk, so the field shows its label where the choice should be.
  const [empId, setEmpId] = useState('me');
  const [month, setMonth] = useState(thisMonth());
  /** The write-to-your-employer dialog. */
  const [writing, setWriting] = useState(false);
  const { from, to, days: daysInMonth } = monthRange(month);

  const today = useFetch<{ data: Today }>('/attendance/today');
  const staff = useFetch<{ data: StaffRow[] }>(canReadOthers ? '/users/staff?per_page=200' : null);

  const query = new URLSearchParams({ from, to, per_page: '200' });
  if (empId !== 'me') query.set('emp_id', empId);
  const history = useFetch<Paged<Day>>(`/attendance?${query}`);

  /* The days the office was shut: head office's list and this laboratory's. */
  const holidays = useFetch<{ data: Holiday[] }>(`/holidays?from=${from}&to=${to}`);
  const holidayOn = new Map((holidays.data?.data ?? []).map((h) => [h.date, h]));

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
                {/*
                  The clock records now and nothing else, so the day somebody
                  forgot to punch out of cannot be fixed from here — only their
                  employer may change a record. What they can do is say so, and
                  this is where they say it.
                */}
                {/* Granted, like everything else a laboratory decides about
                    its front desk. */}
                {canMessage && (
                  <Button startIcon={<MessageIcon />} onClick={() => setWriting(true)}>
                    Message employer
                  </Button>
                )}
              </Stack>
            </Stack>
          </Box>
        </Panel>
      )}

      {writing && <MessageCompose onClose={() => setWriting(false)} />}

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
          const shut = holidayOn.get(date);
          // Attendance wins the colour: somebody who came in on a holiday
          // worked, and a pink square would say they did not.
          if (record) return attendanceDay(record, shut);
          return shut ? holidayDay(shut) : null;
        }}
        /* No legend: the cells carry their own times, and the colour follows
           them. The note below is the month's own summary, which says
           something the grid does not. */
        note={
          history.loading
            ? 'Loading the month…'
            : rows.length === 0
              ? 'No attendance recorded this month.'
              : `${rows.length} of ${daysInMonth} days · ${hours(workedMinutes)} worked` +
                (stillOpen > 0 ? ` · ${stillOpen} still open` : '') +
                // Said out loud, because the difference between "twenty days"
                // and "twenty-two" is usually the two pink squares.
                (holidayOn.size > 0
                  ? ` · ${holidayOn.size} ${holidayOn.size === 1 ? 'holiday' : 'holidays'}`
                  : '')
        }
      />
    </>
  );
}
