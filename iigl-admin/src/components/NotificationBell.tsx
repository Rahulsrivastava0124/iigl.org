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
import type { SvgIconComponent } from '@mui/icons-material';
import BellIcon from '@mui/icons-material/NotificationsNoneOutlined';
import MoneyIcon from '@mui/icons-material/PaymentsOutlined';
import CommissionIcon from '@mui/icons-material/PercentOutlined';
import TransferIcon from '@mui/icons-material/SwapHorizOutlined';
import ExpenseIcon from '@mui/icons-material/ReceiptLongOutlined';
import { useFetch, useLiveRefresh } from '../lib/useFetch';
import { TONE } from '../lib/theme';
import { money, toneColour, type Tone } from './ui';
import type { Paged, Transaction } from '../lib/api';

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


/**
 * What a notification is, at a glance: its own icon, in its own colour. The
 * colours are the panel's tones, so an expense is the red of money going out.
 */
function transactionLook(t: Transaction): { icon: SvgIconComponent; tone: Tone } {
  if (t.transaction_type === 'commision') return { icon: CommissionIcon, tone: 'settled' };
  if (t.transaction_type === 'expense') return { icon: ExpenseIcon, tone: 'refused' };
  if (t.transaction_type === 'wallet_transfer') return { icon: TransferIcon, tone: 'followup' };
  return { icon: MoneyIcon, tone: 'plain' };
}

/** The icon on a tinted disc. Light tones take their dark ink, not their fill. */
function Glyph({ icon: Icon, tone }: { icon: SvgIconComponent; tone: Tone }) {
  const t = TONE[tone];
  const ink = tone === 'lead' || tone === 'followup' || tone === 'holiday' ? t.on : t.main;
  return (
    <Box
      sx={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
        bgcolor: t.soft,
        color: ink,
      }}
    >
      <Icon sx={{ fontSize: 18 }} />
    </Box>
  );
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const pending = useFetch<Paged<Transaction>>(
    '/transactions?status=0&direction=received&per_page=10',
  );

  /*
    Money waiting on this account. Messages are not here: they are counted on
    Messages in the menu, where the conversation is.
  */
  const rows = pending.data?.data ?? [];
  const waiting = pending.data?.meta.total ?? 0;

  useEffect(() => {
    pending.reload();
    setAnchor(null);
  }, [location.pathname]);

  /*
    And while nobody moves. The bell used to refresh only on a change of page,
    so somebody sitting on one screen never saw the request that had just come
    in. Every 30 seconds while the tab is open, on coming back to it, and after
    any approval or reply made here.
  */
  useLiveRefresh(pending.reload);

  const go = (to: string) => {
    setAnchor(null);
    navigate(to);
  };


  return (
    <>
      <Tooltip
        title={
          waiting === 0
            ? 'Nothing is waiting on you'
            : `${waiting} waiting on you`
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


        {rows.length === 0 ? (
          <Box sx={{ px: 2, py: 3 }}>
            <Typography variant="body2" color="text.secondary">
              No notifications
            </Typography>
          </Box>
        ) : (
          <List dense disablePadding sx={{ maxHeight: 360, overflowY: 'auto' }}>
            {rows.map((t) => (
              <ListItemButton
                key={t.id}
                onClick={() => go('/wallet')}
                sx={{ alignItems: 'flex-start', gap: 1.25, py: 1.25 }}
              >
                <Glyph {...transactionLook(t)} />
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

        {/* The queue, only while there is money in it. */}
        {rows.length > 0 && (
          <>
            <Divider />
            <Box sx={{ p: 1, textAlign: 'right' }}>
              <Button size="small" onClick={() => go('/wallet')}>
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
