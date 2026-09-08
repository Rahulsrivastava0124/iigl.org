import { useState } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import {
  Avatar,
  Box,
  Grid,
  Stack,
  Typography,
} from '@mui/material';
import PresentIcon from '@mui/icons-material/EventAvailableOutlined';
import OpenIcon from '@mui/icons-material/HourglassEmptyOutlined';
import HoursIcon from '@mui/icons-material/AccessTimeOutlined';
import HolidayIcon from '@mui/icons-material/CelebrationOutlined';
import { fileUrl } from '../lib/config';
import { useFetch } from '../lib/useFetch';
import MonthCalendar, { monthRange, thisMonth } from '../components/MonthCalendar';
import { Panel, Tile, YesNo } from '../components/ui';
import { attendanceDay, dayKey, holidayDay, hours, isOpen, minutesWorked, noteDay, noteOn, noteTip } from '../lib/attendance';
import AttendanceEdit from '../components/AttendanceEdit';
import StaffInbox, { type StaffMessage } from '../components/StaffInbox';
import SalaryHistory from '../components/SalaryHistory';
import { useAuth } from '../lib/auth';
import type { Day, Holiday } from '../lib/attendance';
import type { Paged } from '../lib/api';

interface Employment {
  id: number;
  lab_empid: string;
  joining_date: string;
  salary: string;
  lab_id: number | null;
  lab_name: string | null;
  lab_mobile: string | null;
  employer_role_id: number | null;
}

interface Employee {
  id: number;
  empid: string | null;
  fullname: string;
  mobile: string;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  role_id: number | null;
  is_active: number;
  profile_photo: string | null;
  employment: Employment | null;
}

interface Role {
  id: number;
  role_name: string;
}

const initials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/** One labelled fact in the header. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Typography component="div" sx={{ fontSize: 13.5 }}>
        {children}
      </Typography>
    </Box>
  );
}

/**
 * One employee, and their attendance as a month.
 *
 * The list answers "who works here". This answers "what did this person's
 * month look like", which thirty-one rows of a table does not: an absence is a
 * gap, and a gap is visible in a calendar where a missing row is not.
 */
