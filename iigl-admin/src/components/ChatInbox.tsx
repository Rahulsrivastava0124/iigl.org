import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Avatar,
  Badge,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SendIcon from '@mui/icons-material/SendRounded';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import ApproveIcon from '@mui/icons-material/CheckCircleOutlined';
import DeclineIcon from '@mui/icons-material/CancelOutlined';
import SentIcon from '@mui/icons-material/DoneRounded';
import SeenIcon from '@mui/icons-material/DoneAllRounded';
import AttachIcon from '@mui/icons-material/AttachFileRounded';
import PdfIcon from '@mui/icons-material/PictureAsPdfOutlined';
import CloseIcon from '@mui/icons-material/CloseRounded';
import { api, type Paged } from '../lib/api';
import { messageOf, useAuth } from '../lib/auth';
import { useFetch, useLiveRefresh } from '../lib/useFetch';
import { isLab, isSuper, ROLE } from '../lib/portal';
import { BRAND } from '../lib/theme';
import { fileUrl } from '../lib/config';
import { useToast } from './Toast';
import type { StaffMessage } from './StaffInbox';
import FilePreview, { isPdf } from './FilePreview';
import { uploadFiles } from '../lib/upload';

/** `employer` is an employee's one conversation: with whoever employs them, and nobody else. */
type Party = 'head_office' | 'laboratories' | 'staff' | 'employer';

interface Message extends StaffMessage {
  /** The recipient's name, resolved by the list endpoint. */
  to_name?: string | null;
  /** Each side's `users.profile_photo`, as stored. Read with `fileUrl`. */
  from_photo?: string | null;
  to_photo?: string | null;
  /** A photograph or PDF sent with it, as a stored path. Read with `fileUrl`. */
  attachment?: string | null;
}

interface Recipient {
  id: number;
  fullname: string;
  empid: string | null;
  role_id: number | null;
  profile_photo?: string | null;
}

interface Contact {
  id: number;
  name: string;
  photo: string | null;
  last: Message | null;
  unread: number;
}

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';

const dayLabel = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** What a request is about, in the words somebody reading it would use. */
const requestLabel = (m: Message) =>
  m.topic === 'leave' ? 'Leave request' : m.topic === 'punch' ? 'Punch correction' : 'Request';

/**
 * Messages as a chat: one conversation per person, theirs on the left and yours
 * on the right, with a box at the bottom to write in.
 *
 * It replaces a list of messages with Reply buttons, where answering somebody
 * opened a dialog and the answer was then folded under the thing it answered.
 * A conversation read top to bottom is what people already know how to follow.
 *
 * **Who is on the left.** Somebody who talks to many people — head office with
 * its laboratories and staff, a laboratory with its staff — gets the list of
 * those people beside the chat, most recent first, with anybody not yet written
 * to underneath so a conversation can be started. Somebody with only one person
 * on the other side (a laboratory's line to head office, an employee's to their
 * employer) gets the chat alone: a list with one name in it is a click that
 * does nothing.
 *
 * **Requests** still need an answer, so a leave request or punch correction
 * that is waiting carries Approve and Decline on its own bubble. Opening a
 * conversation marks the plain messages in it as read, which is what clears
 * the unread count on the Messages entry in the sidebar.
 */
