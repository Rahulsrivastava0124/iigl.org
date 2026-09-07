import { useState } from 'react';
import { Button, CircularProgress, Stack, Tooltip, Typography, alpha } from '@mui/material';
import PunchInIcon from '@mui/icons-material/LoginOutlined';
import PunchOutIcon from '@mui/icons-material/LogoutOutlined';
import BreakIcon from '@mui/icons-material/FreeBreakfastOutlined';
import ResumeIcon from '@mui/icons-material/PlayArrowOutlined';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { useFetch } from '../lib/useFetch';
import { useToast } from './Toast';

/**
 * Punch in, break, punch out — in the bar, where the day starts.
 *
 * Attendance is the one thing a member of staff does that is not about an
 * order: they arrive, they take a break, they leave. It was a screen to
 * navigate to, which is one navigation too many for something done at the door,
 * so it lives in the header for the people who do it.
 *
 * The state comes from `/attendance/today`, which already answers the three
 * questions this needs — may they clock in, may they clock out, are they on a
 * break — so the buttons are what the server says rather than what the browser
 * remembers.
 */

interface Today {
  date: string;
  record: { clockIn: string; clockOut: string | null; break_begin: string | null } | null;
  can_clock_in: boolean;
  can_clock_out: boolean;
  on_break: boolean;
}

/** `09:12` from `09:12:33`. Seconds are noise on a clock nobody is racing. */
const hhmm = (t: string | null | undefined) => String(t ?? '').slice(0, 5);

export default function PunchClock() {
  const toast = useToast();
  const { data, loading, reload } = useFetch<{ data: Today }>('/attendance/today');
  const [busy, setBusy] = useState(false);
  const today = data?.data;

  const act = async (path: string, body: unknown, done: string) => {
    setBusy(true);
    try {
      await api.post(`/attendance/${path}`, body);
      toast.ok(done);
      reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading && !today) return <CircularProgress size={18} sx={{ color: 'inherit' }} />;
  if (!today) return null;

  /* The white-on-navy shape the header's other button already uses. */
  const button = {
    bgcolor: '#fff',
    color: 'primary.main',
    '&:hover': { bgcolor: alpha('#fff', 0.88) },
  };

  // The day is over: nothing left to press, so it says how it went instead.
  if (!today.can_clock_in && !today.can_clock_out) {
    return (
      <Tooltip title="Today is closed">
        <Typography sx={{ fontSize: 12.5, color: alpha('#fff', 0.8), whiteSpace: 'nowrap' }}>
          {hhmm(today.record?.clockIn)} – {hhmm(today.record?.clockOut)}
        </Typography>
      </Tooltip>
    );
  }

  if (today.can_clock_in) {
    return (
      <Button
        size="small"
        variant="contained"
        startIcon={<PunchInIcon />}
        disabled={busy}
        onClick={() => act('clock-in', {}, 'Punched in. Have a good day.')}
        sx={button}
      >
        Punch in
      </Button>
    );
  }

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      {/* In since when, so the two buttons beside it have a context. */}
      <Typography
        sx={{ fontSize: 12.5, color: alpha('#fff', 0.8), display: { xs: 'none', lg: 'block' } }}
      >
        In {hhmm(today.record?.clockIn)}
      </Typography>

      <Button
        size="small"
        variant="contained"
        startIcon={today.on_break ? <ResumeIcon /> : <BreakIcon />}
        disabled={busy}
        onClick={() =>
          act(
            'break',
            { on_break: !today.on_break },
            today.on_break ? 'Back from break.' : 'On a break.',
          )
        }
        sx={today.on_break ? undefined : button}
        color={today.on_break ? 'warning' : undefined}
      >
        {today.on_break ? 'End break' : 'Break'}
      </Button>

      <Button
        size="small"
        variant="outlined"
        startIcon={<PunchOutIcon />}
        disabled={busy}
        onClick={() => act('clock-out', {}, 'Punched out. See you tomorrow.')}
        sx={{ color: '#fff', borderColor: alpha('#fff', 0.5), '&:hover': { borderColor: '#fff' } }}
      >
        Punch out
      </Button>
    </Stack>
  );
}
