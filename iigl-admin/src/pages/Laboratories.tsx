import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Avatar,
  Button,
  Chip,
  Grid,
  Dialog as MuiDialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  Stack,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { fileUrl } from '../lib/config';
import MessageCompose from '../components/MessageCompose';
import MessageIcon from '@mui/icons-material/ForumOutlined';
import { useToast } from '../components/Toast';
import { useFetch } from '../lib/useFetch';
import { usePermissions } from '../lib/permissions';
import { api } from '../lib/api';
import { messageOf, useAuth } from '../lib/auth';
import {
  IconAction,
  Panel,
  RowActions,
  SearchField,
  TableFrame,
  Tile,
  TILE_CELL,
  money,
} from '../components/ui';

/** True when the row's text contains the term. Case-insensitive; blank matches all. */
const hits = (term: string, ...fields: (string | number | null | undefined)[]) => {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f != null && String(f).toLowerCase().includes(q));
};

import type { Lab } from '../lib/api';
import { isSuper } from '../lib/portal';
import ActiveIcon from '@mui/icons-material/ToggleOnOutlined';
import InactiveIcon from '@mui/icons-material/ToggleOffOutlined';
import AddIcon from '@mui/icons-material/AddOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';
import ViewIcon from '@mui/icons-material/VisibilityOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import EarnedIcon from '@mui/icons-material/PercentOutlined';
import PaidIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import DuesIcon from '@mui/icons-material/PendingActionsOutlined';

