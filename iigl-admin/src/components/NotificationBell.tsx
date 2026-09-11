import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Badge,
  Box,
  Button,
  Divider,
  IconButton,
  List,
  ListItemButton,
  Popover,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import BellIcon from '@mui/icons-material/NotificationsNoneOutlined';
import MoneyIcon from '@mui/icons-material/PaymentsOutlined';
import MessageIcon from '@mui/icons-material/ForumOutlined';
import { useFetch } from '../lib/useFetch';
import { money, toneColour } from './ui';
import type { Paged, Transaction } from '../lib/api';
import type { StaffMessage } from './StaffInbox';
import { useAuth } from '../lib/auth';
import { isLab, isSuper, ROLE } from '../lib/portal';

/**
 * The bell, and what is behind it.
 *
 * One thing in this system waits on a person: money sent to them that they have
 * not yet approved or declined. That is what the count is, and now what the box
 * lists — sender, amount and when, as the Laravel header did, each opening the
 * queue where the decision is made.
 *
 * It counts what the API scopes: head office sees the commission laboratories
 * have remitted, a laboratory sees what its staff have handed in. Nothing here
 * decides who sees what.
 *
 * The list is re-read on every navigation. A queue that moves a few times a day
 * does not need a socket, and this costs one indexed count.
 */

/** `04-09 10:42 PM`, which is enough to tell one remittance from the next. */
const when = (at: string | null) => {
  if (!at) return '';
  const d = new Date(at.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return at.slice(0, 16);
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

export default function NotificationBell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const pending = useFetch<Paged<Transaction>>(
    '/transactions?status=0&direction=received&per_page=10',
  );
  /*
    The other thing that waits on a person: a message their staff have written
    and nobody has dealt with. Same shape of obligation as an unapproved
    transaction — somebody asked, and it sits there until you answer — so it
    belongs behind the same bell rather than on a screen they would have to know
    to open.
  */
  const notes = useFetch<Paged<StaffMessage>>('/messages?open=1&per_page=10');

  const rows = pending.data?.data ?? [];
  const messages = notes.data?.data ?? [];
  const waiting = (pending.data?.meta.total ?? 0) + (notes.data?.meta.total ?? 0);

  useEffect(() => {
    pending.reload();
    notes.reload();
    setAnchor(null);
  }, [location.pathname]);

  const go = (to: string) => {
    setAnchor(null);
    navigate(to);
  };

  /*
    Where a message is opened: on the page that actually holds it.

    Every message used to open the sender's employee page, which is right for
    exactly one case — an employer opening what their staff wrote, where the
    request is answered. For everybody else it opened a page about somebody the
    reader does not employ: a team member opening their laboratory's reply
    landed on the laboratory's own id, and saw an empty record reading "That
    account is not one of your employees".

    So the employee page only when the reader employs people and the sender is
    staff — any role but head office or a laboratory, including somebody with no
    role who works on grants alone. Everything else opens the reader's own
    messages on the attendance page. A team member never employs anybody, so
    they always go there, whatever the row says.
  */
  const { user } = useAuth();
  const employs = isSuper(user) || isLab(user);
  const destination = (m: StaffMessage) =>
    employs && m.from_role_id !== ROLE.SUPER && m.from_role_id !== ROLE.ADMIN
      ? `/staff/${m.from_user}`
      : '/attendance';

  return (
    <>
      <Tooltip
        title={
          waiting === 0
            ? 'Nothing is waiting on you'
            : `${waiting} transaction${waiting === 1 ? '' : 's'} awaiting your decision`
        }
      >
        <IconButton
          aria-label={waiting === 0 ? 'Notifications' : `Notifications, ${waiting} waiting`}
          onClick={(e) => setAnchor(e.currentTarget)}
        >
          <Badge color={toneColour('waiting')} badgeContent={waiting} max={99}>
            <BellIcon />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 340, maxWidth: '100vw' } } }}
      >
        <Box sx={{ px: 2, py: 1.25 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 600 }}>Notifications</Typography>
        </Box>
        <Divider />

        {messages.length > 0 && (
          <List dense disablePadding>
            {messages.map((m) => (
              <ListItemButton
                key={`m${m.id}`}
                onClick={() => go(destination(m))}
                sx={{ alignItems: 'flex-start', gap: 1.25, py: 1.25 }}
              >
                <MessageIcon
                  fontSize="small"
                  sx={{ mt: 0.25, color: m.kind === 'request' ? 'warning.main' : 'primary.main' }}
                />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 600 }} noWrap>
                      {m.from_name ?? 'Somebody'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                      {when(m.created_at)}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {m.kind === 'request' ? 'asks: ' : ''}
                    {m.body}
                  </Typography>
                </Box>
              </ListItemButton>
            ))}
          </List>
        )}

        {messages.length > 0 && rows.length > 0 && <Divider />}

        {rows.length === 0 && messages.length === 0 ? (
          <Box sx={{ px: 2, py: 3 }}>
            <Typography variant="body2" color="text.secondary">
              Nothing is waiting on you. Money sent to you, and messages your staff write, appear
              here until you have dealt with them.
            </Typography>
          </Box>
        ) : (
          <List dense disablePadding sx={{ maxHeight: 360, overflowY: 'auto' }}>
            {rows.map((t) => (
              <ListItemButton
                key={t.id}
                onClick={() => go('/transactions?status=0')}
                sx={{ alignItems: 'flex-start', gap: 1.25, py: 1.25 }}
              >
                <MoneyIcon fontSize="small" sx={{ mt: 0.25, color: 'primary.main' }} />
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 600 }} noWrap>
                      {t.send_by_name ?? 'Somebody'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                      {when(t.created_at)}
                    </Typography>
                  </Stack>
                  {/* An expense is a request to approve money already spent, not
                      money arriving — "has sent" would say the opposite. */}
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {t.transaction_type === 'expense' ? (
                      <>
                        spent {money(t.amount)}
                        {t.remark ? ` — ${t.remark}` : ''}
                      </>
                    ) : (
                      <>
                        has sent {money(t.amount)}
                        {t.transaction_type === 'commision' ? ' as commission' : ''}
                      </>
                    )}
                  </Typography>
                </Box>
              </ListItemButton>
            ))}
          </List>
        )}

        {/* The queue, only while there is money in it: messages are opened on
            the person who wrote them, which the row above already does. */}
        {rows.length > 0 && (
          <>
            <Divider />
            <Box sx={{ p: 1, textAlign: 'right' }}>
              <Button size="small" onClick={() => go('/transactions?status=0')}>
                {(pending.data?.meta.total ?? 0) > rows.length
                  ? `See all ${pending.data?.meta.total}`
                  : 'Open the queue'}
              </Button>
            </Box>
          </>
        )}
      </Popover>
    </>
  );
}
