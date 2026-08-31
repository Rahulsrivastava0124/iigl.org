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
import { useToast } from './Toast';
import { Dialog, IconAction, Notice, TableFrame } from './ui';

interface Permission {
  action_type: string;
  view: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
  /**
   * Whether this person has a row of their own for this action.
   *
   * Only on their own permissions, never on a role's. Four unticked boxes mean
   * two different things — "whatever the role says" and "not this, whatever the
   * role says" — and this is what tells them apart. The API sends it for
   * exactly that reason.
   */
  own?: boolean;
}

interface Action {
  name: string;
  label: string;
  description: string | null;
  enforced: boolean;
}

type Ability = 'view' | 'create' | 'update' | 'delete';
const ABILITIES: Ability[] = ['view', 'create', 'update', 'delete'];

/**
 * One person's own permissions, beside what their role gives them.
 *
 * The two columns are the point of the screen. A grant here **replaces** the
 * role's answer for that row rather than adding to it, so it can take away as
 * well as give — and somebody with no role has nothing but this column.
 *
 * Clearing a row is not the same as unticking everything: unticked is "not
 * this, whatever the role says", and cleared is "whatever the role says".
 * Those are different instructions and the screen keeps them apart.
 */
export default function UserPermissions({
  user,
  onClose,
}: {
  user: { id: number; fullname: string; role_id: number | null };
  onClose: () => void;
}) {
  const toast = useToast();
  const mine = useFetch<{ data: Permission[] }>(`/users/${user.id}/permissions`);
  const role = useFetch<{ data: Permission[] }>(
    user.role_id !== null ? `/roles/${user.role_id}/permissions` : null,
  );
  const actions = useFetch<{ data: Action[] }>('/roles/actions');
  const [saving, setSaving] = useState<string | null>(null);

  const rows = mine.data?.data ?? [];
  const fromRole = new Map((role.data?.data ?? []).map((p) => [p.action_type, p]));
  const known = new Map((actions.data?.data ?? []).map((a) => [a.name, a]));

  /**
   * Whether this row is theirs rather than their role's.
   *
   * `own` comes from the API. The fallback is for a row that predates it: any
   * flag set can only have come from a grant of their own.
   */
  const isGranted = (p: Permission) => p.own ?? ABILITIES.some((a) => p[a]);

  /**
   * What this person may actually do for one action — their own row when they
   * have one, otherwise their role's.
   *
   * The boxes show this rather than the raw grant. Showing the grant meant a
   * row the role allowed in full drew four empty boxes beside the words "view,
   * create, update, delete", which reads as a refusal of something that is in
   * fact allowed.
   */
  const effective = (p: Permission): Permission =>
    isGranted(p) ? p : (fromRole.get(p.action_type) ?? p);

  const toggle = async (p: Permission, ability: Ability) => {
    // Flipped against what they may do now, not against an empty row. Ticking
    // one ability on a row that follows a role which grants all four used to
    // save that one and drop the other three — a click that reads as "also let
    // them delete" would quietly take view, create and update away.
    const from = effective(p);
    const next = { ...from, [ability]: !from[ability] };
    setSaving(`${p.action_type}:${ability}`);
    try {
      // The whole row goes, because the API replaces all four flags: sending
      // one changed flag would clear the other three.
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

  const clear = async (p: Permission) => {
    setSaving(`${p.action_type}:clear`);
    try {
      await api.del(`/users/${user.id}/permissions/${p.action_type}`);
      toast.ok(
        user.role_id !== null
          ? `${labelOf(p.action_type)} follows the role again.`
          : `${labelOf(p.action_type)} withdrawn.`,
      );
      mine.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setSaving(null);
    }
  };

  const labelOf = (name: string) => known.get(name)?.label ?? name;

  return (
    <Dialog
      title={`Permissions — ${user.fullname}`}
      onClose={onClose}
      onSubmit={onClose}
      submitLabel="Done"
      maxWidth="lg"
    >
      {/*
        * No explanation banner for somebody who has a role.
        *
        * The boxes now show what the person may actually do, faint where the
        * answer comes from their role, and each one says so on hover — the
        * paragraph was describing what the screen already shows. The warning
        * below stays: somebody with no role has nothing until this dialog
        * gives it to them, and no amount of ticking says that on its own.
        */}
      {user.role_id === null && (
        <Notice kind="warn">
          This person holds no role, so these grants are everything they can do. Until one is set
          here, they can sign in and see nothing.
        </Notice>
      )}

      <TableFrame
        loading={mine.loading || actions.loading}
        error={mine.error}
        empty={rows.length === 0}
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Permission</TableCell>
              {user.role_id !== null && <TableCell>The role</TableCell>}
              {ABILITIES.map((a) => (
                <TableCell key={a} align="center" sx={{ textTransform: 'capitalize' }}>
                  {a}
                </TableCell>
              ))}
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((p) => {
              const action = known.get(p.action_type);
              const theirs = isGranted(p);
              const roleRow = fromRole.get(p.action_type);
              const roleGives = roleRow ? ABILITIES.filter((a) => roleRow[a]) : [];
              // What they may do now: their own row if they have one, their
              // role's otherwise. The boxes show this.
              const eff = effective(p);

              return (
                <TableRow key={p.action_type} hover>
                  <TableCell sx={{ whiteSpace: 'normal', minWidth: 170 }}>
                    <Typography sx={{ fontSize: 13.5 }}>
                      {action?.label ?? p.action_type}
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      className="mono"
                      sx={{ display: 'block' }}
                    >
                      {p.action_type}
                      {action && !action.enforced ? ' · not enforced yet' : ''}
                    </Typography>
                  </TableCell>

                  {user.role_id !== null && (
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {roleGives.length ? roleGives.join(', ') : '—'}
                      </Typography>
                    </TableCell>
                  )}

                  {ABILITIES.map((a) => (
                    <TableCell key={a} align="center">
                      {saving === `${p.action_type}:${a}` ? (
                        <CircularProgress size={16} />
                      ) : (
                        <Tooltip
                          title={
                            theirs
                              ? `Set here${eff[a] ? '' : ' — refused, whatever the role says'}`
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
                            // A tick that came from the role is drawn quieter
                            // than one set here, so the screen says where the
                            // answer comes from without a column for it.
                            color={theirs ? 'primary' : 'default'}
                            sx={{ opacity: theirs ? 1 : 0.6 }}
                            slotProps={{ input: { 'aria-label': `${a} ${action?.label ?? p.action_type}` } }}
                          />
                        </Tooltip>
                      )}
                    </TableCell>
                  ))}

                  <TableCell>
                    <Tooltip title={theirs ? 'Clear — follow the role' : 'Nothing set here'}>
                      <span>
                        <IconAction
                          label="Clear"
                          icon={ClearIcon}
                          disabled={!theirs || Boolean(saving)}
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
          Changes save as you tick them, and take effect on this person's next request.
        </Typography>
      </Stack>
    </Dialog>
  );
}
