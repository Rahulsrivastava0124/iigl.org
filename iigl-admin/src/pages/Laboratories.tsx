import { useState } from 'react';
import {
  Button,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf, useAuth } from '../lib/auth';
import { Dialog, Notice, PageHead, Panel, TableFrame, YesNo } from '../components/ui';
import type { Lab } from '../lib/api';

export default function Laboratories() {
  const { user } = useAuth();
  const isAdmin = user?.roleId === 1;
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
        subtitle={isAdmin ? `${rows.length} in the network` : 'Your laboratory'}
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
                {isAdmin && <TableCell />}
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
                  {isAdmin && (
                    <TableCell>
                      <Stack direction="row" spacing={0.5}>
                        <Button
                          size="small"
                          onClick={() => {
                            setEditing(l);
                            setRate(String(l.commision ?? 0));
                          }}
                        >
                          Commission
                        </Button>
                        <Button size="small" color="inherit" onClick={() => toggleActive(l)}>
                          {l.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </Stack>
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
