import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/AddOutlined';
import ApproveIcon from '@mui/icons-material/CheckCircleOutlined';
import DeclineIcon from '@mui/icons-material/CancelOutlined';
import DoneIcon from '@mui/icons-material/DoneOutlined';
import UndoIcon from '@mui/icons-material/UndoOutlined';
import ReplyIcon from '@mui/icons-material/ReplyOutlined';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { useFetch, useLiveRefresh } from '../lib/useFetch';
import { ROLE } from '../lib/portal';
import { Dialog, IconAction, Panel, RowActions, StateChip, TableFrame, ToneAction } from './ui';
import { useToast } from './Toast';
import type { Paged } from '../lib/api';

/**
 * What one employee has written to their employer.
 *
 * Messages and requests only — nothing derived. A note is somebody saying
 * "I forgot to punch out on Tuesday" or "I need Friday off", and it sits beside
 * their attendance because that is nearly always what it is about.
 *
 * A request is **approved or declined**, and the answer can carry a sentence.
 * "Dealt with" was the whole of it before, and it does not tell the person who
 * asked whether they got the day off — the two outcomes were the same badge.
 *
 * A plain message has no decision to make, so it keeps the single control: it
 * is read and closed, or it is not.
 */

export interface StaffMessage {
  id: number;
  kind: 'message' | 'request';
  /** Which template a request came from: `leave`, `punch`, or null. */
  topic: string | null;
  /** How it was answered: `approved`, `declined`, or null. */
  decision: string | null;
  body: string;
  about_date: string | null;
  /** The request this answers, when it is an answer to one. */
  reply_to: number | null;
  resolved_at: string | null;
  created_at: string | null;
  from_user: number;
  from_name: string | null;
  /** The sender's role: 1 head office, 2 a laboratory, 3 and up (or none) staff. */
  from_role_id?: number | null;
  to_user?: number;
  /** The recipient's role, on the same scale. */
  to_role_id?: number | null;
}

const day = (v: string | null) => String(v ?? '').slice(0, 10);

/**
 * What the badge on the left says.
 *
 * "Request" told the reader nothing they could act on — every one of them was a
 * request. What is worth knowing at a glance is what it is about, which the
 * template recorded.
 */
function kindChip(m: StaffMessage): { tone: 'waiting' | 'plain'; label: string } {
  if (m.kind !== 'request') return { tone: 'plain', label: 'Message' };
  if (m.topic === 'leave') return { tone: 'waiting', label: 'Leave request' };
  if (m.topic === 'punch') return { tone: 'waiting', label: 'Punch correction' };
  return { tone: 'waiting', label: 'Request' };
}

/**
 * What became of it, in the words somebody asking would use.
 *
 * Three outcomes and three colours: **Approved** green, **Declined** red, and
 * grey **Closed** for a request answered before there was a decision to
 * record. Grey on purpose — the old label was green, which reads as a yes on a
 * request that may well have been refused, and "Dealt with" told the person
 * who asked nothing they came to find out.
 */
function outcome(m: StaffMessage): {
  tone: 'settled' | 'refused' | 'waiting' | 'plain';
  label: string;
} {
  if (!m.resolved_at) {
    return { tone: 'waiting', label: m.kind === 'request' ? 'Waiting for an answer' : 'Unread' };
  }
  if (m.decision === 'approved') return { tone: 'settled', label: 'Approved' };
  if (m.decision === 'declined') return { tone: 'refused', label: 'Declined' };
  return { tone: 'plain', label: m.kind === 'request' ? 'Closed' : 'Read' };
}

