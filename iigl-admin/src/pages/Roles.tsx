import { useState } from 'react';
import {
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useToast } from '../components/Toast';
import RolePermissionsDialog from '../components/RolePermissionsDialog';
import { useAuth } from '../lib/auth';
import { isSuper, ROLE } from '../lib/portal';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { hint, FormPanel, IconAction, Panel, RowActions, SearchField, TableFrame } from '../components/ui';

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

interface Permission {
  action_type: string;
  view: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}

/**
 * Only super admin (#1) and laboratory (#2) are truly built-in.
 * All other roles (team variants, custom roles) can be edited/deleted.
 */
const isBuiltIn = (r: Role) => r.id <= 2;

export default function Roles() {
  const toast = useToast();
  const { user } = useAuth();
  const roles = useFetch<{ data: Role[] }>('/roles');
  const list = roles.data?.data ?? [];
  // `list` itself stays whole: it resolves the selected role and drives the
  // permission matrix below, neither of which a search of the table should touch.
  const [search, setSearch] = useState('');
  /*
    Which roles this screen is about, per viewer. This screen manages roles, so
    it lists the ones the viewer can manage and nothing else.

    Head office: the shared roles it owns, less super admin. A laboratory's own
    roles belong to that laboratory's panel.

    A laboratory: the roles it owns, and only those. Super admin, Laboratory and
    Team are head office's — shared with every franchise, so none of them can be
    renamed, re-granted or deleted from here, and three rows whose every control
    is refused are three rows of noise. They still exist and are still assignable
    to an employee; they are simply not this screen's business.
  */
  const shown = list.filter((r) => {
    if (isSuper(user) ? r.id === ROLE.SUPER || r.owner_id !== null : r.owner_id === null) {
      return false;
    }
    return hits(search, r.id, r.role_name);
  });

  const [roleId, setRoleId] = useState<string>('');
  const chosen = roleId || (shown.find((r) => !isBuiltIn(r))?.id ?? shown[0]?.id ?? '');
  const role = list.find((r) => String(r.id) === String(chosen));

  const permissions = useFetch<{ data: Permission[] }>(
    chosen ? `/roles/${chosen}/permissions` : null,
  );

  // No `open`: the form is a panel on the page, empty to add and filled to
  // rename, with `id` the only thing telling the two apart.
  const [form, setForm] = useState<{
    open: boolean;
    id?: number;
    name: string;
    description: string;
  }>({ open: false, name: '', description: '' });

  const [busy, setBusy] = useState(false);

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
            slotProps={hint(
              isSuper(user)
                ? 'A head office role: every laboratory can put somebody in it.'
                : "Your laboratory's own role. No other laboratory sees it.",
            )}
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
        <TableFrame
          loading={roles.loading}
          error={roles.error}
          empty={shown.length === 0}
          /* A laboratory starts with none of its own, and an empty table with
             no explanation reads as a screen that failed to load. */
          emptyText={
            search.trim()
              ? 'No role matches that.'
              : isSuper(user)
                ? 'No roles yet.'
                : 'You have no roles of your own yet. Add one, grant it what it needs, and hire into it.'
          }
        >
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

      {role && roleId && (
        <RolePermissionsDialog
          key={role.id}
          roleId={role.id}
          roleName={role.id === ROLE.ADMIN ? 'Laboratory' : role.role_name}
          readOnly={!mayRename(role)}
          note={
            role.id === ROLE.ADMIN
              ? 'A laboratory account already has full access to its own laboratory data. These grants apply to what it may do beyond that.'
              : !mayRename(role)
                ? "Head office's role, shared with every laboratory. You can see what it allows; to change it, make one of your own."
                : undefined
          }
          onClose={() => setRoleId('')}
          onSaved={() => {
            roles.reload();
            permissions.reload();
          }}
        />
      )}

    </>
  );
}
