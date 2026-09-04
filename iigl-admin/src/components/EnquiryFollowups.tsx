import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@mui/material';
import {
  Box,
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
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { DateField, Dialog, Notice, StateChip, TableFrame, type Tone } from './ui';
import { useToast } from './Toast';

/**
 * The two enquiry books.
 *
 * They are different records — a complaint is not a course enquiry — but they
 * are worked identically, so one log, one set of endpoints and these same two
 * dialogs serve both. A book supplies only what differs: where its endpoints
 * are, and what its status column allows.
 */
export type Book = 'enquiry' | 'student';

const BOOKS: Record<
  Book,
  { path: (id: number) => string; statuses: { id: string; label: string }[] }
> = {
  enquiry: {
    path: (id) => `/enquiries/${id}/followups`,
    statuses: [
      { id: 'new', label: 'New' },
      { id: 'open', label: 'Open' },
      { id: 'closed', label: 'Closed' },
    ],
  },
  student: {
    path: (id) => `/students/enquiries/${id}/followups`,
    statuses: [
      { id: 'new', label: 'New' },
      { id: 'contacted', label: 'Contacted' },
      { id: 'interested', label: 'Interested' },
      { id: 'converted', label: 'Converted' },
      { id: 'not_interested', label: 'Not interested' },
    ],
  },
};

/**
 * How one attempt went, and where it usually leaves the enquiry.
 *
 * The two books name their middle state differently — the general book calls
 * it `open`, the course book `contacted` — so the suggested move is per book.
 */
const OUTCOMES: {
  id: string;
  label: string;
  tone: Tone;
  moves?: Record<Book, string | undefined>;
}[] = [
  { id: 'reached', label: 'Reached them', tone: 'settled', moves: { enquiry: 'open', student: 'contacted' } },
  { id: 'no_answer', label: 'No answer', tone: 'waiting' },
  { id: 'interested', label: 'Interested', tone: 'settled', moves: { enquiry: 'open', student: 'interested' } },
  { id: 'not_interested', label: 'Not interested', tone: 'refused', moves: { enquiry: 'closed', student: 'not_interested' } },
  { id: 'converted', label: 'Converted', tone: 'settled', moves: { enquiry: 'closed', student: 'converted' } },
];

const outcomeOf = (id: string) =>
  OUTCOMES.find((o) => o.id === id) ?? { id, label: id, tone: 'plain' as Tone };

export interface Followup {
  id: number;
  note: string | null;
  outcome: string;
  next_follow_up_on: string | null;
  status_from: string | null;
  status_to: string | null;
  done_by_name: string | null;
  created_at: string | null;
}

/**
 * The history of one enquiry: every attempt to reach somebody, newest first.
 *
 * Read-only, and used in two places — on its own when viewing an enquiry, and
 * under the form when recording a new attempt, where seeing what was said last
 * time is the point of having it open.
 */
export function FollowupHistory({ rows, loading }: { rows: Followup[]; loading: boolean }) {
  return (
    <TableFrame
      loading={loading}
      error={null}
      empty={rows.length === 0}
      emptyText="Nobody has followed this up yet."
    >
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>When</TableCell>
            <TableCell>Outcome</TableCell>
            <TableCell>Moved</TableCell>
            <TableCell>What was said</TableCell>
            <TableCell>Next due</TableCell>
            <TableCell>By</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((f) => {
            const outcome = outcomeOf(f.outcome);
            return (
              <TableRow key={f.id} hover>
                {/*
                  Date over time in one column rather than two: the pair is one
                  fact, and a table this narrow cannot spare a column to split
                  it across.
                */}
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {dayLabel(String(f.created_at ?? '').slice(0, 10))}
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {timeOf(f.created_at)}
                  </Typography>
                </TableCell>

                <TableCell>
                  <StateChip tone={outcome.tone} label={outcome.label} />
                </TableCell>

                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {f.status_from ? `${f.status_from} → ${f.status_to}` : '—'}
                </TableCell>

                {/* The only column worth wrapping: everything else is a word. */}
                <TableCell sx={{ whiteSpace: 'pre-wrap', minWidth: 200 }}>
                  {f.note || '—'}
                </TableCell>

                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {f.next_follow_up_on ? dayLabel(String(f.next_follow_up_on).slice(0, 10)) : '—'}
                </TableCell>

                <TableCell sx={{ whiteSpace: 'nowrap' }}>{f.done_by_name ?? '—'}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableFrame>
  );
}

/** The time of an attempt, to the minute. Empty when the row carries none. */
const timeOf = (at: string | null) => String(at ?? '').slice(11, 16);

/**
 * `2026-09-02` as `2 Sep 2026`, and today and yesterday by name.
 *
 * Built from the parts rather than passed to `new Date(string)`: a bare date
 * string is parsed as UTC, which in this timezone renders the day before.
 */
function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date || '—';

  const when = new Date(y, m - 1, d);
  const today = new Date();
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((midnight.getTime() - when.getTime()) / 86_400_000);

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';

  return when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Loads one enquiry's history. Shared by both dialogs below. */
function useFollowups(book: Book, enquiryId: number, reloadKey = 0) {
  const [rows, setRows] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    api
      .get<{ data: Followup[] }>(BOOKS[book].path(enquiryId))
      .then((r) => live && setRows(r.data))
      .catch(() => live && setRows([]))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [book, enquiryId, reloadKey]);

  return { rows, loading };
}

/**
 * Records one attempt.
 *
 * The outcome carries a suggested status move — "not interested" closes it,
 * "reached" opens it — which is filled in and can be overridden. The move is
 * the common case and typing it twice is how a status ends up disagreeing with
 * the history beside it.
 */
export function FollowupDialog({
  book = 'enquiry',
  enquiry,
  onClose,
  onSaved,
}: {
  book?: Book;
  enquiry: {
    id: number;
    name: string;
    status: string;
    /* Carried only by the course book, and only so a conversion can hand the
       registration form what the enquiry already knows. */
    mobile?: string;
    email?: string | null;
    course_id?: number | null;
    course_interested?: string | null;
    remarks?: string | null;
  };
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const { rows, loading } = useFollowups(book, enquiry.id);

  const [outcome, setOutcome] = useState('reached');
  const [note, setNote] = useState('');
  const [next, setNext] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  // The suggestion follows the outcome until the status is set by hand.
  const [touched, setTouched] = useState(false);
  const suggested = (outcomeOf(outcome) as { moves?: Record<Book, string | undefined> }).moves?.[book] ?? '';
  const effective = touched ? status : suggested;

  /*
    A conversion is two things: the attempt that ended in one, and the student
    the enquiry becomes. Recorded together — the follow-up is written first, so
    the book is right whether or not somebody finishes the registration, and
    the form opens carrying what the enquiry already knows.
  */
  const converting = book === 'student' && effective === 'converted';

  const save = async (thenRegister = false) => {
    setBusy(true);
    try {
      await api.post(BOOKS[book].path(enquiry.id), {
        outcome,
        note: note.trim(),
        next_follow_up_on: next || null,
        status: effective || undefined,
      });
      toast.ok(
        converting
          ? `${enquiry.name} marked converted.`
          : `Follow-up recorded for ${enquiry.name}.`,
      );
      onSaved();
      onClose();

      if (thenRegister) {
        navigate('/students/create', {
          state: {
            fromEnquiry: {
              id: enquiry.id,
              name: enquiry.name,
              mobile: enquiry.mobile ?? '',
              email: enquiry.email ?? '',
              course_id: enquiry.course_id ?? null,
              remark: enquiry.remarks ?? '',
            },
          },
        });
      }
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={`Follow up — ${enquiry.name}`}
      onClose={onClose}
      onSubmit={() => save()}
      submitLabel={converting ? 'Record & convert' : 'Record follow-up'}
      secondary={
        converting ? (
          <Button variant="outlined" disabled={busy} onClick={() => save(true)}>
            Convert &amp; register student
          </Button>
        ) : undefined
      }
      busy={busy}
      maxWidth="md"
    >
      <Stack spacing={2}>
        <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', rowGap: 2 }}>
          <TextField
            select
            label="How it went"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            sx={{ width: 220 }}
          >
            {OUTCOMES.map((o) => (
              <MenuItem key={o.id} value={o.id}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>

          <DateField
            label="Next attempt due"
            value={next}
            onChange={setNext}
            sx={{ width: 220 }}
          />

          <TextField
            select
            label="Status after this"
            value={effective}
            onChange={(e) => {
              setTouched(true);
              setStatus(e.target.value);
            }}
            sx={{ width: 220 }}
          >
            <MenuItem value="">Leave it as {enquiry.status}</MenuItem>
            {BOOKS[book].statuses.map((st) => (
              <MenuItem key={st.id} value={st.id}>
                {st.label}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        <TextField
          label="What was said"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          multiline
          minRows={3}
        />

        {rows.length > 0 && (
          <Box>
            <Typography sx={{ fontSize: 13.5, fontWeight: 600, mb: 0.5 }}>
              Earlier attempts
            </Typography>
            <FollowupHistory rows={rows} loading={loading} />
          </Box>
        )}
      </Stack>
    </Dialog>
  );
}

/** The enquiry as it stands, with everything that has been tried on it. */
export function EnquiryViewDialog({
  book = 'enquiry',
  enquiry,
  onClose,
}: {
  book?: Book;
  enquiry: {
    id: number;
    name: string;
    mobile: string;
    email: string | null;
    kind: string;
    subject: string | null;
    message: string | null;
    source: string | null;
    status: string;
    remark: string | null;
    created_at: string | null;
  };
  onClose: () => void;
}) {
  const { rows, loading } = useFollowups(book, enquiry.id);

  const line = (label: string, value: string | null | undefined) => (
    <Box sx={{ minWidth: 180 }}>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{value || '—'}</Typography>
    </Box>
  );

  return (
    <Dialog
      title={enquiry.name}
      onClose={onClose}
      onSubmit={onClose}
      submitLabel="Done"
      maxWidth="md"
    >
      <Stack spacing={2.5}>
        {enquiry.status === 'new' && rows.length === 0 && (
          <Notice kind="warn">Nobody has picked this up yet.</Notice>
        )}

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
            gap: 2,
          }}
        >
          {line('Mobile', enquiry.mobile)}
          {line('Email', enquiry.email)}
          {line('Kind', enquiry.kind)}
          {line('Source', enquiry.source)}
          {line('Received', enquiry.created_at?.slice(0, 10))}
          {line('Status', enquiry.status)}
        </Box>

        {(enquiry.subject || enquiry.message) && (
          <Box>
            {line('What they asked', enquiry.subject)}
            {enquiry.message && (
              <Typography sx={{ fontSize: 13.5, mt: 1, whiteSpace: 'pre-wrap' }}>
                {enquiry.message}
              </Typography>
            )}
          </Box>
        )}

        {enquiry.remark && line('Remark', enquiry.remark)}

        <Box>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600, mb: 0.5 }}>
            Follow-up history
          </Typography>
          <FollowupHistory rows={rows} loading={loading} />
        </Box>
      </Stack>
    </Dialog>
  );
}
