import { useState } from 'react';
import {
  Button,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useToast } from '../components/Toast';
import { useFetch, useDebounced } from '../lib/useFetch';
import { usePermissions } from '../lib/permissions';
import { api } from '../lib/api';
import { messageOf, useAuth } from '../lib/auth';
import {
  Dialog,
  FormPanel,
  IconAction,
  Pager,
  Panel,
  PasswordField,
  RowActions,
  SearchField,
  TableFrame,
  YesNo,
} from '../components/ui';
import type { Lab, Paged } from '../lib/api';
import { isAdmin } from '../lib/portal';
import AddIcon from '@mui/icons-material/AddOutlined';
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

const BLANK_ACCOUNT = {
  open: false,
  id: undefined as number | undefined,
  fullname: '',
  mobile: '',
  email: '',
  password: '',
  role_id: '3',
};

export default function Staff() {
  const toast = useToast();
  const { user } = useAuth();
  const { can } = usePermissions();
  const admin = isAdmin(user);
  const mayAdd = admin && can('employee_management', 'create');
  const mayEdit = admin && can('employee_management', 'update');
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState('');
  const term = useDebounced(search);

  const query = new URLSearchParams({ page: String(page), per_page: '25' });
  if (term.trim()) query.set('q', term.trim());

  const { data, loading, error, reload } = useFetch<Paged<StaffRow>>(`/users/staff?${query}`);
  const roles = useFetch<{ data: Role[] }>('/users/roles');
  const rows = data?.data ?? [];
  const roleName = (id: number) =>
    roles.data?.data.find((r) => r.id === id)?.role_name ?? `role ${id}`;

  const labs = useFetch<{ data: Lab[] }>(admin ? '/users/laboratories' : null);

  /**
   * One form for both jobs, on the page rather than in a dialog. `id` is what
   * separates them, and it decides which fields matter: a new account needs a
   * password and cannot have an email yet, an existing one is the other way
   * round — its password is changed through Reset, which is a different act
   * with a different warning.
   */
  const [form, setForm] = useState(BLANK_ACCOUNT);
  const clearForm = () => setForm(BLANK_ACCOUNT);

  /** Resetting a password or moving an employment: actions, not record forms. */
  const [resetting, setResetting] = useState<StaffRow | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [employing, setEmploying] = useState<StaffRow | null>(null);
  const [labId, setLabId] = useState('');
  const [busy, setBusy] = useState(false);

  const saveAccount = async () => {
    setBusy(true);
    try {
      if (form.id) {
        await api.patch(`/users/${form.id}`, {
          fullname: form.fullname,
          mobile: form.mobile,
          email: form.email,
          role_id: Number(form.role_id),
        });
        toast.ok(`${form.fullname} updated.`);
      } else {
        await api.post('/users', {
          fullname: form.fullname,
          mobile: form.mobile,
          password: form.password,
          role_id: Number(form.role_id),
        });
        toast.ok(`${form.fullname} added. They can sign in with their mobile number.`);
      }
      clearForm();
      reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!resetting) return;
    setBusy(true);
    try {
      await api.post(`/users/${resetting.id}/password`, { password: newPassword });
      toast.ok(`Password reset for ${resetting.fullname}. Tell them through a separate channel.`);
      setResetting(null);
      setNewPassword('');
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const move = async () => {
    if (!employing) return;
    setBusy(true);
    try {
      // Ending first, because the API refuses a second active employment.
      await api.post(`/users/${employing.id}/employment/end`, {}).catch(() => undefined);
      await api.post(`/users/${employing.id}/employment`, { lab_id: Number(labId) });
      toast.ok(`${employing.fullname} moved.`);
      setEmploying(null);
      reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const endEmployment = async (row: StaffRow) => {
    try {
      await api.post(`/users/${row.id}/employment/end`, {});
      toast.ok(`${row.fullname} is no longer employed.`);
      reload();
    } catch (e) {
      toast.error(messageOf(e));
    }
  };

  const labName = (id: number) =>
    labs.data?.data.find((l) => l.id === id)?.fullname ?? `#${id}`;

  return (
    <>

      {form.open && (
        <FormPanel
          title={form.id ? 'Edit account' : 'Add account'}
          onClose={clearForm}
          onSubmit={saveAccount}
          submitLabel={form.id ? 'Save changes' : 'Add account'}
          busy={busy}
        >
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
          {form.id ? (
            <TextField
              label="Email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          ) : (
            <PasswordField
              label="Password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              slotProps={{ htmlInput: { minLength: 8 } }}
              required
            />
          )}
          <TextField
            select
            label="Role"
            value={form.role_id}
            onChange={(e) => setForm({ ...form, role_id: e.target.value })}
          >
            {(roles.data?.data ?? []).map((r) => (
              <MenuItem key={r.id} value={String(r.id)}>
                {r.role_name}
              </MenuItem>
            ))}
          </TextField>
        </FormPanel>
      )}

      <Panel
        footer={<Pager meta={data?.meta} onPage={setPage} />}
        title="Staff"
        count={data ? `${data.meta.total.toLocaleString()} currently working` : 'Loading…'}
        actions={
          <>
            <SearchField
              placeholder="Name, mobile, email…"
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
            />
            {mayAdd && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setForm({ ...BLANK_ACCOUNT, open: true })}
              >
                Add account
              </Button>
            )}
          </>
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
                          onClick={() =>
                            setForm({
                              open: true,
                              id: s.id,
                              fullname: s.fullname,
                              mobile: s.mobile,
                              email: '',
                              password: '',
                              role_id: String(s.role_id),
                            })
                          }
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
      </Panel>


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
          <PasswordField
            label="New password"
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