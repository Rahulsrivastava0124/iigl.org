import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Avatar,
  Box,
  Button,
  CircularProgress,
  Grid,
  Stack,
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
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { ConfirmDialog, Notice, Panel, TableFrame } from '../components/ui';
import PermissionGrid, { cleared } from '../components/PermissionGrid';
import { countOf, type Permission } from '../lib/permissionMenu';

import SaveIcon from '@mui/icons-material/SaveOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';

interface Role {
  id: number;
  role_name: string;
  description: string | null;
  owner_id: number | null;
  is_system: boolean;
  mine: boolean;
  users: number;
}

interface RoleUser {
  id: number;
  fullname: string;
  mobile: string;
  email: string | null;
  profile_photo: string | null;
  is_active: number;
}

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

export default function RoleEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const roles = useFetch<{ data: Role[] }>('/roles');
  const role = (roles.data?.data ?? []).find((r) => String(r.id) === id);

  const users = useFetch<{ data: RoleUser[] }>(id ? `/roles/${id}/users` : null);
  const permissions = useFetch<{ data: Permission[] }>(id ? `/roles/${id}/permissions` : null);

  const [form, setForm] = useState<{ name: string; description: string } | null>(null);
  /**
   * The grants, held here until Save.
   *
   * Every checkbox used to write immediately, which meant a half-finished set
   * of grants was already live and there was nothing to press when you were
   * done. They are staged now, and saved with the name.
   */
  const [rows, setRows] = useState<Permission[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Which permission groups are expanded, by title. */
  const [open, setOpen] = useState<Record<string, boolean>>({});


  // Initialize from what loaded.
  if (role && !form) {
    setForm({ name: role.role_name, description: role.description ?? '' });
  }
  if (permissions.data && !rows) {
    setRows(permissions.data.data);
  }

  const saveRole = async () => {
    if (!form || !id) return;
    setBusy(true);
    try {
      await api.patch(`/roles/${id}`, { name: form.name, description: form.description });
      // One request per action type: the API replaces all four flags for one
      // action at a time, and there is no bulk endpoint to replace them with.
      for (const r of rows ?? []) {
        await api.put(`/roles/${id}/permissions`, {
          action_type: r.action_type,
          view: r.view,
          create: r.create,
          update: r.update,
          delete: r.delete,
        });
      }
      toast.ok('Role updated.');
      roles.reload();
      permissions.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const deleteRole = async () => {
    if (!id || !role) return;
    setBusy(true);
    try {
      await api.del(`/roles/${id}`);
      toast.ok(`${role.role_name} deleted.`);
      setConfirmDelete(false);
      navigate('/roles');
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const userList = users.data?.data ?? [];

  if (roles.loading) {
    return <Typography>Loading…</Typography>;
  }

  if (!role) {
    return <Notice kind="error">Role not found.</Notice>;
  }

  // Built-in roles (id <= 2) cannot be edited
  if (role.id <= 2) {
    navigate('/roles');
    return null;
  }

  return (
    <>
      {/* Role Details */}
      <Panel title="Role Details">
        <Box component="form" onSubmit={(e: React.FormEvent) => { e.preventDefault(); saveRole(); }} sx={{ p: 2 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                label="Role Name"
                value={form?.name ?? ''}
                onChange={(e) => setForm({ ...form!, name: e.target.value })}
                required
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                label="Description"
                value={form?.description ?? ''}
                onChange={(e) => setForm({ ...form!, description: e.target.value })}
              />
            </Grid>
          </Grid>
        </Box>
      </Panel>

      {/* Users with this role */}
      <Panel
        title="Users"
        count={users.loading ? 'Loading…' : `${userList.length} user(s)`}
        sx={{ mt: 2 }}
      >
        <TableFrame loading={users.loading} error={users.error} empty={userList.length === 0}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Photo</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Mobile</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {userList.map((u) => (
                <TableRow key={u.id} hover>
                  <TableCell>
                    <Avatar
                      src={u.profile_photo || undefined}
                      sx={{ width: 36, height: 36, fontSize: 14, bgcolor: 'primary.main' }}
                    >
                      {getInitials(u.fullname)}
                    </Avatar>
                  </TableCell>
                  <TableCell>{u.fullname}</TableCell>
                  <TableCell className="mono">{u.mobile}</TableCell>
                  <TableCell>{u.email || '—'}</TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      sx={{ color: u.is_active ? 'success.main' : 'error.main' }}
                    >
                      {u.is_active ? 'Active' : 'Inactive'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
        {userList.length === 0 && (
          <Notice kind="info" sx={{ m: 2 }}>
            No users have this role. You can delete this role.
          </Notice>
        )}
      </Panel>

      <Panel
        title="Permissions"
        count={
          permissions.loading
            ? 'Loading…'
            : `${countOf(rows ?? []).granted} of ${countOf(rows ?? []).total} granted`
        }
        actions={
          <Button color="error" onClick={() => rows && setRows(cleared(rows))} disabled={!rows}>
            Clear all
          </Button>
        }
        sx={{ mt: 2 }}
      >
        <Box sx={{ p: 2 }}>
          {!rows ? (
            <Stack sx={{ alignItems: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Stack>
          ) : (
            <PermissionGrid
              rows={rows}
              onChange={setRows}
              open={open}
              onToggleGroup={(title) => setOpen({ ...open, [title]: !open[title] })}
              disabled={busy}
            />
          )}
        </Box>
      </Panel>

      {/*
        One save for the whole page, at the bottom of it. Saving lives here
        rather than under the name field because the grants are what most edits
        change, and a button above them is one you have to scroll back up to.
      */}
      <Stack
        direction="row"
        spacing={2}
        sx={{ mt: 2, justifyContent: 'flex-end', alignItems: 'center' }}
      >
        {userList.length === 0 && (
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => setConfirmDelete(true)}
            disabled={busy}
          >
            Delete role
          </Button>
        )}
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={saveRole}
          disabled={busy || !rows}
        >
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
      </Stack>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete Role"
        message={<>Are you sure you want to delete <strong>{role?.role_name}</strong>?</>}
        warning="This action cannot be undone."
        onClose={() => setConfirmDelete(false)}
        onConfirm={deleteRole}
        confirmLabel="Delete"
        confirmIcon={DeleteIcon}
        busy={busy}
      />
    </>
  );
}
