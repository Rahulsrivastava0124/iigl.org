import { useState } from 'react';
import {
  Checkbox,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import ClearIcon from '@mui/icons-material/BackspaceOutlined';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { COLUMNS, SIDE, nameFor, uses, usable, type Permission, type StaffKind } from '../lib/permissionMenu';
import { useToast } from './Toast';
import { Dialog, IconAction, Notice, TableFrame } from './ui';

interface OwnPermission extends Permission {
  /**
   * Whether this person holds a row of their own for this permission. Four
   * unticked boxes mean two different things — "whatever the role says" and
   * "not this, whatever the role says" — and this tells them apart.
   */
  own: boolean;
}

/**
 * One employee's own permissions, beside what their role gives them.
 *
 * Opened by the employer: head office for any employee, a laboratory for its
 * own staff. The API sends only the permissions this person's side can have —
 * a laboratory's staff: orders, certificates, customers; head office's staff:
 * laboratories, customers, the enquiry books and website setup — and only the
 * boxes each one uses can be ticked.
 *
 * A grant here **replaces** the role's answer for that permission, so it can
 * take away as well as give. Clearing a row puts it back on the role.
 */
export default function UserPermissions({
  user,
  onClose,
}: {
  user: { id: number; fullname: string; role_id: number | null };
  onClose: () => void;
}) {
  const toast = useToast();
  const mine = useFetch<{ data: OwnPermission[]; staff_of: StaffKind }>(`/users/${user.id}/permissions`);
  const role = useFetch<{ data: Permission[] }>(user.role_id !== null ? `/roles/${user.role_id}/permissions` : null);
  const [saving, setSaving] = useState<string | null>(null);

  const rows = mine.data?.data ?? [];
  const side = mine.data?.staff_of;
  const fromRole = new Map((role.data?.data ?? []).map((p) => [p.action_type, p]));

  /** What they may do now: their own row when they have one, their role's otherwise. */
  const effective = (p: OwnPermission): Permission => (p.own ? p : (fromRole.get(p.action_type) ?? p));

  const toggle = async (p: OwnPermission, ability: (typeof COLUMNS)[number]['key']) => {
    // Flipped against what they may do now, so ticking one box on a row that
    // follows its role keeps the role's other boxes rather than dropping them.
    const from = effective(p);
    const next = { ...from, [ability]: !from[ability] };
    setSaving(`${p.action_type}:${ability}`);
    try {
      await api.put(`/users/${user.id}/permissions`, {
        action_type: p.action_type,
        view: next.view,
        create: next.create,
        update: next.update,
        delete: next.delete,
      });
      mine.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setSaving(null);
    }
  };

  const clear = async (p: OwnPermission) => {
    setSaving(`${p.action_type}:clear`);
    try {
      await api.del(`/users/${user.id}/permissions/${p.action_type}`);
      toast.ok(
        user.role_id !== null
          ? `${nameFor(p.action_type, p)} follows the role again.`
          : `${nameFor(p.action_type, p)} withdrawn.`,
      );
      mine.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Dialog
      title={`Permissions — ${user.fullname}`}
      onClose={onClose}
      onSubmit={onClose}
      submitLabel="Done"
      maxWidth="lg"
    >
      {side && (
        <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>
          {SIDE[side]}.{' '}
          {side === 'laboratory'
            ? 'These are the counter permissions a laboratory can give its staff. Their own attendance and messages to the laboratory are always theirs.'
            : 'These are the head-office screens Super Admin can give its staff. Their own attendance and messages are always theirs; everything not listed stays with Super Admin.'}
        </Typography>
      )}
      {user.role_id === null && (
        <Notice kind="warn">
          This person holds no role, so these grants are everything they can do. Until one is set here, they can sign in
          and see nothing.
        </Notice>
      )}

      <TableFrame loading={mine.loading} error={mine.error} empty={rows.length === 0}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Permission</TableCell>
              {user.role_id !== null && <TableCell>From the role</TableCell>}
              {COLUMNS.map((c) => (
                <TableCell key={c.key} align="center">
                  {c.label}
                </TableCell>
              ))}
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((p) => {
              const roleRow = fromRole.get(p.action_type);
              const roleGives = roleRow ? usable(p).filter((a) => roleRow[a]) : [];
              const eff = effective(p);

              return (
                <TableRow key={p.action_type} hover>
                  <TableCell sx={{ whiteSpace: 'normal', minWidth: 260, maxWidth: 440 }}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>{nameFor(p.action_type, p)}</Typography>
                  </TableCell>

                  {user.role_id !== null && (
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {roleGives.length
                          ? roleGives.map((a) => COLUMNS.find((c) => c.key === a)!.label).join(', ')
                          : '—'}
                      </Typography>
                    </TableCell>
                  )}

                  {COLUMNS.map(({ key: a, label }) => (
                    <TableCell key={a} align="center">
                      {!uses(p, a) ? (
                        <Typography color="text.disabled" sx={{ fontSize: 13 }} title={`${nameFor(p.action_type, p)} has no ${label}`}>
                          —
                        </Typography>
                      ) : saving === `${p.action_type}:${a}` ? (
                        <CircularProgress size={16} />
                      ) : (
                        <Tooltip
                          title={
                            p.own
                              ? `Set for this person${eff[a] ? '' : ' — refused, whatever the role says'}`
                              : eff[a]
                                ? 'From the role. Untick to refuse it for this person.'
                                : 'The role does not allow it. Tick to allow it for this person.'
                          }
                        >
                          <Checkbox
                            size="small"
                            checked={eff[a]}
                            onChange={() => toggle(p, a)}
                            disabled={Boolean(saving)}
                            // A tick that came from the role is drawn quieter than
                            // one set here, so the screen says where it comes from.
                            color={p.own ? 'primary' : 'default'}
                            sx={{ opacity: p.own ? 1 : 0.6 }}
                            slotProps={{ input: { 'aria-label': `${label} ${nameFor(p.action_type, p)}` } }}
                          />
                        </Tooltip>
                      )}
                    </TableCell>
                  ))}

                  <TableCell>
                    <Tooltip title={p.own ? 'Clear — follow the role' : 'Nothing set for this person'}>
                      <span>
                        <IconAction
                          label="Clear"
                          icon={ClearIcon}
                          disabled={!p.own || Boolean(saving)}
                          onClick={() => clear(p)}
                        />
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableFrame>

      <Stack sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary">
          Changes save as you tick them. The API checks them on this person’s next request; their menu updates the next
          time they load the panel.
        </Typography>
      </Stack>
    </Dialog>
  );
}
