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
import { usePermissions } from '../lib/permissions';
import { api } from '../lib/api';
import { messageOf, useAuth } from '../lib/auth';
import { Dialog, IconAction, Notice, Pager, Panel, RowActions, TableFrame, YesNo } from '../components/ui';
import type { Lab, Paged } from '../lib/api';
import { isAdmin } from '../lib/portal';
import EditIcon from '@mui/icons-material/EditOutlined';
import MoveIcon from '@mui/icons-material/SwapHorizOutlined';
import PasswordIcon from '@mui/icons-material/LockResetOutlined';
import EndIcon from '@mui/icons-material/PersonRemoveOutlined';

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
  const { can } = usePermissions();
  const admin = isAdmin(user);
  const mayAdd = admin && can('employee_management', 'create');
  const mayEdit = admin && can('employee_management', 'update');
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useFetch<Paged<StaffRow>>(
    `/users/staff?page=${page}&per_page=25`,
  );
  const roles = useFetch<{ data: Role[] }>('/users/roles');
  const rows = data?.data ?? [];
  const roleName = (id: number) =>
    roles.data?.data.find((r) => r.id === id)?.role_name ?? `role ${id}`;

  const labs = useFetch<{ data: Lab[] }>(admin ? '/users/laboratories' : null);

  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ fullname: '', mobile: '', password: '', role_id: '3' });

  /** Editing an account, resetting a password, or moving an employment. */
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [edit, setEdit] = useState({ fullname: '', mobile: '', email: '', role_id: '3' });
  const [resetting, setResetting] = useState<StaffRow | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [employing, setEmploying] = useState<StaffRow | null>(null);
  const [labId, setLabId] = useState('');
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

  const saveAccount = async () => {
    if (!editing) return;
    setBusy(true);
    setErr(null);
    try {
      await api.patch(`/users/${editing.id}`, { ...edit, role_id: Number(edit.role_id) });
      setMsg(`${edit.fullname} updated.`);
      setEditing(null);
      reload();
    } catch (e) {
      setErr(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!resetting) return;
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/users/${resetting.id}/password`, { password: newPassword });
      setMsg(`Password reset for ${resetting.fullname}. Tell them through a separate channel.`);
      setResetting(null);
      setNewPassword('');
    } catch (e) {
      setErr(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const move = async () => {
    if (!employing) return;
    setBusy(true);
    setErr(null);
    try {
      // Ending first, because the API refuses a second active employment.
      await api.post(`/users/${employing.id}/employment/end`, {}).catch(() => undefined);
      await api.post(`/users/${employing.id}/employment`, { lab_id: Number(labId) });
      setMsg(`${employing.fullname} moved.`);
      setEmploying(null);
      reload();
    } catch (e) {
      setErr(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const endEmployment = async (row: StaffRow) => {
    setErr(null);
    try {
      await api.post(`/users/${row.id}/employment/end`, {});
      setMsg(`${row.fullname} is no longer employed.`);
      reload();
    } catch (e) {
      setErr(messageOf(e));
    }
  };

  const labName = (id: number) =>
    labs.data?.data.find((l) => l.id === id)?.fullname ?? `#${id}`;

  return (
    <>
      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="error">{err}</Notice>}

      <Panel
        title="Staff"
        count={data ? `${data.meta.total.toLocaleString()} currently working` : 'Loading…'}
        actions={
          mayAdd && (
            <Button
              size="small"
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setAdding(true)}
            >
              Add account
            </Button>
          )
        }
      >
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
                {mayEdit && <TableCell />}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id} hover>
                  <TableCell className="mono">#{s.id}</TableCell>
                  <TableCell>{s.fullname}</TableCell>
                  <TableCell className="mono">{s.mobile}</TableCell>
                  <TableCell>{roleName(s.role_id)}</TableCell>
                  <TableCell>{admin ? labName(s.lab_id) : `#${s.lab_id}`}</TableCell>
                  <TableCell>{s.joining_date}</TableCell>
                  <TableCell>
                    <YesNo on={s.is_active} />
                  </TableCell>
                  {mayEdit && (
                    <TableCell>
                      <RowActions>
                        <IconAction
                          label="Edit employee"
                          icon={EditIcon}
                          onClick={() => {
                            setEditing(s);
                            setEdit({
                              fullname: s.fullname,
                              mobile: s.mobile,
                              email: '',
                              role_id: String(s.role_id),
                            });
                          }}
                        />
                        <IconAction
                          label="Move to another laboratory"
                          icon={MoveIcon}
                          onClick={() => {
                            setEmploying(s);
                            setLabId(String(s.lab_id));
                          }}
                        />
                        <IconAction
                          label="Reset password"
                          icon={PasswordIcon}
                          onClick={() => setResetting(s)}
                        />
                        <IconAction
                          label="End employment"
                          icon={EndIcon}
                          danger
                          onClick={() => endEmployment(s)}
                        />
                      </RowActions>
                    </TableCell>
                  )}
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

      {editing && (
        <Dialog
          title={`Edit ${editing.fullname}`}
          onClose={() => setEditing(null)}
          onSubmit={saveAccount}
          busy={busy}
        >
          <Stack spacing={2}>
            <TextField
              label="Full name"
              value={edit.fullname}
              onChange={(e) => setEdit({ ...edit, fullname: e.target.value })}
              required
            />
            <TextField
              label="Mobile number"
              value={edit.mobile}
              onChange={(e) => setEdit({ ...edit, mobile: e.target.value })}
              helperText="This is how they sign in. Two accounts on one number locks one of them out."
              required
            />
            <TextField
              label="Email"
              value={edit.email}
              onChange={(e) => setEdit({ ...edit, email: e.target.value })}
            />
            <TextField
              select
              label="Role"
              value={edit.role_id}
              onChange={(e) => setEdit({ ...edit, role_id: e.target.value })}
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

      {resetting && (
        <Dialog
          title={`Reset password — ${resetting.fullname}`}
          onClose={() => {
            setResetting(null);
            setNewPassword('');
          }}
          onSubmit={resetPassword}
          submitLabel="Reset"
          busy={busy}
        >
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            They are not told automatically. Pass the new password on through a separate channel,
            and ask them to change it once they are in.
          </Typography>
          <TextField
            label="New password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            helperText="Eight characters or more."
            slotProps={{ htmlInput: { minLength: 8 } }}
            required
          />
        </Dialog>
      )}

      {employing && (
        <Dialog
          title={`Move ${employing.fullname}`}
          onClose={() => setEmploying(null)}
          onSubmit={move}
          submitLabel="Move"
          busy={busy}
        >
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The current employment is ended and a new one started, so the history is kept rather
            than overwritten.
          </Typography>
          <TextField
            select
            label="Laboratory"
            value={labId}
            onChange={(e) => setLabId(e.target.value)}
            required
          >
            {(labs.data?.data ?? []).map((l) => (
              <MenuItem key={l.id} value={l.id}>
                {l.fullname}
              </MenuItem>
            ))}
          </TextField>
        </Dialog>
      )}
    </>
  );
}