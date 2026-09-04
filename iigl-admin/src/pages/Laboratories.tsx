import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Chip,
  Dialog as MuiDialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
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
  commissionRate,
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
                <TableCell align="right">Rate</TableCell>
                <TableCell>Active</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((l) => (
                <TableRow key={l.id} hover>
                  <TableCell className="mono">{l.empid ?? `#${l.id}`}</TableCell>
                  <TableCell sx={{ whiteSpace: 'normal', minWidth: 140 }}>{l.fullname}</TableCell>
                  <TableCell sx={{ whiteSpace: 'normal', minWidth: 140 }}>
                    {l.owner_name ?? '—'}
                  </TableCell>
                  <TableCell className="mono">{l.mobile}</TableCell>
                  <TableCell>{l.city ?? '—'}</TableCell>
                  <TableCell align="right" className="tabular">
                    {commissionRate(l.commision, l.commission_type)}
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
    </>
  );
}
