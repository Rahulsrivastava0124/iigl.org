import { useState } from 'react';
import {
  Box,
  Button,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import LoginIcon from '@mui/icons-material/LoginOutlined';
import LogoutIcon from '@mui/icons-material/LogoutOutlined';
import BreakIcon from '@mui/icons-material/FreeBreakfastOutlined';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf, useAuth } from '../lib/auth';
import { Notice, Pager, Panel, StateChip, TableFrame, attendanceState } from '../components/ui';
import type { Paged } from '../lib/api';

interface Day {
  id: number;
  date: string;
  clockIn: string;
  clockOut: string | null;
  break_begin: string | null;
  break_end: string | null;
  status: string | null;
}

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

/** Both ends present and in order, otherwise nothing to show. */
function worked(day: Day): string {
  if (!day.clockIn || !day.clockOut || day.clockOut === '00:00:00') return '—';
  const [a, b] = [day.clockIn, day.clockOut].map((t) => {
    const [h, m, s] = t.split(':').map(Number);
    return h * 3600 + m * 60 + (s || 0);
  });
  if (b <= a) return '—';
  const minutes = Math.round((b - a) / 60);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

const time = (v: string | null) => (!v || v === '00:00:00' ? '—' : v.slice(0, 5));
const stamp = (v: string | null) => (v ? String(v).slice(11, 16) : '—');

export default function Attendance() {
  const { user } = useAuth();
  const canReadOthers = (user?.roleId ?? 0) <= 2;

  const [page, setPage] = useState(1);
  // 'me' rather than '' — an empty MUI select value leaves the label
  // unshrunk, so the field shows its label where the choice should be.
  const [empId, setEmpId] = useState('me');

  const today = useFetch<{ data: Today }>('/attendance/today');
  const staff = useFetch<{ data: StaffRow[] }>(canReadOthers ? '/users/staff?per_page=200' : null);

  const query = new URLSearchParams({ page: String(page), per_page: '31' });
  if (empId !== 'me') query.set('emp_id', empId);
  const history = useFetch<Paged<Day>>(`/attendance?${query}`);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const act = async (path: string, body: unknown, done: string) => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      await api.post(path, body);
      setMsg(done);
      today.reload();
      if (empId === 'me') history.reload();
    } catch (e) {
      setErr(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const t = today.data?.data;
  const rows = history.data?.data ?? [];

  return (
    <>
      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="error">{err}</Notice>}

      {t && (
        <Panel title="Today">
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

      <Panel
        title="History"
        actions={
          canReadOthers && (
            <TextField
              select
              label="Person"
              value={empId}
              onChange={(e) => {
                setEmpId(e.target.value);
                setPage(1);
              }}
              sx={{ minWidth: 210 }}
            >
              <MenuItem value="me">Me</MenuItem>
              {(staff.data?.data ?? []).map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.fullname}
                </MenuItem>
              ))}
            </TextField>
          )
        }
      >
        <TableFrame loading={history.loading} error={history.error} empty={rows.length === 0}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>In</TableCell>
                <TableCell>Out</TableCell>
                <TableCell>Break</TableCell>
                <TableCell align="right">Worked</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((d) => (
                <TableRow key={d.id} hover>
                  <TableCell>{String(d.date).slice(0, 10)}</TableCell>
                  <TableCell className="tabular">{time(d.clockIn)}</TableCell>
                  <TableCell className="tabular">{time(d.clockOut)}</TableCell>
                  <TableCell className="tabular">
                    {d.break_begin ? `${stamp(d.break_begin)} — ${stamp(d.break_end)}` : '—'}
                  </TableCell>
                  <TableCell align="right" className="tabular">
                    {worked(d)}
                  </TableCell>
                  <TableCell>
                    <StateChip {...attendanceState(d.status === '1')} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
        <Pager meta={history.data?.meta} onPage={setPage} />
      </Panel>
    </>
  );
}
