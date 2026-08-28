import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useToast } from '../components/Toast';
import { useFetch } from '../lib/useFetch';
import { usePermissions } from '../lib/permissions';
import { api } from '../lib/api';
import { messageOf, useAuth } from '../lib/auth';
import {
  Dialog,
  IconAction,
  Panel,
  RowActions,
  SearchField,
  TableFrame,
  YesNo,
} from '../components/ui';

/** True when the row's text contains the term. Case-insensitive; blank matches all. */
const hits = (term: string, ...fields: (string | number | null | undefined)[]) => {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f != null && String(f).toLowerCase().includes(q));
};

import type { Lab } from '../lib/api';
import { isAdmin } from '../lib/portal';
import CommissionIcon from '@mui/icons-material/PercentOutlined';
import ActiveIcon from '@mui/icons-material/ToggleOnOutlined';
import InactiveIcon from '@mui/icons-material/ToggleOffOutlined';

export default function Laboratories() {
  const toast = useToast();
  const { user } = useAuth();
  const { can } = usePermissions();
  const admin = isAdmin(user);
  const mayEdit = admin && can('laboratory', 'update');
  const { data, loading, error, reload } = useFetch<{ data: Lab[] }>('/users/laboratories');
  const all = data?.data ?? [];
  const [search, setSearch] = useState('');
  const rows = all.filter((l) => hits(search, l.id, l.fullname, l.mobile, l.city));

  const [editing, setEditing] = useState<Lab | null>(null);
  const [rate, setRate] = useState('');
  const [busy, setBusy] = useState(false);

  const saveRate = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await api.patch(`/admin/laboratories/${editing.id}/commission`, { commision: Number(rate) });
      toast.ok(`Commission for ${editing.fullname} set to ${rate}%.`);
      setEditing(null);
      reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (lab: Lab) => {
    try {
      await api.patch(`/users/${lab.id}/active`, { is_active: !lab.is_active });
      toast.ok(`${lab.fullname} ${lab.is_active ? 'deactivated' : 'activated'}.`);
      reload();
    } catch (e) {
      toast.error(messageOf(e));
    }
  };

  return (
    <>

      <Panel
        title="Laboratories"
        count={admin ? `${rows.length} of ${all.length} in the network` : undefined}
        actions={
          <SearchField
            placeholder="Name, mobile, city…"
            value={search}
            onChange={setSearch}
          />
        }
      >
        <TableFrame loading={loading} error={error} empty={rows.length === 0}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Id</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Mobile</TableCell>
                <TableCell>City</TableCell>
                <TableCell align="right">Commission</TableCell>
                <TableCell>Active</TableCell>
                {mayEdit && <TableCell />}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((l) => (
                <TableRow key={l.id} hover>
                  <TableCell className="mono">#{l.id}</TableCell>
                  <TableCell>{l.fullname}</TableCell>
                  <TableCell className="mono">{l.mobile}</TableCell>
                  <TableCell>{l.city ?? '—'}</TableCell>
                  <TableCell align="right" className="tabular">
                    {l.commision == null ? '—' : `${l.commision}%`}
                  </TableCell>
                  <TableCell>
                    <YesNo on={l.is_active} />
                  </TableCell>
                  {mayEdit && (
                    <TableCell>
                      <RowActions>
                        <IconAction
                          label="Set commission"
                          icon={CommissionIcon}
                          onClick={() => {
                            setEditing(l);
                            setRate(String(l.commision ?? 0));
                          }}
                        />
                        <IconAction
                          label={l.is_active ? 'Deactivate' : 'Activate'}
                          icon={l.is_active ? ActiveIcon : InactiveIcon}
                          danger={Boolean(l.is_active)}
                          onClick={() => toggleActive(l)}
                        />
                      </RowActions>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      </Panel>

      {editing && (
        <Dialog
          title={`Commission — ${editing.fullname}`}
          onClose={() => setEditing(null)}
          onSubmit={saveRate}
          busy={busy}
        >
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The percentage this laboratory owes on what it collects. Commission payments are
            calculated from this rate rather than entered by the laboratory.
          </Typography>
          <TextField
            label="Rate (%)"
            type="number"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            slotProps={{ htmlInput: { min: 0, max: 100, step: 0.01 } }}
            required
          />
        </Dialog>
      )}
    </>
  );
}
