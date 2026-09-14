import { useState } from 'react';
import { Box, Button, Grid, MenuItem, Stack, TextField } from '@mui/material';
import LoginIcon from '@mui/icons-material/LoginOutlined';
import LogoutIcon from '@mui/icons-material/LogoutOutlined';
import BreakIcon from '@mui/icons-material/FreeBreakfastOutlined';
import { useToast } from '../components/Toast';
import { isSuper, isLab } from '../lib/portal';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf, useAuth } from '../lib/auth';
import MonthCalendar, { monthRange, thisMonth } from '../components/MonthCalendar';
import { ConfirmDialog, Panel, StateChip } from '../components/ui';
import MessageCompose from '../components/MessageCompose';
import ChatInbox from '../components/ChatInbox';
import RequestIcon from '@mui/icons-material/EventNoteOutlined';
import type { StaffMessage } from '../components/StaffInbox';
import MessageIcon from '@mui/icons-material/ForumOutlined';
import { absentDay, absentFrom, attendanceDay, shiftOf, dayKey, holidayDay, hours, isOpen, minutesWorked, noteDay, noteOn, noteTip, time, weekOffDay, weekOffDays } from '../lib/attendance';
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
  /** The days of the week their posting is off, `"0,6"` style. */
  week_off: string | null;
  joining_date: string | null;
  created_at: string | null;
  working_hours: string | null;
  late_after: string | null;
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
  // Writing to one's employer is one's own business, not a grant: an employee
  // always may, as the API has always allowed.
  const canMessage = true;

  // 'me' rather than '' — an empty MUI select value leaves the label
  // unshrunk, so the field shows its label where the choice should be.
  const [empId, setEmpId] = useState('me');
  const [month, setMonth] = useState(thisMonth());
  /** The write-to-your-employer dialog. */
  const [writing, setWriting] = useState(false);
  /** The messages beside the calendar, so the calendar can mark their days. */
  const [messages, setMessages] = useState<StaffMessage[]>([]);
  const { from, to, days: daysInMonth } = monthRange(month);

  const today = useFetch<{ data: Today }>('/attendance/today');
  const staff = useFetch<{ data: StaffRow[] }>(canReadOthers ? '/users/staff?per_page=200' : null);

  const query = new URLSearchParams({ from, to, per_page: '200' });
  if (empId !== 'me') query.set('emp_id', empId);
  const history = useFetch<Paged<Day>>(`/attendance?${query}`);

  /* The days the office was shut: head office's list and this laboratory's. */
  const holidays = useFetch<{ data: Holiday[] }>(`/holidays?from=${from}&to=${to}`);

  /*
    Which days of the week this posting is off.

    Read from the staff list when somebody else's month is on screen — it
    already carries every posting on the page — and from `/users/me` when it is
    your own, which is the one case that list does not cover: staff cannot read
    it, and it is the only screen they open.
  */
  const mine = useFetch<{
    data: {
      created_at: string | null;
      employment: {
        week_off: string | null;
        joining_date: string | null;
        working_hours: string | null;
        late_after: string | null;
      } | null;
    };
  }>(empId === 'me' ? '/users/me' : null);
  const other = (staff.data?.data ?? []).find((r) => String(r.id) === empId);
  const weekOff = weekOffDays(empId === 'me' ? mine.data?.data.employment?.week_off : other?.week_off);
  /** How long their day is and when they are late, to mark the month against. */
  const shift = shiftOf(empId === 'me' ? mine.data?.data.employment : other);
  /** The first day an empty square counts as an absence. */
  const since =
    empId === 'me'
      ? absentFrom(mine.data?.data.employment?.joining_date, mine.data?.data.created_at)
      : absentFrom(other?.joining_date, other?.created_at);
  const holidayOn = new Map((holidays.data?.data ?? []).map((h) => [h.date, h]));

  const [busy, setBusy] = useState(false);

  /*
    Asked before it is done. Each of these writes a time only their employer can
    change afterwards, so a misplaced press is somebody else's correction.
  */
  const [asking, setAsking] = useState<{
    path: string;
    body: unknown;
    done: string;
    title: string;
    message: string;
    label: string;
  } | null>(null);

  const act = async (ask: NonNullable<typeof asking>) => {
    setBusy(true);
    try {
      await api.post(ask.path, ask.body);
      toast.ok(ask.done);
      today.reload();
      if (empId === 'me') history.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
      setAsking(null);
    }
  };

  /** Now, to the minute — the time the answer is about to record. */
  const clock = () =>
    new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const t = today.data?.data;
  const rows = history.data?.data ?? [];
  const byDate = new Map(rows.map((d) => [dayKey(d), d]));
  const workedMinutes = rows.reduce((total, d) => total + minutesWorked(d), 0);
  const stillOpen = rows.filter(isOpen).length;

  return (
    <>
      {/*
        One row: the day, where it stands, and the three buttons that change
        it. It was a titled panel with a body under it, which is two rows and a
        rule for a line of text and four controls — the shape a table wants,
        over something that is not one.

        `Panel`'s header is already "one row, always", so this is that header
        and nothing else.
      */}
      {t && (
        <Panel
          title="Today"
          subtitle={
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
              <Box component="span" className="tabular">
                {t.date}
              </Box>
              {t.record ? (
                <>
                  <Box
                    component="span"
                    className="tabular"
                    sx={{ fontSize: 15, fontWeight: 600, color: 'text.primary' }}
                  >
                    {time(t.record.clockIn)}
                    {t.record.clockOut && t.record.clockOut !== '00:00:00'
                      ? ` \u2014 ${time(t.record.clockOut)}`
                      : ''}
                  </Box>
                  {t.on_break && <StateChip tone="waiting" label="On break" />}
                  {!t.can_clock_out && !t.can_clock_in && (
                    <StateChip tone="settled" label="Day closed" />
                  )}
                </>
              ) : (
                <Box component="span">Not clocked in.</Box>
              )}
            </Box>
          }
          actions={
            <Stack direction="row" spacing={1}>
              <Button
                variant="contained"
                color="inherit"
                startIcon={<LoginIcon />}
                disabled={busy || !t.can_clock_in}
                onClick={() =>
                  setAsking({
                    path: '/attendance/clock-in',
                    body: {},
                    done: 'Punched in. Have a good day.',
                    title: 'Punch in',
                    message: `Start your day at ${clock()}?`,
                    label: 'Punch in',
                  })
                }
              >
                Punch in
              </Button>
              <Button
                variant="contained"
                color="success"
                startIcon={<BreakIcon />}
                disabled={busy || !t.record || !t.can_clock_out}
                onClick={() =>
                  setAsking({
                    path: '/attendance/break',
                    body: { on_break: !t.on_break },
                    done: t.on_break ? 'Back from break.' : 'On a break.',
                    title: t.on_break ? 'End break' : 'Break',
                    message: t.on_break
                      ? `Back to work at ${clock()}?`
                      : `Start a break at ${clock()}?`,
                    label: t.on_break ? 'End break' : 'Break',
                  })
                }
              >
                {t.on_break ? 'End break' : 'Break'}
              </Button>
              <Button
                variant="contained"
                color="error"
                startIcon={<LogoutIcon />}
                disabled={busy || !t.can_clock_out}
                onClick={() =>
                  setAsking({
                    path: '/attendance/clock-out',
                    body: {},
                    done: 'Punched out. See you tomorrow.',
                    title: 'Punch out',
                    message: `Close the day at ${clock()}? Only your employer can change it afterwards.`,
                    label: 'Punch out',
                  })
                }
              >
                Punch out
              </Button>
              {/*
                The clock records now and nothing else, so the day somebody
                forgot to punch out of cannot be fixed from here — only their
                employer may change a record. What they can do is say so, and
                this is where they say it.
              */}
              {canMessage && (
                <Button startIcon={<MessageIcon />} onClick={() => setWriting(true)}>
                  Message employer
                </Button>
              )}
            </Stack>
          }
          sx={{ mb: 2 }}
        />
      )}

      {writing && <MessageCompose templates onClose={() => setWriting(false)} />}

      <ConfirmDialog
        open={Boolean(asking)}
        danger={false}
        title={asking?.title ?? ''}
        message={asking?.message ?? ''}
        confirmLabel={asking?.label ?? 'Confirm'}
        busy={busy}
        onClose={() => setAsking(null)}
        onConfirm={() => asking && act(asking)}
      />

      {/*
        Half and half: the month on one side, what they have written on the
        other. The two belong together — nearly every message is about a day on
        that grid — and neither needs the whole width to be read.
      */}
      <Grid container spacing={2} sx={{ alignItems: 'flex-start' }}>
        {/*
          Seven across against a list of lines: the calendar needs the wider
          half, or a month of two-digit dates wraps inside cells too narrow to
          hold the times they carry.
        */}
        <Grid size={{ xs: 12, lg: canReadOthers ? 12 : 7 }}>
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
          const notes = noteOn(messages, date);
          const off = weekOff.has(new Date(`${date}T00:00:00`).getDay());

          /*
            What happened outranks what was asked for. Attendance and a holiday
            are facts about the day; a request is somebody's word about it, so
            on a day that already has one it is added to the tooltip rather than
            painted over the colour.

            A week off ranks under both and over a note. Somebody who came in on
            their day off worked, and the green says so; the office being shut
            is the stronger reason nobody was here.
          */
          const said = notes.length > 0 ? ` · ${noteTip(notes)}` : '';
          if (record) {
            const day = attendanceDay(record, shut, shift);
            return {
              ...day,
              tooltip: `${day.tooltip ?? ''}${off ? ' · week off' : ''}${said}`,
            };
          }
          if (shut) {
            const day = holidayDay(shut);
            return { ...day, tooltip: `${day.tooltip ?? ''}${said}` };
          }
          if (off) {
            const day = weekOffDay();
            return { ...day, tooltip: `${day.tooltip ?? ''}${said}` };
          }
          // A declined request does not excuse the day, so the note is given
          // what the day would be without it.
          if (notes.length > 0) return noteDay(notes, absentDay(date, since, shift.lateAfter));
          // Nothing punched, nothing said, and they were due in: red.
          return absentDay(date, since, shift.lateAfter);
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
                // and "twenty-two" is usually the two yellow squares.
                (holidayOn.size > 0
                  ? ` · ${holidayOn.size} ${holidayOn.size === 1 ? 'holiday' : 'holidays'}`
                  : '')
        }
      />
        </Grid>

        {/* Head office and a laboratory read their messages on the Messages
            page, not here. */}
        {!canReadOthers && (
          <Grid size={{ xs: 12, lg: 5 }}>
            {/*
              Their chat with their employer, here beside the month rather than
              on a page of its own: most of what an employee writes is about a
              day on this calendar. Only their own employer — the API sends an
              employee's message nowhere else.

              Plain messages are typed in the box. A leave request or a punch
              correction names a day and waits for an answer, so it keeps its
              own form behind Request.
            */}
            <ChatInbox
              party="employer"
              multi={false}
              title="Messages"
              emptyText="Nobody employs this account, so there is nobody to write to."
              height={560}
              onRows={setMessages}
              actions={
                <Button size="small" startIcon={<RequestIcon />} onClick={() => setWriting(true)}>
                  Request
                </Button>
              }
            />
          </Grid>
        )}
      </Grid>
    </>
  );
}