export default function ChatInbox({
  party,
  multi,
  title,
  emptyText,
  actions,
  height = 'calc(100vh - 220px)',
  onRows,
}: {
  /** Which people this conversation list is about, decided by their role. */
  party: Party;
  /** Many people on the other side: show the list of them on the left. */
  multi: boolean;
  title: string;
  emptyText: string;
  /** Controls for the conversation's header row, on the right. */
  actions?: ReactNode;
  /** How tall the chat is. A whole page by default; a section of one passes its own. */
  height?: string | number;
  /** The messages in this conversation list, for a caller that marks them elsewhere too. */
  onRows?: (rows: Message[]) => void;
}) {
  const toast = useToast();
  const { user } = useAuth();
  const me = user?.id ?? 0;
  const employer = isSuper(user) || isLab(user);

  const { data, loading, error, reload } = useFetch<Paged<Message>>('/messages?box=all&per_page=200');
  useLiveRefresh(reload);

  // People this account may start a conversation with, for the list's lower half.
  const recipients = useFetch<{ data: Recipient[] }>(multi && employer ? '/messages/recipients' : null);

  // An employee's employer: the one person their chat is with.
  const boss = useFetch<{ data: { id: number; fullname: string; profile_photo?: string | null } | null }>(
    party === 'employer' ? '/messages/employer' : null,
  );
  const bossId = boss.data?.data?.id ?? null;

  const inParty = (role: number | null | undefined) => {
    if (party === 'employer') return true;
    if (party === 'head_office') return role === ROLE.SUPER;
    if (party === 'laboratories') return role === ROLE.ADMIN;
    return role !== ROLE.SUPER && role !== ROLE.ADMIN;
  };

  /* Every message in this conversation list, oldest first. */
  const messages = useMemo(() => {
    const all = data?.data ?? [];
    return all
      .filter((m) =>
        party === 'employer'
          ? // Only the conversation with their own employer, strictly.
            bossId !== null && (m.from_user === bossId || m.to_user === bossId)
          : inParty(m.from_user === me ? m.to_role_id : m.from_role_id),
      )
      .sort((a, b) => a.id - b.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, me, party, bossId]);

  // Handed out for a caller that also draws them — the attendance calendar marks
  // the days a request is about.
  useEffect(() => {
    onRows?.(messages);
  }, [messages, onRows]);

  const otherOf = (m: Message) => (m.from_user === me ? Number(m.to_user) : m.from_user);
  const nameOf = (m: Message) => (m.from_user === me ? m.to_name : m.from_name) ?? 'Unknown';
  const photoOf = (m: Message) => (m.from_user === me ? m.to_photo : m.from_photo) ?? null;

  /*
    Head office's Employees are its own employees, strictly: the people the API
    lets it write to. Older conversations with a laboratory's staff are left out
    of the list rather than shown as chats it can no longer answer.
  */
  const ownOnly = isSuper(user) && party === 'staff';

  const contacts: Contact[] = useMemo(() => {
    const byId = new Map<number, Contact>();
    for (const m of messages) {
      const id = otherOf(m);
      const c = byId.get(id) ?? { id, name: nameOf(m), photo: photoOf(m), last: null, unread: 0 };
      c.last = m;
      if (m.to_user === me && !m.resolved_at) c.unread += 1;
      byId.set(id, c);
    }
    const allowed = new Set((recipients.data?.data ?? []).map((r) => r.id));
    const talked = [...byId.values()]
      .filter((c) => !ownOnly || allowed.has(c.id))
      .sort((a, b) => (b.last?.id ?? 0) - (a.last?.id ?? 0));
    const quiet = (recipients.data?.data ?? [])
      .filter((r) => inParty(r.role_id) && !byId.has(r.id))
      .map((r) => ({ id: r.id, name: r.fullname, photo: r.profile_photo ?? null, last: null, unread: 0 }));
    // An employee who has not written yet still has somebody to write to.
    if (party === 'employer' && bossId !== null && !byId.has(bossId) && boss.data?.data) {
      return [{ id: bossId, name: boss.data.data.fullname, photo: boss.data.data.profile_photo ?? null, last: null, unread: 0 }];
    }
    return [...talked, ...quiet];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, recipients.data, me, party, ownOnly, bossId, boss.data]);

  const [selected, setSelected] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  // One person on the other side: they are the conversation.
  const activeId = multi ? selected : (contacts[0]?.id ?? null);
  const active = contacts.find((c) => c.id === activeId) ?? null;
  const thread = messages.filter((m) => otherOf(m) === activeId);

  /* Opening a conversation reads it: plain messages waiting in it are marked
     read, which is what the sidebar counts. Requests stay open until answered. */
  const marking = useRef(new Set<number>());
  useEffect(() => {
    const toMark = thread.filter(
      (m) => m.to_user === me && !m.resolved_at && m.kind === 'message' && !marking.current.has(m.id),
    );
    if (toMark.length === 0) return;
    toMark.forEach((m) => marking.current.add(m.id));
    Promise.all(toMark.map((m) => api.patch(`/messages/${m.id}/resolve`, { resolved: true })))
      .then(reload)
      .catch(() => undefined);
  }, [thread, me, reload]);

  /* Keep the newest message in view. */
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [activeId, thread.length]);

  const [text, setText] = useState('');

  /*
    A file to go with the next message: a photograph or a PDF, uploaded the
    moment it is chosen so Send only has to name it. One per message, as a
    chat sends them.
  */
  const [file, setFile] = useState<{ path: string; name: string } | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const attach = async (chosen: File | undefined) => {
    if (!chosen) return;
    const okType = chosen.type.startsWith('image/') || chosen.type === 'application/pdf';
    if (!okType) {
      toast.error('Attach a photograph or a PDF.');
      return;
    }
    setUploading(0);
    try {
      const [stored] = await uploadFiles('message', [chosen], (pct) => setUploading(pct));
      setFile({ path: stored.path, name: chosen.name });
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setUploading(null);
    }
  };
  const [sending, setSending] = useState(false);

  /*
    Who a message goes to is decided the way the API decides who may write to
    whom. An employer names the person. An employee names nobody — they answer
    to one employer. A laboratory cannot open a conversation with head office,
    only answer one, so its message goes as a reply to head office's latest.
  */
  const lastFromThem = [...thread].reverse().find((m) => m.from_user === activeId);
  const blockedReason =
    !active
      ? 'Choose a conversation.'
      : party === 'head_office' && !lastFromThem
        ? 'Head office has not written to you yet. You can reply once it does.'
        : null;

  const send = async () => {
    const body = text.trim();
    if ((!body && !file) || !active || blockedReason) return;
    setSending(true);
    try {
      const attachment = file?.path ?? null;
      if (party === 'head_office') {
        await api.post('/messages', { body, attachment, reply_to: lastFromThem!.id });
      } else if (employer) {
        await api.post('/messages', { body, attachment, to: [active.id] });
      } else {
        await api.post('/messages', { body, attachment });
      }
      setText('');
      setFile(null);
      reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setSending(false);
    }
  };

  const decide = async (m: Message, decision: 'approved' | 'declined') => {
    try {
      await api.patch(`/messages/${m.id}/resolve`, { resolved: true, decision });
      toast.ok(decision === 'approved' ? 'Approved.' : 'Declined.');
      reload();
    } catch (e) {
      toast.error(messageOf(e));
    }
  };

  const shown = contacts.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <Paper
      variant="outlined"
      sx={{ display: 'flex', height, minHeight: 460, overflow: 'hidden' }}
    >
      {/* ------------------------------------------------ the people, on the left */}
      {multi && (
        <Box
          sx={{
            width: { xs: 240, md: 300 },
            flexShrink: 0,
            borderRight: 1,
            borderColor: 'divider',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              {title}
            </Typography>
            <TextField
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Box>
          <List dense disablePadding sx={{ overflowY: 'auto', flex: 1 }}>
            {shown.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                {loading ? 'Loading…' : 'Nobody to show.'}
              </Typography>
            )}
            {shown.map((c) => (
              <ListItemButton
                key={c.id}
                selected={c.id === activeId}
                onClick={() => setSelected(c.id)}
                sx={{ py: 1, borderBottom: 1, borderColor: 'divider' }}
              >
                <ListItemAvatar sx={{ minWidth: 52 }}>
                  <Avatar
                    src={fileUrl(c.photo) ?? undefined}
                    alt=""
                    sx={{ width: 40, height: 40, fontSize: 14, bgcolor: BRAND.navySoft }}
                  >
                    {initials(c.name)}
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={c.name}
                  secondary={
                    c.last
                      ? (c.last.from_user === me ? 'You: ' : '') +
                        (c.last.body || (isPdf(c.last.attachment) ? 'PDF document' : 'Photo'))
                      : 'Start a conversation'
                  }
                  slotProps={{
                    primary: { noWrap: true, sx: { fontWeight: c.unread ? 700 : 500 } },
                    secondary: { noWrap: true },
                  }}
                />
                <Stack sx={{ alignItems: 'flex-end', ml: 1, flexShrink: 0 }} spacing={0.5}>
                  {c.last && (
                    <Typography variant="caption" color="text.secondary">
                      {dayLabel(c.last.created_at) === 'Today' ? time(c.last.created_at) : dayLabel(c.last.created_at)}
                    </Typography>
                  )}
                  {c.unread > 0 && <Badge badgeContent={c.unread} color="success" sx={{ mr: 1 }} />}
                </Stack>
              </ListItemButton>
            ))}
          </List>
        </Box>
      )}

      {/* ------------------------------------------------ the conversation */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider', alignItems: 'center' }}
        >
          {active ? (
            <>
              <Avatar
                src={fileUrl(active.photo) ?? undefined}
                alt=""
                sx={{ width: 40, height: 40, fontSize: 14, bgcolor: BRAND.navy }}
              >
                {initials(active.name)}
              </Avatar>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>
                {active.name}
              </Typography>
            </>
          ) : (
            <Typography variant="subtitle1" color="text.secondary" sx={{ flex: 1 }}>
              {title}
            </Typography>
          )}
          {actions}
        </Stack>

        <Box sx={{ flex: 1, overflowY: 'auto', px: { xs: 1.5, md: 3 }, py: 2, bgcolor: '#f0f2f5' }}>
          {error && (
            <Typography color="error" variant="body2">
              {error}
            </Typography>
          )}
          {loading && !data && (
            <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
              <CircularProgress size={24} />
            </Box>
          )}
          {!loading && !active && (
            <Typography color="text.secondary" variant="body2" sx={{ textAlign: 'center', mt: 6 }}>
              {multi ? 'Choose somebody on the left to read or start a conversation.' : emptyText}
            </Typography>
          )}
          {active && thread.length === 0 && (
            <Typography color="text.secondary" variant="body2" sx={{ textAlign: 'center', mt: 6 }}>
              No messages yet. Write the first one below.
            </Typography>
          )}

          {thread.map((m, i) => {
            const mine = m.from_user === me;
            const newDay = i === 0 || dayLabel(thread[i - 1].created_at) !== dayLabel(m.created_at);
            const waiting = m.kind === 'request' && !m.resolved_at;
            return (
              <Box key={m.id}>
                {newDay && (
                  <Box sx={{ textAlign: 'center', my: 1.5 }}>
                    <Chip size="small" label={dayLabel(m.created_at)} sx={{ bgcolor: '#fff' }} />
                  </Box>
                )}
                <Box sx={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', mb: 0.75 }}>
                  <Box
                    sx={{
                      maxWidth: '72%',
                      px: 1.5,
                      pt: 0.75,
                      pb: 0.5,
                      borderRadius: 2,
                      // Yours in the green people know from every chat app,
                      // theirs in white; the square corner points at who spoke.
                      bgcolor: mine ? '#d9fdd3' : '#fff',
                      borderTopRightRadius: mine ? 2 : undefined,
                      borderTopLeftRadius: mine ? undefined : 2,
                      boxShadow: '0 1px 0.5px rgba(11,20,26,.13)',
                    }}
                  >
                    {m.kind === 'request' && (
                      <Stack direction="row" spacing={0.75} sx={{ mb: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Chip size="small" color="warning" label={requestLabel(m)} />
                        {m.about_date && (
                          <Typography variant="caption" color="text.secondary">
                            for {String(m.about_date).slice(0, 10)}
                          </Typography>
                        )}
                        {m.decision && (
                          <Chip
                            size="small"
                            color={m.decision === 'approved' ? 'success' : 'error'}
                            label={m.decision === 'approved' ? 'Approved' : 'Declined'}
                          />
                        )}
                      </Stack>
                    )}
                    {m.attachment &&
                      (isPdf(m.attachment) ? (
                        /* A PDF opens in its own tab, where it can be read and
                           printed; it has no picture to show in a bubble. */
                        <Box
                          component="a"
                          href={fileUrl(m.attachment) ?? undefined}
                          target="_blank"
                          rel="noopener"
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            p: 1,
                            mb: 0.5,
                            borderRadius: 1.5,
                            bgcolor: mine ? 'rgba(0,0,0,.05)' : '#f0f2f5',
                            color: 'text.primary',
                            textDecoration: 'none',
                            '&:hover': { bgcolor: mine ? 'rgba(0,0,0,.09)' : '#e4e7eb' },
                          }}
                        >
                          <PdfIcon sx={{ color: '#d93025' }} />
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            PDF document
                          </Typography>
                        </Box>
                      ) : (
                        <Box
                          component="img"
                          src={fileUrl(m.attachment) ?? undefined}
                          alt=""
                          onClick={() => setPreviewing(m.attachment ?? null)}
                          sx={{
                            display: 'block',
                            maxWidth: 260,
                            maxHeight: 260,
                            width: '100%',
                            objectFit: 'cover',
                            borderRadius: 1.5,
                            mb: 0.5,
                            cursor: 'zoom-in',
                          }}
                        />
                      ))}
                    {m.body && (
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {m.body}
                      </Typography>
                    )}
                    {/*
                      The time, and on your own messages whether it has been
                      seen: one grey tick for sent, two blue ticks once the
                      other person has opened it. Seen is `resolved_at`, which
                      is set when they read the conversation (or answer a
                      request), so it is theirs to set and not a guess.
                    */}
                    <Stack
                      direction="row"
                      spacing={0.25}
                      sx={{ justifyContent: 'flex-end', alignItems: 'center', mt: 0.25 }}
                    >
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                        {time(m.created_at)}
                      </Typography>
                      {mine &&
                        (m.resolved_at ? (
                          <SeenIcon titleAccess="Seen" sx={{ fontSize: 16, color: '#53bdeb' }} />
                        ) : (
                          <SentIcon titleAccess="Sent" sx={{ fontSize: 16, color: 'text.secondary' }} />
                        ))}
                    </Stack>
                    {waiting && !mine && (
                      <Stack direction="row" spacing={1} sx={{ mt: 0.75, mb: 0.5 }}>
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          startIcon={<ApproveIcon />}
                          onClick={() => decide(m, 'approved')}
                        >
                          Approve
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          startIcon={<DeclineIcon />}
                          onClick={() => decide(m, 'declined')}
                        >
                          Decline
                        </Button>
                      </Stack>
                    )}
                    {waiting && mine && (
                      <Typography variant="caption" color="warning.main" sx={{ display: 'block' }}>
                        Waiting for an answer
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Box>
            );
          })}
          <div ref={bottom} />
        </Box>

        {/* ------------------------------------------------ the box to write in */}
        <Box sx={{ px: 1.5, py: 1, borderTop: 1, borderColor: 'divider', bgcolor: '#f0f2f5' }}>
          {/* What is attached to the message about to be sent, with a way to take it off. */}
          {(file || uploading !== null) && (
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: 'center', mb: 1, px: 1, py: 0.75, bgcolor: '#fff', borderRadius: 2 }}
            >
              {file && !isPdf(file.path) ? (
                <Box
                  component="img"
                  src={fileUrl(file.path) ?? undefined}
                  alt=""
                  sx={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 1 }}
                />
              ) : (
                <PdfIcon sx={{ color: file ? '#d93025' : 'text.disabled' }} />
              )}
              <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>
                {uploading !== null ? `Uploading… ${uploading}%` : file?.name}
              </Typography>
              {file && (
                <IconButton size="small" aria-label="Remove attachment" onClick={() => setFile(null)}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              )}
            </Stack>
          )}
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-end' }}>
            <input
              ref={picker}
              type="file"
              accept="image/*,application/pdf"
              hidden
              onChange={(e) => {
                attach(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <IconButton
              aria-label="Attach a photo or PDF"
              onClick={() => picker.current?.click()}
              disabled={Boolean(blockedReason) || sending || uploading !== null}
              sx={{ width: 40, height: 40 }}
            >
              <AttachIcon />
            </IconButton>
            <TextField
              placeholder={blockedReason ?? 'Type a message'}
              value={text}
              disabled={Boolean(blockedReason) || sending}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends, as in every chat; Shift+Enter is a new line.
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              multiline
              maxRows={4}
              slotProps={{ htmlInput: { maxLength: 2000 } }}
              sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#fff', borderRadius: 3 } }}
            />
            <IconButton
              aria-label="Send"
              onClick={send}
              disabled={(!text.trim() && !file) || Boolean(blockedReason) || sending || uploading !== null}
              sx={{
                bgcolor: BRAND.navy,
                color: '#fff',
                width: 40,
                height: 40,
                '&:hover': { bgcolor: BRAND.navySoft },
                '&.Mui-disabled': { bgcolor: 'action.disabledBackground' },
              }}
            >
              {sending ? <CircularProgress size={18} color="inherit" /> : <SendIcon fontSize="small" />}
            </IconButton>
          </Stack>
        </Box>
      </Box>
      {previewing && <FilePreview stored={previewing} title="Photo" onClose={() => setPreviewing(null)} />}
    </Paper>
  );
}
