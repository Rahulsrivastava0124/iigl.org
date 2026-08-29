import { useState } from 'react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { Avatar, Box, Stack, Typography } from '@mui/material';
import PresentIcon from '@mui/icons-material/EventAvailableOutlined';
import OpenIcon from '@mui/icons-material/HourglassEmptyOutlined';
import HoursIcon from '@mui/icons-material/AccessTimeOutlined';
import { useFetch } from '../lib/useFetch';
import MonthCalendar, { monthRange, thisMonth } from '../components/MonthCalendar';
import { Panel, StateChip, Tile, YesNo, attendanceState } from '../components/ui';
import { attendanceDay, dayKey, hours, isOpen, minutesWorked } from '../lib/attendance';
import type { Day } from '../lib/attendance';
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

  const recorded = days.data?.data ?? [];
  const byDate = new Map(recorded.map((d) => [dayKey(d), d]));
  const stillOpen = recorded.filter(isOpen).length;
  const workedMinutes = recorded.reduce((total, d) => total + minutesWorked(d), 0);

  const p = person.data?.data;
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
            src={p?.profile_photo || undefined}
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
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
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
      </Box>

      <MonthCalendar
        value={month}
        onChange={setMonth}
        subtitle="Attendance"
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
          days.loading
            ? 'Loading the month…'
            : recorded.length === 0
              ? 'No attendance recorded this month.'
              : 'A blank day is one with no attendance recorded.'
        }
      />
    </>
  );
}
