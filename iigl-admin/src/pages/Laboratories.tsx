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
import { useFetch } from '../lib/useFetch';
import { usePermissions } from '../lib/permissions';
import { api } from '../lib/api';
import { messageOf, useAuth } from '../lib/auth';
import { Dialog, IconAction, Notice, PageHead, Panel, RowActions, TableFrame, YesNo } from '../components/ui';
import type { Lab } from '../lib/api';
import { isAdmin } from '../lib/portal';
import CommissionIcon from '@mui/icons-material/PercentOutlined';
import ActiveIcon from '@mui/icons-material/ToggleOnOutlined';
import InactiveIcon from '@mui/icons-material/ToggleOffOutlined';

export default function Laboratories() {
  const { user } = useAuth();
  const { can } = usePermissions();
  const admin = isAdmin(user);
  const mayEdit = admin && can('laboratory', 'update');
  const { data, loading, error, reload } = useFetch<{ data: Lab[] }>('/users/laboratories');
  const rows = data?.data ?? [];

  const [editing, setEditing] = useState<Lab | null>(null);
  const [rate, setRate] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const saveRate = async () => {
    if (!editing) return;
    setBusy(true);
    setErr(null);
    try {
      await api.patch(`/admin/laboratories/${editing.id}/commission`, { commision: Number(rate) });
      setMsg(`Commission for ${editing.fullname} set to ${rate}%.`);
      setEditing(null);
      reload();
    } catch (e) {
      setErr(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (lab: Lab) => {
    setErr(null);
    try {
      await api.patch(`/users/${lab.id}/active`, { is_active: !lab.is_active });
      setMsg(`${lab.fullname} ${lab.is_active ? 'deactivated' : 'activated'}.`);
      reload();
    } catch (e) {
      setErr(messageOf(e));
    }
  };

  return (
    <>
      <PageHead
        title="Laboratories"
        subtitle={admin ? `${rows.length} in the network` : 'Your laboratory'}
      />

      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="error">{err}</Notice>}

      <Panel>
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
