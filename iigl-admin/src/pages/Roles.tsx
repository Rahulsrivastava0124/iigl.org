import { useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog as MuiDialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useToast } from '../components/Toast';
import { useAuth } from '../lib/auth';
import { isSuper, ROLE } from '../lib/portal';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import {
  FormPanel,
  IconAction,
  Notice,
  Panel,
  RowActions,
  SearchField,
  TableFrame,
} from '../components/ui';

/** True when the row's text contains the term. Case-insensitive; blank matches all. */
const hits = (term: string, ...fields: (string | number | null | undefined)[]) => {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f != null && String(f).toLowerCase().includes(q));
};

import AddIcon from '@mui/icons-material/AddOutlined';
import PermissionsIcon from '@mui/icons-material/KeyOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlineOutlined';
import CloseIcon from '@mui/icons-material/CloseOutlined';

interface Role {
  id: number;
  role_name: string;
  description: string | null;
  /** Null for a head-office role; a laboratory id for one it created. */
  owner_id: number | null;
  /** One of the five that shipped: grantable, never renamed or deleted. */
  is_system: boolean;
  /** Created by the laboratory signed in. */
  mine: boolean;
  /** How many people hold it. */
  users: number;
}

/** A permission that can be granted, from `permission_actions`. */
interface Action {
  name: string;
  label: string;
  description: string | null;
  is_system: boolean;
  /** False when nothing in the API reads this name yet. */
  enforced: boolean;
}

interface Permission {
  action_type: string;
  view: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}

type Ability = 'view' | 'create' | 'update' | 'delete';
const ABILITIES: Ability[] = ['view', 'create', 'update', 'delete'];

/**
 * Plain-English names for the action types. The stored values are terse and
 * inconsistent — `product_collection` is order intake, `admin_employee` is
 * staff administration — so nobody should have to infer what a row governs
 * from a column value.
 */
const LABELS: Record<string, { name: string; note?: string }> = {
  product_collection: {
    name: 'Order intake',
    note: 'Without view and create, a person sees only the orders they took or were assigned — not the laboratory queue.',
  },
  report: { name: 'Certificates' },
  account: { name: 'Accounts and ledger' },
  customer: { name: 'Customers' },
  laboratory: { name: 'Laboratories' },
  employee_management: { name: 'Staff' },
  admin_employee: { name: 'Staff administration' },
  visitor_book: { name: 'Visitor book' },
  website_home: { name: 'Website — home' },
  website_blog: { name: 'Website — articles' },
  website_contact: { name: 'Website — contact' },
  website_enquiry: { name: 'Website — enquiries' },
  website_education: { name: 'Website — education' },
  website_report: { name: 'Website — certificate lookup' },
};

const labelFor = (action: string, known?: Action) =>
  LABELS[action] ??
  (known
    ? { name: known.label, note: known.description ?? undefined }
    : { name: action.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) });

/**
 * Only super admin (#1) and laboratory (#2) are truly built-in.
 * All other roles (team variants, custom roles) can be edited/deleted.
 */
const isBuiltIn = (r: Role) => r.id <= 2;

