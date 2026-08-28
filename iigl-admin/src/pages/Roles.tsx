import { useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/AddOutlined';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { Dialog, IconAction, Notice, Panel, RowActions, TableFrame } from '../components/ui';
import PermissionsIcon from '@mui/icons-material/KeyOutlined';
import RenameIcon from '@mui/icons-material/DriveFileRenameOutlineOutlined';

interface Role {
  id: number;
  role_name: string;
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

const labelFor = (action: string) =>
  LABELS[action] ?? { name: action.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) };

/** Roles 1 and 2 are the administrator and the laboratory. */
const isBuiltIn = (id: number) => id <= 2;

export default function Roles() {
  const roles = useFetch<{ data: Role[] }>('/users/roles');
  const list = roles.data?.data ?? [];

  const [roleId, setRoleId] = useState<string>('');
  const chosen = roleId || (list.find((r) => !isBuiltIn(r.id))?.id ?? list[0]?.id ?? '');
  const role = list.find((r) => String(r.id) === String(chosen));

  const permissions = useFetch<{ data: Permission[] }>(
    chosen ? `/users/roles/${chosen}/permissions` : null,
  );

  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState<{ open: boolean; id?: number; name: string }>({
    open: false,
    name: '',
  });
  const [busy, setBusy] = useState(false);

  /**
   * One toggle sends the whole row: the API replaces all four flags for that
   * action type, so sending a single changed flag would clear the other three.
   */
  const toggle = async (permission: Permission, ability: Ability) => {
    const next = { ...permission, [ability]: !permission[ability] };
    setSaving(`${permission.action_type}:${ability}`);
    setErr(null);
    setMsg(null);
    try {
      await api.put(`/users/roles/${chosen}/permissions`, {
        action_type: permission.action_type,
        view: next.view,
        create: next.create,
        update: next.update,
        delete: next.delete,
      });
      permissions.reload();
    } catch (e) {
      setErr(messageOf(e));
    } finally {
      setSaving(null);
    }
  };

  const saveRole = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (form.id) {
        await api.patch(`/content/roles/${form.id}`, { role_name: form.name });
        setMsg('Role renamed.');
      } else {
        await api.post('/content/roles', { role_name: form.name });
        setMsg(`${form.name} added. It starts with no permissions — grant them before anyone signs in.`);
      }
      setForm({ open: false, name: '' });
      roles.reload();
    } catch (e) {
      setErr(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const rows = permissions.data?.data ?? [];
  const granted = rows.filter((p) => ABILITIES.some((a) => p[a])).length;

  return (
    <>
      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="error">{err}</Notice>}

      <Panel
        title="Roles"
        actions={
          <Button
            size="small"
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setForm({ open: true, name: '' })}
          >
            Add role
          </Button>
        }
      >
        <TableFrame loading={roles.loading} error={roles.error} empty={list.length === 0}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Id</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Kind</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {list.map((r) => (
                <TableRow key={r.id} hover selected={String(r.id) === String(chosen)}>
                  <TableCell className="mono">#{r.id}</TableCell>
                  <TableCell>{r.role_name}</TableCell>
                  <TableCell>
                    {r.id === 1 ? (
                      <Chip size="small" variant="outlined" label="Administrator" />
                    ) : r.id === 2 ? (
                      <Chip size="small" variant="outlined" label="Laboratory" />
                    ) : (
                      <Chip size="small" variant="outlined" color="primary" label="Staff" />
                    )}
                  </TableCell>
                  <TableCell>
                    <RowActions>
                      <IconAction
                        label="Permissions"
                        icon={PermissionsIcon}
                        onClick={() => setRoleId(String(r.id))}
                      />
                      <IconAction
                        label="Rename role"
                        icon={RenameIcon}
                        onClick={() => setForm({ open: true, id: r.id, name: r.role_name })}
                      />
                    </RowActions>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      </Panel>

      <Typography variant="h2" sx={{ mt: 4, mb: 1.5 }}>
        Permissions
      </Typography>

      <Panel
        actions={
          <>
            <TextField
              select
              label="Role"
              value={chosen}
              onChange={(e) => setRoleId(e.target.value)}
              sx={{ minWidth: 210 }}
            >
              {list.map((r) => (
                <MenuItem key={r.id} value={r.id}>
                  {r.role_name}
                </MenuItem>
              ))}
            </TextField>
            <Typography variant="body2" color="text.secondary">
              {granted} of {rows.length} areas granted
            </Typography>
          </>
        }
      >
        {role && role.id === 1 && (
          <Box sx={{ p: 2, pb: 0 }}>
            <Notice kind="info" sx={{ mb: 0 }}>
              Administrators are granted everything unconditionally, whatever this matrix says.
              Editing it here has no effect on them — it is kept visible so the rows are not
              mistaken for a lockout.
            </Notice>
          </Box>
        )}

        <TableFrame
          loading={permissions.loading}
          error={permissions.error}
          empty={rows.length === 0}
        >
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Area</TableCell>
                {ABILITIES.map((a) => (
                  <TableCell key={a} align="center" sx={{ width: 88 }}>
                    {a}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((p) => {
                const label = labelFor(p.action_type);
                return (
                  <TableRow key={p.action_type} hover>
                    <TableCell sx={{ whiteSpace: 'normal', minWidth: 260 }}>
                      <Typography sx={{ fontSize: 13.5 }}>{label.name}</Typography>
                      {label.note && (
                        <Typography variant="caption" color="text.secondary">
                          {label.note}
                        </Typography>
                      )}
                      <Typography variant="caption" color="text.secondary" className="mono" sx={{ display: 'block' }}>
                        {p.action_type}
                      </Typography>
                    </TableCell>
                    {ABILITIES.map((a) => {
                      const key = `${p.action_type}:${a}`;
                      return (
                        <TableCell key={a} align="center">
                          {saving === key ? (
                            <CircularProgress size={16} />
                          ) : (
                            <Tooltip title={`${a} ${label.name.toLowerCase()}`}>
                              <Checkbox
                                size="small"
                                checked={p[a]}
                                onChange={() => toggle(p, a)}
                                disabled={Boolean(saving)}
                                slotProps={{
                                  input: { 'aria-label': `${a} ${label.name}` },
                                }}
                              />
                            </Tooltip>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableFrame>
      </Panel>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        A change applies immediately — the cached matrix is dropped when it is saved. Order intake
        is the one that visibly changes what a person sees; the rest gate screens and actions.
      </Typography>

      {form.open && (
        <Dialog
          title={form.id ? 'Rename role' : 'Add role'}
          onClose={() => setForm({ open: false, name: '' })}
          onSubmit={saveRole}
          busy={busy}
        >
          {!form.id && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              A new role starts with no permissions at all. Grant them here before anyone signs in
              with it.
            </Typography>
          )}
          <TextField
            label="Role name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </Dialog>
      )}
    </>
  );
}
