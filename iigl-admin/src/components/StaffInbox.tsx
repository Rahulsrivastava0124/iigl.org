import { useEffect } from 'react';
import {
  Box,
  Button,
  Chip,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/AddOutlined';
import DoneIcon from '@mui/icons-material/DoneOutlined';
import UndoIcon from '@mui/icons-material/UndoOutlined';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { useFetch } from '../lib/useFetch';
import { IconAction, Panel, RowActions, StateChip, TableFrame } from './ui';
import { useToast } from './Toast';
import type { Paged } from '../lib/api';

/**
 * What one employee has written to their employer.
 *
 * Messages and requests only — nothing derived. A note is somebody saying
 * "I forgot to punch out on Tuesday" or "I need Friday off", and it sits beside
 * their attendance because that is nearly always what it is about.
 *
 * `resolved_at` is the whole state: unread and unactioned are the same thing to
 * the person who has to act, so there is one control and it means "dealt with".
 */

export interface StaffMessage {
  id: number;
  kind: 'message' | 'request';
  body: string;
  about_date: string | null;
  resolved_at: string | null;
  created_at: string | null;
  from_user: number;
  from_name: string | null;
}

const day = (v: string | null) => String(v ?? '').slice(0, 10);

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
}: {
  from: number;
  conversation?: boolean;
  title?: string;
  onCompose?: () => void;
  onRows?: (rows: StaffMessage[]) => void;
  own?: boolean;
}) {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch<Paged<StaffMessage>>(
    conversation ? '/messages?box=all&per_page=50' : `/messages?from=${from}&per_page=50`,
  );
  const rows = data?.data ?? [];
  // The same rows the calendar beside this marks its days from, handed up so
  // the two cannot show different months of the same list.
  useEffect(() => onRows?.(rows), [data]);
  const open = rows.filter((m) => !m.resolved_at).length;

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
        loading={loading}
        error={error}
        empty={rows.length === 0}
        emptyText={own ? 'You have not written anything yet.' : 'Nothing written yet.'}
      >
        <List dense disablePadding sx={{ maxHeight: 520, overflowY: 'auto' }}>
          {rows.map((m) => (
            <ListItem
              key={m.id}
              divider
              sx={{ alignItems: 'flex-start', gap: 1, opacity: m.resolved_at ? 0.6 : 1 }}
              secondaryAction={
                own ? (
                  // What became of it, rather than a control they cannot use.
                  <StateChip
                    tone={m.resolved_at ? 'settled' : 'waiting'}
                    label={m.resolved_at ? 'Dealt with' : 'Waiting'}
                  />
                ) : (
                  <RowActions>
                    <IconAction
                      label={m.resolved_at ? 'Reopen' : 'Mark dealt with'}
                      icon={m.resolved_at ? UndoIcon : DoneIcon}
                      onClick={() => resolve(m)}
                    />
                  </RowActions>
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
                    <StateChip
                      tone={m.kind === 'request' ? 'waiting' : 'plain'}
                      label={m.kind === 'request' ? 'Request' : 'Message'}
                    />
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
                  <Box component="span" sx={{ whiteSpace: 'pre-wrap', fontSize: 13.5 }}>
                    {m.body}
                  </Box>
                }
                slotProps={{ secondary: { color: 'text.primary' } }}
              />
            </ListItem>
          ))}
        </List>
      </TableFrame>
    </Panel>
  );
}