export default function Laboratories() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { can } = usePermissions();
  const admin = isSuper(user);
  const mayAdd = admin && can('laboratory', 'create');
  const mayEdit = admin && can('laboratory', 'update');
  const mayDelete = admin && can('laboratory', 'delete');
  const { data, loading, error, reload } = useFetch<{ data: Lab[] }>('/users/laboratories');
  const all = data?.data ?? [];
  const [search, setSearch] = useState('');
  const rows = all.filter((l) => hits(search, l.id, l.fullname, l.mobile, l.city));

  /*
    What the network owes, across the rows on screen.

    Summed from the rows rather than asked for separately: the endpoint already
    sends the three figures per laboratory, and a second total computed by the
    server is a second thing that can disagree with the column under it.

    Over the *filtered* rows, so a search narrows the total with the list —
    a strip that keeps saying the network figure while the table shows one
    franchise is answering a question nobody asked.
  */
  const totals = rows.reduce(
    (t, l) => ({
      earned: t.earned + l.commission_accrued,
      paid: t.paid + l.commission_paid,
      due: t.due + l.commission_due,
    }),
    { earned: 0, paid: 0, due: 0 },
  );

  /** Who a message is being written to: empty is "choose in the dialog". */
  const [writing, setWriting] = useState<number[] | null>(null);

  const [deleting, setDeleting] = useState<Lab | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleActive = async (lab: Lab) => {
    try {
      await api.patch(`/users/${lab.id}/active`, { is_active: !lab.is_active });
      toast.ok(`${lab.fullname} ${lab.is_active ? 'deactivated' : 'activated'}.`);
      reload();
    } catch (e) {
      toast.error(messageOf(e));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.del(`/users/${deleting.id}`);
      toast.ok(`Laboratory "${deleting.fullname}" deleted.`);
      setDeleting(null);
      reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/*
        Head office only. A laboratory sees one row — its own — and three cards
        restating it is the same number four times.
      */}
      {admin && (
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid size={TILE_CELL}>
            <Tile
              label="Total commission"
              value={money(totals.earned)}
              note={`${rows.length} ${rows.length === 1 ? 'laboratory' : 'laboratories'}`}
              fill="brand"
              icon={EarnedIcon}
            />
          </Grid>
          <Grid size={TILE_CELL}>
            <Tile
              label="Total received"
              value={money(totals.paid)}
              fill="settled"
              icon={PaidIcon}
            />
          </Grid>
          <Grid size={TILE_CELL}>
            <Tile
              label="Total dues"
              // Amber only while something is outstanding: a warning colour
              // over a zero is a warning nobody reads.
              value={money(totals.due)}
              fill={totals.due > 0 ? 'waiting' : 'settled'}
              icon={DuesIcon}
            />
          </Grid>
        </Grid>
      )}

      <Panel
        title="Laboratories"
        count={admin ? `${rows.length} of ${all.length} in the network` : undefined}
        actions={
          <>
            <SearchField
              placeholder="Name, mobile, city…"
              value={search}
              onChange={setSearch}
            />
            {/* To one franchise or to the whole network: the picker in the
                dialog does both. */}
            <Button startIcon={<MessageIcon />} onClick={() => setWriting([])}>
              Message
            </Button>
            {mayAdd && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => navigate('/laboratories/create')}
              >
                Add Laboratory
              </Button>
            )}
          </>
        }
      >
        <TableFrame loading={loading} error={error} empty={rows.length === 0}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {/*
                  The laboratory's own code is its identifier here, not the
                  row's primary key: LAB0001 is what people write on paper and
                  what `employements.parent_id` points at, and #102 is a number
                  only the database uses.
                */}
                <TableCell>Lab ID</TableCell>
                <TableCell>Lab Name</TableCell>
                <TableCell>Owner Name</TableCell>
                <TableCell>Mobile</TableCell>
                <TableCell>City</TableCell>
                {/*
                  The rate was the same two words on every row — the terms are
                  on the laboratory's own record, and nobody opens this screen
                  to read them. What head office comes here for is who owes it
                  money, which the rate only implies.
                */}
                <TableCell align="right">Dues</TableCell>
                <TableCell>Active</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((l) => (
                <TableRow key={l.id} hover>
                  <TableCell className="mono">{l.empid ?? `#${l.id}`}</TableCell>
                  <TableCell sx={{ whiteSpace: 'normal', minWidth: 180 }}>
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                      {/* The laboratory's logo, or its initial where none was uploaded. */}
                      <Avatar
                        variant="rounded"
                        src={fileUrl(l.company_logo) ?? undefined}
                        alt=""
                        slotProps={{ img: { sx: { objectFit: 'contain' } } }}
                        sx={{ width: 34, height: 34, bgcolor: 'action.hover', color: 'text.secondary', fontSize: 14 }}
                      >
                        {l.fullname.trim().charAt(0).toUpperCase()}
                      </Avatar>
                      <span>{l.fullname}</span>
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'normal', minWidth: 140 }}>
                    {l.owner_name ?? '—'}
                  </TableCell>
                  <TableCell className="mono">{l.mobile}</TableCell>
                  <TableCell>{l.city ?? '—'}</TableCell>
                  <TableCell
                    align="right"
                    className="tabular"
                    // Coloured only when there is something owed: a column of
                    // red where most rows are settled stops meaning anything.
                    sx={{ color: l.commission_due > 0 ? 'error.main' : 'text.secondary', fontWeight: l.commission_due > 0 ? 600 : 400 }}
                  >
                    {l.commission_due > 0 ? money(l.commission_due) : '—'}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={l.is_active ? 'Active' : 'Inactive'}
                      size="small"
                      sx={{
                        bgcolor: l.is_active ? 'success.main' : 'error.main',
                        color: 'common.white',
                        fontWeight: 600,
                        fontSize: 12,
                      }}
                    />
                  </TableCell>
                  <TableCell>
                      <RowActions>
                        <IconAction
                          label="Payments, staff and certificates"
                          icon={ViewIcon}
                          onClick={() => navigate(`/laboratories/${l.id}`)}
                        />
                        <IconAction
                          label="Message"
                          icon={MessageIcon}
                          overflow
                          onClick={() => setWriting([l.id])}
                        />
                        {mayEdit && (
                          <IconAction
                            label="Edit laboratory"
                            icon={EditIcon}
                            onClick={() => navigate(`/laboratories/${l.id}/edit`)}
                          />
                        )}
                        {mayEdit && (
                          <Tooltip title={l.is_active ? 'Deactivate' : 'Activate'}>
                            <IconButton
                              size="small"
                              onClick={() => toggleActive(l)}
                              sx={{
                                color: l.is_active ? 'success.main' : 'error.main',
                                '&:hover': {
                                  bgcolor: l.is_active ? 'success.main' : 'error.main',
                                  color: 'common.white',
                                },
                              }}
                            >
                              {l.is_active ? <ActiveIcon fontSize="small" /> : <InactiveIcon fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                        )}
                        {mayDelete && (
                          <IconAction
                            label="Delete laboratory"
                            icon={DeleteIcon}
                            danger
                            onClick={() => setDeleting(l)}
                          />
                        )}
                      </RowActions>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      </Panel>

      {/* Delete Confirmation Dialog */}
      {deleting && (
        <MuiDialog open onClose={() => setDeleting(null)} maxWidth="xs" fullWidth>
          <DialogTitle
            sx={{
              bgcolor: '#d32f2f',
              color: '#fff',
              fontSize: '1rem',
              fontWeight: 600,
            }}
          >
            Delete Laboratory
          </DialogTitle>
          <DialogContent sx={{ pt: 3, pb: 2 }}>
            <Typography variant="body1" sx={{ mb: 2 }}>
              Are you sure you want to delete <strong>{deleting.fullname}</strong>?
            </Typography>
            <Typography variant="body2" color="text.secondary">
              This action cannot be undone. All data associated with this laboratory will be
              permanently removed.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setDeleting(null)} color="inherit">
              Cancel
            </Button>
            <Button
              variant="contained"
              sx={{ bgcolor: '#d32f2f', '&:hover': { bgcolor: '#b71c1c' } }}
              onClick={confirmDelete}
              disabled={busy}
            >
              {busy ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogActions>
        </MuiDialog>
      )}

      {writing && (
        <MessageCompose audience="laboratories" to={writing} onClose={() => setWriting(null)} />
      )}
    </>
  );
}