export default function StaffInbox({
  from,
  /** Both directions for one account, rather than one person's writing. */
  conversation = false,
  title = 'Messages',
  /** Pressing + . Given, the panel offers one; absent, it is read-only. */
  onCompose,
  /** The loaded messages, for a caller that draws them somewhere else too. */
  onRows,
  /**
   * Reading your own. Marking a request dealt with is the reader's, not the
   * writer's — the API refuses it either way — so the control is not offered.
   */
  own = false,
  /**
   * One conversation out of the whole box: with `head_office`, with
   * `laboratories`, or with `staff` — everybody who is neither. Decided by who
   * is on the other side of each message, so a reply sits with the conversation
   * it belongs to.
   */
  party,
  emptyText,
}: {
  from: number;
  conversation?: boolean;
  title?: string;
  onCompose?: () => void;
  onRows?: (rows: StaffMessage[]) => void;
  own?: boolean;
  party?: 'head_office' | 'laboratories' | 'staff';
  emptyText?: string;
}) {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch<Paged<StaffMessage>>(
    conversation ? '/messages?box=all&per_page=50' : `/messages?from=${from}&per_page=50`,
  );
  const all = data?.data ?? [];
  // A message just written shows at once: any save — sending, replying, marking
  // read — refreshes the list, as does coming back to the tab and every 30s.
  useLiveRefresh(reload);

  /*
    A reply belongs to the request it answers, not beside it.

    Sending the approver's sentence as a message is what puts it in somebody's
    inbox — but listed at the top level it arrived as "not Accept" floating
    above the leave request it refuses, two rows that read as unrelated. So
    replies come out of the list and are folded into the row they answer.

    An answer with no request left to attach to stays where it is rather than
    disappearing: whatever it says, somebody was told it.
  */
  const repliesTo = new Map<number, StaffMessage[]>();
  for (const m of all) {
    if (!m.reply_to) continue;
    const list = repliesTo.get(m.reply_to) ?? [];
    list.push(m);
    repliesTo.set(m.reply_to, list);
  }
  const otherSide = (m: StaffMessage) => (m.from_user === from ? m.to_role_id : m.from_role_id);
  const inParty = (m: StaffMessage) => {
    const role = otherSide(m);
    if (party === 'head_office') return role === ROLE.SUPER;
    if (party === 'laboratories') return role === ROLE.ADMIN;
    if (party === 'staff') return role !== ROLE.SUPER && role !== ROLE.ADMIN;
    return true;
  };
  const rows = all.filter(
    (m) => (!m.reply_to || !all.some((p) => p.id === m.reply_to)) && inParty(m),
  );
  // The same rows the calendar beside this marks its days from, handed up so
  // the two cannot show different months of the same list.
  useEffect(() => onRows?.(rows), [data]);
  const open = rows.filter((m) => !m.resolved_at).length;

  /*
    Answering a request: which way, and anything to say about it.

    The reply is optional and is sent as a message back to whoever asked, so
    "declined — we are short on the 24th" reaches their inbox rather than
    sitting on a record they have no reason to reopen.
  */
  const [answering, setAnswering] = useState<{
    message: StaffMessage;
    decision: 'approved' | 'declined';
  } | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const answer = async () => {
    if (!answering) return;
    setBusy(true);
    try {
      await api.patch(`/messages/${answering.message.id}/resolve`, {
        resolved: true,
        decision: answering.decision,
        reply: reply.trim(),
      });
      toast.ok(answering.decision === 'approved' ? 'Approved.' : 'Declined.');
      setAnswering(null);
      setReply('');
      reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  /*
    Replying to a message written to you — head office's notice to a laboratory,
    a laboratory's word to its staff. The answer goes back to whoever wrote it
    and folds under it, and replying is reading it, so the original is marked
    read at the same time.
  */
  const [replying, setReplying] = useState<StaffMessage | null>(null);
  const [replyText, setReplyText] = useState('');

  const sendReply = async () => {
    if (!replying) return;
    setBusy(true);
    try {
      await api.post('/messages', { body: replyText.trim(), reply_to: replying.id });
      if (!replying.resolved_at) {
        await api.patch(`/messages/${replying.id}/resolve`, { resolved: true });
      }
      toast.ok(`Reply sent to ${replying.from_name ?? 'them'}.`);
      setReplying(null);
      setReplyText('');
      reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  /** A plain message, or reopening anything: no decision to make. */
  const resolve = async (m: StaffMessage) => {
    try {
      await api.patch(`/messages/${m.id}/resolve`, { resolved: !m.resolved_at });
      reload();
    } catch (e) {
      toast.error(messageOf(e));
    }
  };

  return (
    <Panel
      title={title}
      subtitle={open > 0 ? `${open} open` : undefined}
      count={rows.length ? `${rows.length} in all` : undefined}
      actions={
        onCompose ? (
          <Button size="small" startIcon={<AddIcon />} onClick={onCompose}>
            Write
          </Button>
        ) : undefined
      }
    >
      <TableFrame
        // The spinner only before the first load: a background refresh keeps
        // the list on screen instead of flashing it away every 30 seconds.
        loading={loading && !data}
        error={error}
        empty={rows.length === 0}
        emptyText={emptyText ?? (own ? 'You have not written anything yet.' : 'Nothing written yet.')}
      >
        <List dense disablePadding sx={{ maxHeight: 520, overflowY: 'auto' }}>
          {rows.map((m) => (
            <ListItem
              key={m.id}
              divider
              /*
                Answered rows are tinted, not faded.

                They used to drop to 60% opacity, which greyed out the reply and
                the Approved / Declined chip along with them — the part the
                person came back to read. A light royal-blue wash marks the row
                as dealt with and leaves every word at full strength; an open
                row stays white, so what still needs an answer is what stands
                out.
              */
              sx={{
                alignItems: 'flex-start',
                gap: 1,
                bgcolor: m.resolved_at ? '#eaf0fd' : 'transparent',
              }}
              secondaryAction={
                own ? (
                  // What became of it, rather than a control they cannot use.
                  <StateChip {...outcome(m)} />
                ) : (
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                    {/* Answered already: what was decided, beside the way back
                        if it was decided wrongly. */}
                    {m.resolved_at && <StateChip {...outcome(m)} />}
                    <RowActions>
                      {!m.resolved_at && m.kind === 'request' ? (
                        /* Worded, not bare icons: these two decide somebody's
                           day off, and the same pair reads the same way on
                           the transactions queue. */
                        <Stack direction="row" spacing={0.75}>
                          <ToneAction
                            label="Approve"
                            icon={ApproveIcon}
                            tone="settled"
                            size="small"
                            onClick={() => {
                              setReply('');
                              setAnswering({ message: m, decision: 'approved' });
                            }}
                          />
                          <ToneAction
                            label="Decline"
                            icon={DeclineIcon}
                            tone="refused"
                            size="small"
                            onClick={() => {
                              setReply('');
                              setAnswering({ message: m, decision: 'declined' });
                            }}
                          />
                        </Stack>
                      ) : (
                        /* A plain message is read and closed; there is nothing
                           to approve. Reopening is the same control both ways.
                           One written to you can be answered. */
                        <>
                          {m.kind === 'message' && m.from_user !== from && (
                            <IconAction
                              label="Reply"
                              icon={ReplyIcon}
                              onClick={() => {
                                setReplyText('');
                                setReplying(m);
                              }}
                            />
                          )}
                          <IconAction
                            label={m.resolved_at ? 'Reopen' : 'Mark read'}
                            icon={m.resolved_at ? UndoIcon : DoneIcon}
                            onClick={() => resolve(m)}
                          />
                        </>
                      )}
                    </RowActions>
                  </Stack>
                )
              }
            >
              <ListItemText
                primary={
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.25 }}>
                    {/* Whose words these are. Only worth saying where the list
                        holds both sides of a conversation. */}
                    {conversation && (
                      <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                        {m.from_user === from ? 'You' : (m.from_name ?? 'Them')}
                      </Typography>
                    )}
                    <StateChip {...kindChip(m)} />
                    {/* The day it is about, when it is about one. */}
                    {m.about_date && (
                      <Chip size="small" variant="outlined" label={day(m.about_date)} />
                    )}
                    <Typography variant="caption" color="text.secondary">
                      {day(m.created_at)}
                    </Typography>
                  </Stack>
                }
                secondary={
                  <>
                    <Box component="span" sx={{ display: 'block', whiteSpace: 'pre-wrap', fontSize: 13.5 }}>
                      {m.body}
                    </Box>
                    {/*
                      The answer, under the thing it answers.

                      Indented and ruled rather than given a row of its own: it
                      is the second half of one exchange, and a reply read apart
                      from what it replies to is half a sentence.
                    */}
                    {(repliesTo.get(m.id) ?? []).map((r) => (
                      <Box
                        key={r.id}
                        component="span"
                        sx={{
                          display: 'block',
                          mt: 0.75,
                          pl: 1.25,
                          borderLeft: 2,
                          borderColor: 'divider',
                        }}
                      >
                        <Typography
                          component="span"
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: 'block' }}
                        >
                          {r.from_user === from ? 'You replied' : `${r.from_name ?? 'They'} replied`}
                        </Typography>
                        <Box
                          component="span"
                          sx={{
                            display: 'block',
                            whiteSpace: 'pre-wrap',
                            fontSize: 13.5,
                            color: 'text.secondary',
                          }}
                        >
                          {r.body}
                        </Box>
                      </Box>
                    ))}
                  </>
                }
                slotProps={{ secondary: { color: 'text.primary' } }}
              />
            </ListItem>
          ))}
        </List>
      </TableFrame>

      {replying && (
        <Dialog
          title={`Reply to ${replying.from_name ?? 'them'}`}
          maxWidth="xs"
          onClose={() => setReplying(null)}
          onSubmit={sendReply}
          submitLabel="Send reply"
          busy={busy}
          disabled={replyText.trim() === ''}
        >
          <Stack spacing={2}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                {replying.from_name ?? 'They'} wrote, {day(replying.created_at)}
              </Typography>
              <Typography sx={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{replying.body}</Typography>
            </Box>
            <TextField
              label="Reply"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              multiline
              minRows={3}
              autoFocus
              slotProps={{ htmlInput: { maxLength: 2000 } }}
            />
          </Stack>
        </Dialog>
      )}

      {answering && (
        <Dialog
          title={
            answering.decision === 'approved'
              ? `Approve: ${kindChip(answering.message).label.toLowerCase()}`
              : `Decline: ${kindChip(answering.message).label.toLowerCase()}`
          }
          maxWidth="xs"
          onClose={() => setAnswering(null)}
          onSubmit={answer}
          submitLabel={answering.decision === 'approved' ? 'Approve' : 'Decline'}
          busy={busy}
        >
          <Stack spacing={2}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                {answering.message.from_name ?? 'They'} wrote
                {answering.message.about_date
                  ? `, about ${day(answering.message.about_date)}`
                  : ''}
              </Typography>
              <Typography sx={{ fontSize: 13.5, whiteSpace: 'pre-wrap' }}>
                {answering.message.body}
              </Typography>
            </Box>
            <TextField
              label="Reply"
              placeholder={
                answering.decision === 'approved'
                  ? 'Eg. Approved — enjoy the day.'
                  : 'Eg. We are short that day, sorry.'
              }
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              multiline
              minRows={2}
              helperText="Optional. Sent to them as a message, on the same day as the request."
            />
          </Stack>
        </Dialog>
      )}
    </Panel>
  );
}