export default function EmployeeView() {
  const { id } = useParams();
  const person = useFetch<{ data: Employee }>(`/users/${id}`);
  const roles = useFetch<{ data: Role[] }>('/roles');

  const [month, setMonth] = useState(thisMonth());
  const { from, to, days: daysInMonth } = monthRange(month);

  const days = useFetch<Paged<Day>>(
    id ? `/attendance?emp_id=${id}&from=${from}&to=${to}&per_page=200` : null,
  );

  /* The days the office was shut — head office's list and this laboratory's. */
  const holidays = useFetch<{ data: Holiday[] }>(`/holidays?from=${from}&to=${to}`);
  const holidayOn = new Map((holidays.data?.data ?? []).map((h) => [h.date, h]));

  const recorded = days.data?.data ?? [];
  const byDate = new Map(recorded.map((d) => [dayKey(d), d]));
  const stillOpen = recorded.filter(isOpen).length;
  const workedMinutes = recorded.reduce((total, d) => total + minutesWorked(d), 0);

  const p = person.data?.data;

  /*
    Correcting a day is the employer's, not the employee's: a person editing
    their own attendance is a person writing their own timesheet, and the API
    refuses it either way. This screen belongs to whoever employs them, so
    anybody who is not the person on it may correct a day here.
  */
  const { user } = useAuth();
  const mayCorrect = Boolean(user && p && user.id !== p.id);
  /** The day being corrected or written, as a date. Its record may not exist. */
  const [editing, setEditing] = useState<string | null>(null);
  /** Their messages, so the calendar can mark the days they are about. */
  const [messages, setMessages] = useState<StaffMessage[]>([]);

  const roleName =
    p && p.role_id !== null
      ? (roles.data?.data.find((r) => r.id === p.role_id)?.role_name ?? `role ${p.role_id}`)
      : 'No role';

  return (
    <>
      <Panel title="Employee" sx={{ mb: 2 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          sx={{ p: 2, alignItems: { md: 'center' } }}
        >
          <Avatar
            src={fileUrl(p?.profile_photo) ?? undefined}
            sx={{ width: 56, height: 56, bgcolor: 'primary.main', fontSize: 18 }}
          >
            {initials(p?.fullname ?? '')}
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{ fontSize: 18, fontWeight: 600 }}>
              {p?.fullname ?? (person.loading ? 'Loading…' : 'Employee')}
            </Typography>
            <Typography variant="caption" color="text.secondary" className="mono">
              {p?.empid || '—'} · {p?.mobile ?? '—'}
              {p?.email ? ` · ${p.email}` : ''}
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, auto)' },
              gap: 2,
            }}
          >
            <Fact label="Role">{roleName}</Fact>
            <Fact label="Works under">{p?.employment?.lab_name ?? 'Nobody'}</Fact>
            <Fact label="Joined">{p?.employment?.joining_date || '—'}</Fact>
            <Fact label="Salary">
              {p?.employment?.salary && Number(p.employment.salary) > 0
                ? `₹${Number(p.employment.salary).toLocaleString('en-IN')}`
                : '—'}
            </Fact>
            <Fact label="Active">
              <YesNo on={p?.is_active ?? 0} />
            </Fact>
          </Box>
        </Stack>
      </Panel>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(4, 1fr)' },
          gap: 2,
          mb: 2,
        }}
      >
        <Tile
          label="Days present"
          value={String(recorded.length)}
          note={`of ${daysInMonth}`}
          icon={PresentIcon}
          fill="brand"
        />
        <Tile
          label="Still open"
          value={String(stillOpen)}
          note={stillOpen === 1 ? 'day' : 'days'}
          icon={OpenIcon}
          tone={stillOpen > 0 ? 'waiting' : 'plain'}
        />
        <Tile label="Hours worked" value={hours(workedMinutes)} icon={HoursIcon} />
        <Tile
          label="Holidays"
          value={String(holidayOn.size)}
          note="office shut"
          icon={HolidayIcon}
          tone={holidayOn.size > 0 ? 'holiday' : 'plain'}
        />
      </Box>

      {/*
        The month, and what it has to say about itself.

        Half and half: the grid answers "what did the month look like", the
        column beside it answers "what needs fixing", and neither is legible
        inside the other — an absence is a blank square, and a blank square
        explains nothing.
      */}
      <Grid container spacing={2} sx={{ alignItems: 'flex-start' }}>
        <Grid size={{ xs: 12, lg: 6 }}>
      <MonthCalendar
        value={month}
        onChange={setMonth}
        subtitle="Attendance"
        dayFor={(date) => {
          const record = byDate.get(date);
          const shut = holidayOn.get(date);
          const notes = noteOn(messages, date);

          /*
            What happened outranks what was asked for: attendance and a holiday
            are facts about the day, a request is somebody's word about it. On a
            day that has both, the request joins the tooltip; on an empty one it
            is the only thing there is to show, and it is the day the employer
            is being asked to do something about.
          */
          const said = notes.length > 0 ? ` · ${noteTip(notes)}` : '';
          if (record) {
            const day = attendanceDay(record, shut);
            return { ...day, tooltip: `${day.tooltip ?? ''}${said}` };
          }
          if (shut) {
            const day = holidayDay(shut);
            return { ...day, tooltip: `${day.tooltip ?? ''}${said}` };
          }
          return notes.length > 0 ? noteDay(notes) : null;
        }}
        /*
          Any day that has already happened, recorded or not. A day nobody
          punched is exactly the one somebody needs to write — it was blank and
          unpressable, which is the wrong way round.
        */
        onPick={mayCorrect ? (date) => setEditing(date) : undefined}
        pickBlank={mayCorrect}
        /*
          No legend. The cells carry their own times and the colour follows
          them — green closed, amber still open — so the chips restated what the
          grid above already showed, and the note explained an empty square.
        */
        note={days.loading ? 'Loading the month…' : undefined}
      />

        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          {/*
            What they have written, not what the sheet implies. An inbox is
            somebody's own words — "I forgot to punch out on Tuesday", "I need
            Friday off" — and it sits beside the attendance because that is
            nearly always what it is about.
          */}
          <StaffInbox
            from={Number(id)}
            title="Messages and requests"
            /* The calendar marks the days they name, from these same rows. */
            onRows={setMessages}
          />
        </Grid>
      </Grid>

      {/*
        What they have actually been paid, every month of it, with each month's
        payslip on its own row. The salary screen shows one month across
        everybody; this is the other cut of the same record — one person, all
        the way back — and it is the only place an old month's payslip can be
        reached.
      */}
      <SalaryHistory empId={Number(id)} title="Salary paid" sx={{ mt: 2 }} />

      {editing && (
        <AttendanceEdit
          day={byDate.get(editing) ?? null}
          date={editing}
          empId={Number(id)}
          name={p?.fullname}
          onClose={() => setEditing(null)}
          onSaved={days.reload}
        />
      )}
    </>
  );
}