export default function Roles() {
  const toast = useToast();
  const { user } = useAuth();
  const roles = useFetch<{ data: Role[] }>('/roles');
  const actions = useFetch<{ data: Action[] }>('/roles/actions');
  const list = roles.data?.data ?? [];
  // `list` itself stays whole: it resolves the selected role and drives the
  // permission matrix below, neither of which a search of the table should touch.
  const [search, setSearch] = useState('');
  // Show only head office roles: filter out super admin (#1) and lab-owned roles
  const shown = list.filter(
    (r) => r.id !== ROLE.SUPER && r.owner_id === null && hits(search, r.id, r.role_name),
  );

  const [roleId, setRoleId] = useState<string>('');
  const chosen = roleId || (list.find((r) => !isBuiltIn(r))?.id ?? list[0]?.id ?? '');
  const role = list.find((r) => String(r.id) === String(chosen));

  const permissions = useFetch<{ data: Permission[] }>(
    chosen ? `/roles/${chosen}/permissions` : null,
  );

  const [saving, setSaving] = useState<string | null>(null);

  // No `open`: the form is a panel on the page, empty to add and filled to
  // rename, with `id` the only thing telling the two apart.
  const [form, setForm] = useState<{
    open: boolean;
    id?: number;
    name: string;
    description: string;
  }>({ open: false, name: '', description: '' });

  const [busy, setBusy] = useState(false);

  /**
   * One toggle sends the whole row: the API replaces all four flags for that
   * action type, so sending a single changed flag would clear the other three.
   */
  const toggle = async (permission: Permission, ability: Ability) => {
    const next = { ...permission, [ability]: !permission[ability] };
    setSaving(`${permission.action_type}:${ability}`);
    try {
      await api.put(`/roles/${chosen}/permissions`, {
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

  const saveRole = async () => {
    setBusy(true);
    try {
      if (form.id) {
        await api.patch(`/roles/${form.id}`, { name: form.name, description: form.description });
        toast.ok('Role renamed.');
      } else {
        await api.post('/roles', { name: form.name, description: form.description });
        toast.ok(`${form.name} added. It starts with no permissions — grant them before anyone signs in.`);
      }
      setForm({ open: false, name: '', description: '' });
      roles.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const removeRole = async (r: Role) => {
    try {
      await api.del(`/roles/${r.id}`);
      toast.ok(`${r.role_name} deleted.`);
      roles.reload();
    } catch (e) {
      toast.error(messageOf(e));
    }
  };

  /**
   * The three the system is built on. Everything branches on these numbers —
   * which door admits whom, which menu is drawn, which scope a query takes — so
   * they can be renamed but never deleted. The API refuses them too; this is so
   * the control says why before it is pressed.
   */
  const ESSENTIAL = [ROLE.SUPER, ROLE.ADMIN, ROLE.TEAM] as number[];

  /** A name is a label — head office may rename any role, a laboratory its own. */
  const mayRename = (r: Role) => isSuper(user) || r.mine;

  /** Why delete is unavailable, or "Delete role" when it is. */
  const deleteReason = (r: Role) =>
    ESSENTIAL.includes(r.id)
      ? 'One of the three roles the system is built on'
      : !mayRename(r)
        ? 'A shared role — ask head office'
        : r.users > 0
          ? `${r.users} ${r.users === 1 ? 'person holds' : 'people hold'} this role`
          : 'Delete role';

  const rows = permissions.data?.data ?? [];
  const granted = rows.filter((p) => ABILITIES.some((a) => p[a])).length;

  return (
    <>

      {form.open && (
        <FormPanel
          title={form.id ? 'Rename role' : 'Add role'}
          onClose={() => setForm({ open: false, name: '', description: '' })}
          onSubmit={saveRole}
          submitLabel={form.id ? 'Save changes' : 'Add role'}
          busy={busy}
        >
          <TextField
            label="Role name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <TextField
            label="What it is for"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            helperText={
              isSuper(user)
                ? 'A head office role: every laboratory can put somebody in it.'
                : 'Your laboratory\'s own role. No other laboratory sees it.'
            }
          />
        </FormPanel>
      )}

      <Panel
        title="Roles"
        count={roles.loading ? 'Loading…' : `${shown.length} roles`}
        actions={
          <>
            <SearchField placeholder="Role name…" value={search} onChange={setSearch} width={200} />
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setForm({ open: true, name: '', description: '' })}
            >
              Add role
            </Button>
          </>
        }
      >
        <TableFrame loading={roles.loading} error={roles.error} empty={shown.length === 0}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>SN.</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell align="right">Holders</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((r, index) => (
                <TableRow key={r.id} hover selected={String(r.id) === String(chosen)}>
                  <TableCell className="mono">{index + 1}</TableCell>
                  <TableCell sx={{ whiteSpace: 'normal', minWidth: 160 }}>
                    {r.id === ROLE.ADMIN ? 'Laboratory' : r.role_name}
                    {r.description && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: 'block' }}
                      >
                        {r.description}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.id === ROLE.ADMIN ? (
                      <Chip size="small" variant="outlined" label="Built-in" />
                    ) : r.is_system ? (
                      <Chip size="small" variant="outlined" label="System" />
                    ) : (
                      <Chip size="small" variant="outlined" color="primary" label="Custom" />
                    )}
                  </TableCell>
                  <TableCell align="right" className="tabular">
                    {r.users || '—'}
                  </TableCell>
                  <TableCell>
                    <RowActions>
                      <IconAction
                        label="Permissions"
                        icon={PermissionsIcon}
                        onClick={() => setRoleId(String(r.id))}
                      />
                      <IconAction
                        label={
                          mayRename(r) ? 'Edit role' : 'A shared role — ask head office'
                        }
                        icon={EditIcon}
                        disabled={!mayRename(r)}
                        to={mayRename(r) ? `/roles/${r.id}/edit` : undefined}
                      />
                      <IconAction
                        label={deleteReason(r)}
                        icon={DeleteIcon}
                        danger
                        disabled={deleteReason(r) !== 'Delete role'}
                        onClick={() => removeRole(r)}
                      />
                    </RowActions>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      </Panel>

      {/* Permissions Modal */}
      {role && roleId && (
        <MuiDialog
          open
          onClose={() => setRoleId('')}
          maxWidth="md"
          fullWidth
        >
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="h6" component="span">
                Permissions — {role.id === ROLE.ADMIN ? 'Laboratory' : role.role_name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {granted} of {rows.length} areas granted
              </Typography>
            </Box>
            <IconButton onClick={() => setRoleId('')} size="small">
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers>
            {role.id === ROLE.ADMIN && (
              <Notice kind="info" sx={{ mb: 2 }}>
                Laboratory accounts have full access to their own laboratory data.
              </Notice>
            )}
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Area</TableCell>
                  {ABILITIES.map((a) => (
                    <TableCell key={a} align="center" sx={{ width: 80 }}>
                      {a.charAt(0).toUpperCase() + a.slice(1)}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((p) => {
                  const known = (actions.data?.data ?? []).find((a) => a.name === p.action_type);
                  const label = labelFor(p.action_type, known);
                  return (
                    <TableRow key={p.action_type} hover>
                      <TableCell sx={{ whiteSpace: 'normal' }}>
                        <Typography sx={{ fontSize: 13.5 }}>{label.name}</Typography>
                        {known && !known.enforced && (
                          <Chip
                            size="small"
                            variant="outlined"
                            label="not enforced"
                            sx={{ ml: 1, height: 18, fontSize: 10 }}
                          />
                        )}
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
          </DialogContent>
        </MuiDialog>
      )}

    </>
  );
}
