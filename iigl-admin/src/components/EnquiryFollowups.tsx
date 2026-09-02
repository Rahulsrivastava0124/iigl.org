import { useEffect, useState } from 'react';
import { Box, CircularProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { DateField, Dialog, Notice, StateChip, type Tone } from './ui';
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
  if (loading) {
    return (
      <Stack sx={{ alignItems: 'center', py: 3 }}>
        <CircularProgress size={22} />
      </Stack>
    );
  }

  if (rows.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
        Nobody has followed this up yet.
      </Typography>
    );
  }

  return (
    <Stack spacing={0}>
      {rows.map((f, i) => {
        const outcome = outcomeOf(f.outcome);
        return (
          <Box
            key={f.id}
            sx={{
              py: 1.5,
              ...(i > 0 && { borderTop: 1, borderColor: 'divider' }),
            }}
          >
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <StateChip tone={outcome.tone} label={outcome.label} />
              {f.status_from && (
                <Typography variant="caption" color="text.secondary">
                  {f.status_from} → {f.status_to}
                </Typography>
              )}
              <Box sx={{ flex: 1 }} />
              <Typography variant="caption" color="text.secondary">
                {String(f.created_at ?? '').slice(0, 16).replace('T', ' ')}
                {f.done_by_name ? ` · ${f.done_by_name}` : ''}
              </Typography>
            </Stack>

            {f.note && (
              <Typography variant="body2" sx={{ mt: 0.75, whiteSpace: 'pre-wrap' }}>
                {f.note}
              </Typography>
            )}

            {f.next_follow_up_on && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Next attempt due {String(f.next_follow_up_on).slice(0, 10)}
              </Typography>
            )}
          </Box>
        );
      })}
    </Stack>
  );
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
  enquiry: { id: number; name: string; status: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
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

  const save = async () => {
    setBusy(true);
    try {
      await api.post(BOOKS[book].path(enquiry.id), {
        outcome,
        note: note.trim(),
        next_follow_up_on: next || null,
        status: effective || undefined,
      });
      toast.ok(`Follow-up recorded for ${enquiry.name}.`);
      onSaved();
      onClose();
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
      onSubmit={save}
      submitLabel="Record follow-up"
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
