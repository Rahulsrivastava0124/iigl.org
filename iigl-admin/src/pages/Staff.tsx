import { useState } from 'react';
import {
  Button,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/AddOutlined';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf, useAuth } from '../lib/auth';
import { Dialog, Notice, PageHead, Pager, Panel, TableFrame, YesNo } from '../components/ui';
import type { Paged } from '../lib/api';

interface StaffRow {
  id: number;
  fullname: string;
  mobile: string;
  role_id: number;
  is_active: number;
  lab_id: number;
  joining_date: string;
}

interface Role {
  id: number;
  role_name: string;
}

export default function Staff() {
  const { user } = useAuth();
  const isAdmin = user?.roleId === 1;
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useFetch<Paged<StaffRow>>(
    `/users/staff?page=${page}&per_page=25`,
  );
  const roles = useFetch<{ data: Role[] }>('/users/roles');
  const rows = data?.data ?? [];
  const roleName = (id: number) =>
    roles.data?.data.find((r) => r.id === id)?.role_name ?? `role ${id}`;

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ fullname: '', mobile: '', password: '', role_id: '3' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.post('/users', { ...form, role_id: Number(form.role_id) });
      setMsg(`${form.fullname} added. They can sign in with their mobile number.`);
      setAdding(false);
      setForm({ fullname: '', mobile: '', password: '', role_id: '3' });
      reload();
    } catch (e) {
      setErr(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead
        title="Staff"
        subtitle={data ? `${data.meta.total.toLocaleString()} currently working` : 'Loading…'}
        action={
          isAdmin && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
              Add account
            </Button>
          )
        }
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
                <TableCell>Role</TableCell>
                <TableCell>Laboratory</TableCell>
                <TableCell>Joined</TableCell>
                <TableCell>Active</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id} hover>
                  <TableCell className="mono">#{s.id}</TableCell>
                  <TableCell>{s.fullname}</TableCell>
                  <TableCell className="mono">{s.mobile}</TableCell>
                  <TableCell>{roleName(s.role_id)}</TableCell>
                  <TableCell className="mono">#{s.lab_id}</TableCell>
                  <TableCell>{s.joining_date}</TableCell>
                  <TableCell>
                    <YesNo on={s.is_active} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
        <Pager meta={data?.meta} onPage={setPage} />
      </Panel>

      {adding && (
        <Dialog title="Add account" onClose={() => setAdding(false)} onSubmit={create} busy={busy}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Creating the account does not attach it to a laboratory. That link lives in the
            employments record and is not yet editable here.
          </Typography>
          <Stack spacing={2}>
            <TextField
              label="Full name"
              value={form.fullname}
              onChange={(e) => setForm({ ...form, fullname: e.target.value })}
              required
            />
            <TextField
              label="Mobile number"
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value })}
              required
            />
            <TextField
              label="Password"
              type="password"
              helperText="Eight characters or more."
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              slotProps={{ htmlInput: { minLength: 8 } }}
              required
            />
            <TextField
              select
              label="Role"
              value={form.role_id}
              onChange={(e) => setForm({ ...form, role_id: e.target.value })}
            >
              {(roles.data?.data ?? []).map((r) => (
                <MenuItem key={r.id} value={r.id}>
                  {r.role_name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </Dialog>
      )}
    </>
  );
}
