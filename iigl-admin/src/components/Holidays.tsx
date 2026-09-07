import { useState } from 'react';
import AddIcon from '@mui/icons-material/AddOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import {
  Button,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { useFetch } from '../lib/useFetch';
import type { Holiday } from '../lib/attendance';
import { useToast } from './Toast';
import {
  ConfirmDialog,
  DateField,
  Dialog,
  IconAction,
  Panel,
  RowActions,
  StateChip,
  TableFrame,
} from './ui';

/**
 * The days the office is shut.
 *
 * Two lists on one screen, because that is how a month is actually read: head
 * office's, which applies to everybody, and — for a laboratory — its own, for
 * the days only it closes. The rows say which is which, and only your own carry
 * the controls: a laboratory that could edit Republic Day could move
 * everybody's calendar and everybody's pay.
 *
 * A date is picked rather than typed. "Which Monday is Holi" is a question
 * people answer by looking at a calendar, and typing 2026-03-04 by hand is how
 * 2026-04-03 gets stored.
 */

const label = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

/** Add and edit are one form: the same two fields, a different verb. */
function HolidayForm({
  holiday,
  onClose,
  onSaved,
}: {
  holiday: Holiday | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [date, setDate] = useState(holiday?.date ?? '');
  const [name, setName] = useState(holiday?.name ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      if (holiday) await api.patch(`/holidays/${holiday.id}`, { date, name: name.trim() });
      else await api.post('/holidays', { date, name: name.trim() });
      toast.ok(holiday ? 'Holiday saved.' : `${name.trim()} added.`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={holiday ? `Edit ${holiday.name}` : 'Add a holiday'}
      onClose={onClose}
      onSubmit={save}
      submitLabel={holiday ? 'Save' : 'Add'}
      busy={busy}
      disabled={!date || !name.trim()}
      maxWidth="xs"
    >
      <Stack spacing={2}>
        <DateField label="Date" value={date} onChange={setDate} required />
        <TextField
          label="What it is"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Republic Day"
        />
      </Stack>
    </Dialog>
  );
}

export default function Holidays({
  canWrite,
  headOffice,
}: {
  /** Whether the viewer keeps a list at all. Staff read; employers write. */
  canWrite: boolean;
  /**
   * Whether the viewer's own list is the shared one. Head office keeps that
   * one; a laboratory keeps the other. It decides which rows carry controls,
   * and the server enforces the same rule on the write.
   */
  headOffice: boolean;
}) {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch<{ data: Holiday[] }>('/holidays');
  const rows = data?.data ?? [];

  /** `null` is the add form; a holiday is the edit form; `false` is closed. */
  const [editing, setEditing] = useState<Holiday | null | false>(false);
  const [removing, setRemoving] = useState<Holiday | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api.del(`/holidays/${removing.id}`);
      toast.ok(`${removing.name} removed.`);
      setRemoving(null);
      reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Panel
        title="Holidays"
        subtitle="The days the office is shut"
        count={loading ? 'Loading…' : `${rows.length} listed`}
        actions={
          canWrite ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing(null)}>
              Add a holiday
            </Button>
          ) : undefined
        }
      >
        <TableFrame
          loading={loading}
          error={error}
          empty={rows.length === 0}
          emptyText="No holidays listed."
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>What it is</TableCell>
                <TableCell>List</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((h) => {
                /*
                  Head office's rows are read-only to a laboratory, and a
                  laboratory's are read-only to head office. `shared` says which
                  list a row came from, and it is the same fact the server
                  enforces on a write — so a row is yours when the list it is on
                  is the list you keep.
                */
                const mine = canWrite && h.shared === headOffice;

                return (
                  <TableRow key={h.id} hover>
                    <TableCell className="tabular">{label(h.date)}</TableCell>
                    <TableCell sx={{ whiteSpace: 'normal' }}>{h.name}</TableCell>
                    <TableCell>
                      <StateChip
                        tone={h.shared ? 'plain' : 'holiday'}
                        label={h.shared ? 'Everybody' : 'This laboratory'}
                      />
                    </TableCell>
                    <TableCell align="right">
                      {mine && (
                        <RowActions>
                          <IconAction
                            label="Edit"
                            icon={EditIcon}
                            onClick={() => setEditing(h)}
                          />
                          <IconAction
                            label="Remove"
                            icon={DeleteIcon}
                            danger
                            onClick={() => setRemoving(h)}
                          />
                        </RowActions>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableFrame>
      </Panel>

      {editing !== false && (
        <HolidayForm holiday={editing} onClose={() => setEditing(false)} onSaved={reload} />
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        title="Remove this holiday?"
        message={
          removing
            ? `${label(removing.date)} — ${removing.name}. The day goes back to counting as an ordinary working day.`
            : ''
        }
        confirmLabel="Remove"
        busy={busy}
        onConfirm={remove}
        onClose={() => setRemoving(null)}
      />
    </>
  );
}
