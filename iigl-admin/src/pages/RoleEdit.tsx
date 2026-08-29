import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Avatar,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Collapse,
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
import {
  ConfirmDialog,
  IconAction,
  Notice,
  Panel,
  TableFrame,
} from '../components/ui';

import SaveIcon from '@mui/icons-material/SaveOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import CollapseIcon from '@mui/icons-material/ExpandLessOutlined';
import ExpandIcon from '@mui/icons-material/ExpandMoreOutlined';

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

interface Permission {
  action_type: string;
  view: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}

interface Action {
  name: string;
  label: string;
  description: string | null;
  is_system: boolean;
  enforced: boolean;
}

type Ability = 'view' | 'create' | 'update' | 'delete';
const ABILITIES: Ability[] = ['view', 'create', 'update', 'delete'];

/** Permission categories for organized display */
const CATEGORIES: Record<string, { label: string; actions: string[] }> = {
  orders: {
    label: 'Orders & Reports',
    actions: ['product_collection', 'report'],
  },
  accounts: {
    label: 'Accounts & Customers',
    actions: ['account', 'customer'],
  },
  staff: {
    label: 'Staff Management',
    actions: ['laboratory', 'employee_management', 'admin_employee', 'visitor_book'],
  },
  website: {
    label: 'Website',
    actions: ['website_home', 'website_blog', 'website_contact', 'website_enquiry', 'website_education', 'website_report'],
  },
};

const LABELS: Record<string, string> = {
  product_collection: 'Order Intake',
  report: 'Certificates',
  account: 'Accounts & Ledger',
  customer: 'Customers',
  laboratory: 'Laboratories',
  employee_management: 'Staff',
  admin_employee: 'Staff Administration',
  visitor_book: 'Visitor Book',
  website_home: 'Home Page',
  website_blog: 'Articles',
  website_contact: 'Contact',
  website_enquiry: 'Enquiries',
  website_education: 'Education',
  website_report: 'Certificate Lookup',
};

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
  const actions = useFetch<{ data: Action[] }>('/roles/actions');

  const [form, setForm] = useState<{ name: string; description: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  /**
   * Which permission groups are open.
   *
   * Every group starts open — a permission screen that hides what is granted
   * until you go looking is worse than a long one — and a group you close stays
   * closed while you are on the page. `Collapse all` is there for when you know
   * which group you want.
   */
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const isOpen = (category: string) => !closed[category];
  const toggleGroup = (category: string) =>
    setClosed((c) => ({ ...c, [category]: !c[category] }));

  const [saving, setSaving] = useState<string | null>(null);

  // Initialize form when role loads
  if (role && !form) {
    setForm({ name: role.role_name, description: role.description ?? '' });
  }

  const saveRole = async () => {
    if (!form || !id) return;
    setBusy(true);
    try {
      await api.patch(`/roles/${id}`, { name: form.name, description: form.description });
      toast.ok('Role updated.');
      roles.reload();
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

  const toggle = async (permission: Permission, ability: Ability) => {
    const next = { ...permission, [ability]: !permission[ability] };
    setSaving(`${permission.action_type}:${ability}`);
    try {
      await api.put(`/roles/${id}/permissions`, {
        action_type: permission.action_type,
        view: next.view,
        create: next.create,
        update: next.update,
        delete: next.delete,
      });
      permissions.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setSaving(null);
    }
  };

  const rows = permissions.data?.data ?? [];
  const userList = users.data?.data ?? [];

  // Group permissions by category
  const getPermissionsByCategory = () => {
    const result: { category: string; label: string; perms: Permission[] }[] = [];
    const usedActions = new Set<string>();

    for (const [key, cat] of Object.entries(CATEGORIES)) {
      const perms = rows.filter((p) => cat.actions.includes(p.action_type));
      if (perms.length > 0) {
        result.push({ category: key, label: cat.label, perms });
        perms.forEach((p) => usedActions.add(p.action_type));
      }
    }

    // Add uncategorized permissions
    const other = rows.filter((p) => !usedActions.has(p.action_type));
    if (other.length > 0) {
      result.push({ category: 'other', label: 'Other', perms: other });
    }

    return result;
  };

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
          <Box sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider', display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            {userList.length === 0 && (
              <Button
                variant="outlined"
                color="error"
                size="small"
                startIcon={<DeleteIcon />}
                onClick={() => setConfirmDelete(true)}
              >
                Delete Role
              </Button>
            )}
            <Button
              variant="contained"
              type="submit"
              startIcon={<SaveIcon />}
              disabled={busy}
            >
              {busy ? 'Saving…' : 'Save Changes'}
            </Button>
          </Box>
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

      {/* Permissions by Category */}
      <Stack
        direction="row"
        spacing={1}
        sx={{ mt: 3, mb: 2, alignItems: 'center', justifyContent: 'space-between' }}
      >
        <Typography variant="h6">Permissions</Typography>
        <Button
          size="small"
          onClick={() => {
            const groups = getPermissionsByCategory();
            const anyOpen = groups.some((g) => isOpen(g.category));
            setClosed(
              anyOpen ? Object.fromEntries(groups.map((g) => [g.category, true])) : {},
            );
          }}
        >
          {getPermissionsByCategory().some((g) => isOpen(g.category))
            ? 'Collapse all'
            : 'Expand all'}
        </Button>
      </Stack>

      {getPermissionsByCategory().map(({ category, label, perms }) => {
        // How much of this group is granted, so a closed group still says
        // whether there is anything inside it.
        const granted = perms.filter((p) => ABILITIES.some((a) => p[a])).length;

        return (
        <Panel
          key={category}
          sx={{ mb: 2 }}
          title={label}
          actions={
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                {granted} of {perms.length} granted
              </Typography>
              <IconAction
                label={isOpen(category) ? `Collapse ${label}` : `Expand ${label}`}
                icon={isOpen(category) ? CollapseIcon : ExpandIcon}
                onClick={() => toggleGroup(category)}
              />
            </Stack>
          }
        >
          <Collapse in={isOpen(category)} timeout="auto" unmountOnExit>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Permission</TableCell>
                {ABILITIES.map((a) => (
                  <TableCell key={a} align="center" sx={{ width: 80 }}>
                    {a.charAt(0).toUpperCase() + a.slice(1)}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {perms.map((p) => {
                const known = (actions.data?.data ?? []).find((a) => a.name === p.action_type);
                return (
                  <TableRow key={p.action_type} hover>
                    <TableCell>
                      {LABELS[p.action_type] || known?.label || p.action_type}
                    </TableCell>
                    {ABILITIES.map((a) => {
                      const key = `${p.action_type}:${a}`;
                      return (
                        <TableCell key={a} align="center">
                          {saving === key ? (
                            <CircularProgress size={16} />
                          ) : (
                            <Checkbox
                              size="small"
                              checked={p[a]}
                              onChange={() => toggle(p, a)}
                              disabled={Boolean(saving)}
                            />
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </Collapse>
        </Panel>
        );
      })}

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
