import { useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Button,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/AddOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlineOutlined';
import OnIcon from '@mui/icons-material/ToggleOnOutlined';
import OffIcon from '@mui/icons-material/ToggleOffOutlined';
import { useToast } from '../components/Toast';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { hint, ConfirmDialog, FormPanel, IconAction, Panel, RowActions, StateChip, TableFrame } from '../components/ui';

/**
 * The master lists.
 *
 * Five short lists head office maintains and every form reads. A page each,
 * reached from the menu — `/master/countries`, `/master/states` — so a list is
 * somewhere you go rather than a tab you find.
 *
 * One component behind all five, though, not five files: they are five
 * instances of the same thing — a name, whether it is in use, and sometimes a
 * parent — and five copies would answer the same question five slightly
 * different ways within a year. The API is one factory for exactly this
 * reason; this is its other half. What differs between them is the table
 * below, and nothing else.
 *
 * **Deactivate, do not delete.** A district taken off the list is still the
 * district on four hundred old addresses. The toggle is the ordinary way to
 * retire a row; delete is for the one written by mistake, and the API refuses
 * it as soon as anything points at the row.
 */

type FieldKind = 'text' | 'number' | 'parent';

interface Field {
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  helperText?: string;
  /** Set once, on create. The API refuses to change it afterwards. */
  createOnly?: boolean;
}

interface List {
  /** The path segment, both in the URL and on the API. */
  id: string;
  label: string;
  /** Singular, for the buttons and the dialogs. */
  noun: string;
  fields: Field[];
  /** The list whose row this one hangs off. */
  parent?: { list: string; column: string; label: string };
}

const LISTS: List[] = [
  {
    id: 'gst',
    label: 'GST',
    noun: 'GST rate',
    fields: [
      { name: 'name', label: 'Name', kind: 'text', required: true, helperText: 'What the invoice calls it — "GST 18%".' },
      { name: 'percent', label: 'Percent', kind: 'number', required: true, helperText: '18 for eighteen per cent, not 0.18.' },
    ],
  },
  {
    id: 'enquiry-types',
    label: 'Enquiry type',
    noun: 'Enquiry type',
    fields: [
      {
        name: 'code',
        label: 'Code',
        kind: 'text',
        required: true,
        createOnly: true,
        helperText: 'Stored on every enquiry of this kind. It cannot be changed afterwards.',
      },
      { name: 'label', label: 'Label', kind: 'text', required: true, helperText: 'What the tab is called.' },
      { name: 'sort', label: 'Order', kind: 'number', helperText: 'Where it sits among the tabs. Ties fall back to the label.' },
    ],
  },
  {
    id: 'countries',
    label: 'Country',
    noun: 'Country',
    fields: [
      { name: 'name', label: 'Name', kind: 'text', required: true },
      { name: 'code', label: 'Code', kind: 'text', helperText: 'ISO two-letter, where you know it.' },
    ],
  },
  {
    id: 'states',
    label: 'State',
    noun: 'State',
    parent: { list: 'countries', column: 'country_id', label: 'Country' },
    fields: [
      { name: 'country_id', label: 'Country', kind: 'parent', required: true },
      { name: 'name', label: 'Name', kind: 'text', required: true },
      { name: 'code', label: 'Code', kind: 'text' },
    ],
  },
  {
    id: 'districts',
    label: 'District',
    noun: 'District',
    parent: { list: 'states', column: 'state_id', label: 'State' },
    fields: [
      { name: 'state_id', label: 'State', kind: 'parent', required: true },
      { name: 'name', label: 'Name', kind: 'text', required: true },
    ],
  },
];

interface Row {
  id: number;
  is_active: number;
  [column: string]: unknown;
}

export default function Master() {
  const toast = useToast();
  // The route decides which list this is. An unknown one falls back to the
  // first rather than rendering nothing: the router sends stray paths here.
  const { list: segment } = useParams();
  const list = LISTS.find((l) => l.id === segment) ?? LISTS[0];

  const rows = useFetch<{ data: Row[] }>(`/master/${list.id}`);
  // The parent list, for the select and for naming the parent in the table.
  const parents = useFetch<{ data: Row[] }>(
    list.parent ? `/master/${list.parent.list}?active=1` : null,
  );

  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  /*
    Adding one row, from the header.

    Countries, states and districts are a name and nothing else, and they are
    entered in runs — thirty-six states, then every district of one of them.
    Opening a form, typing a word, saving and closing it is four actions for
    one word, so the header carries a box: type, press Enter, it is in the
    list, the box is empty and the cursor is still in it.

    Only for a list that a name is enough for. A GST rate needs its percent and
    an enquiry type needs its code, and a quick box that silently writes zero
    or an empty code is worse than the form it saved somebody from.
  */
  const required = list.fields.filter((f) => f.kind !== 'parent' && f.required);
  const quickField = required.length === 1 && required[0].kind === 'text' ? required[0] : null;

  const [quickText, setQuickText] = useState('');
  const [quickParent, setQuickParent] = useState('');

  const quickAdd = async () => {
    if (!quickField) return;
    const value = quickText.trim();
    if (!value) return;
    if (list.parent && !quickParent) {
      toast.error(`Choose a ${list.parent.label.toLowerCase()} first.`);
      return;
    }

    setBusy(true);
    try {
      await api.post(`/master/${list.id}`, {
        [quickField.name]: value,
        ...(list.parent ? { [list.parent.column]: Number(quickParent) } : {}),
      });
      toast.ok(`${list.noun} added.`);
      // The parent stays chosen: the next district belongs to the same state.
      setQuickText('');
      rows.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const blank = () =>
    Object.fromEntries(list.fields.map((f) => [f.name, f.kind === 'number' ? '0' : '']));

  const set = (name: string, value: string) =>
    setForm((f) => (f ? { ...f, [name]: value } : f));

  const parentName = (row: Row) => {
    if (!list.parent) return null;
    const id = Number(row[list.parent.column]);
    return (parents.data?.data.find((p) => p.id === id)?.name as string) ?? '—';
  };

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = {};
      for (const f of list.fields) {
        // The code is written once. Sending it on an edit would be asking the
        // API to do the one thing it refuses.
        if (f.createOnly && form.id) continue;
        body[f.name] = f.kind === 'number' ? Number(form[f.name] || 0) : form[f.name];
      }

      if (form.id) {
        await api.patch(`/master/${list.id}/${form.id}`, body);
        toast.ok(`${list.noun} updated.`);
        // An edit is finished when it is saved.
        setForm(null);
      } else {
        await api.post(`/master/${list.id}`, body);
        toast.ok(`${list.noun} added.`);
        /*
          Adding is not. These lists are filled in runs — every state of one
          country, every district of one state — so the form stays open with
          the parent still chosen and only the row's own fields emptied.
          Closing it meant reopening and repicking the country for each of
          thirty-six states.
        */
        setForm({
          ...blank(),
          ...Object.fromEntries(
            list.fields.filter((f) => f.kind === 'parent').map((f) => [f.name, form[f.name] ?? '']),
          ),
        });
      }
      rows.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (row: Row) => {
    try {
      await api.patch(`/master/${list.id}/${row.id}/active`, { is_active: !row.is_active });
      rows.reload();
    } catch (e) {
      toast.error(messageOf(e));
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.del(`/master/${list.id}/${deleting.id}`);
      toast.ok(`${list.noun} deleted.`);
      setDeleting(null);
      rows.reload();
    } catch (e) {
      // In use, nearly always. The message says to retire it instead.
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {form && (
        <FormPanel
          title={form.id ? `Edit ${list.noun.toLowerCase()}` : `New ${list.noun.toLowerCase()}`}
          onClose={() => setForm(null)}
          onSubmit={save}
          busy={busy}
        >
          {list.fields.map((f) =>
            f.kind === 'parent' ? (
              <TextField
                key={f.name}
                select
                label={f.label}
                value={form[f.name] ?? ''}
                onChange={(e) => set(f.name, e.target.value)}
                required={f.required}
                slotProps={f.helperText ? hint(f.helperText, true) : undefined}
              >
                {parents.data?.data.map((p) => (
                  <MenuItem key={p.id} value={String(p.id)}>
                    {String(p.name)}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <TextField
                key={f.name}
                label={f.label}
                type={f.kind === 'number' ? 'number' : 'text'}
                value={form[f.name] ?? ''}
                onChange={(e) => set(f.name, e.target.value)}
                required={f.required}
                // Set once: the code is on every record filed under it.
                disabled={Boolean(f.createOnly && form.id)}
                slotProps={f.helperText ? hint(f.helperText) : undefined}
              />
            ),
          )}
        </FormPanel>
      )}

      <Panel
        title={`${list.label} list`}
        count={rows.data ? `${rows.data.data.length.toLocaleString()} rows` : 'Loading…'}
        actions={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }} useFlexGap>
            {quickField && (
              <>
                {list.parent && (
                  <TextField
                    select
                    size="small"
                    label={list.parent.label}
                    value={quickParent}
                    onChange={(e) => setQuickParent(e.target.value)}
                    sx={{ minWidth: 150 }}
                  >
                    {parents.data?.data.map((p) => (
                      <MenuItem key={p.id} value={String(p.id)}>
                        {String(p.name)}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
                <TextField
                  size="small"
                  placeholder={`Add ${list.noun.toLowerCase()} — press Enter`}
                  value={quickText}
                  onChange={(e) => setQuickText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    // The panel is not a form, but Enter in a box that adds
                    // things should add the thing.
                    e.preventDefault();
                    void quickAdd();
                  }}
                  disabled={busy || (Boolean(list.parent) && (parents.data?.data.length ?? 0) === 0)}
                  sx={{ minWidth: 240 }}
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <Tooltip title={`Add ${list.noun.toLowerCase()}`}>
                            {/* A span, so the tooltip still shows while the
                                button is disabled with the box empty. */}
                            <span>
                              <IconButton
                                size="small"
                                edge="end"
                                onClick={() => void quickAdd()}
                                disabled={busy || quickText.trim() === ''}
                              >
                                <AddIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </InputAdornment>
                      ),
                    },
                  }}
                />
              </>
            )}
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setForm(blank())}
              // Nothing to hang a state or a district off yet.
              disabled={Boolean(list.parent) && (parents.data?.data.length ?? 0) === 0}
            >
              New {list.noun.toLowerCase()}
            </Button>
          </Stack>
        }
      >
        <TableFrame
          loading={rows.loading}
          error={rows.error}
          empty={(rows.data?.data.length ?? 0) === 0}
          emptyText={`No ${list.noun.toLowerCase()} yet. Add the first one.`}
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>SN.</TableCell>
                {list.parent && <TableCell>{list.parent.label}</TableCell>}
                {list.fields
                  .filter((f) => f.kind !== 'parent')
                  .map((f) => (
                    <TableCell key={f.name}>{f.label}</TableCell>
                  ))}
                <TableCell>Status</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {(rows.data?.data ?? []).map((row, index) => (
                <TableRow key={row.id} hover>
                  <TableCell className="mono">{index + 1}</TableCell>
                  {list.parent && <TableCell>{parentName(row)}</TableCell>}
                  {list.fields
                    .filter((f) => f.kind !== 'parent')
                    .map((f) => (
                      <TableCell key={f.name}>
                        {row[f.name] === null || row[f.name] === '' ? '—' : String(row[f.name])}
                      </TableCell>
                    ))}
                  <TableCell>
                    <StateChip
                      tone={row.is_active ? 'settled' : 'refused'}
                      label={row.is_active ? 'Active' : 'Inactive'}
                    />
                  </TableCell>
                  <TableCell>
                    <RowActions>
                      {/*
                        The toggle takes the colour of the state it is in —
                        green while the row is in use, red while it is not —
                        as style.md has it for every other toggle in the panel.
                      */}
                      <Tooltip title={row.is_active ? 'Retire it' : 'Bring it back'}>
                        <IconButton
                          size="small"
                          onClick={() => toggle(row)}
                          sx={{
                            color: row.is_active ? 'success.main' : 'error.main',
                            '&:hover': {
                              bgcolor: row.is_active ? 'success.main' : 'error.main',
                              color: 'common.white',
                            },
                          }}
                        >
                          {row.is_active ? <OnIcon /> : <OffIcon />}
                        </IconButton>
                      </Tooltip>
                      <IconAction
                        label={`Edit ${list.noun.toLowerCase()}`}
                        icon={EditIcon}
                        onClick={() =>
                          setForm({
                            ...blank(),
                            ...Object.fromEntries(
                              list.fields.map((f) => [f.name, row[f.name] == null ? '' : String(row[f.name])]),
                            ),
                            id: String(row.id),
                          })
                        }
                      />
                      <IconAction
                        label={`Delete ${list.noun.toLowerCase()}`}
                        icon={DeleteIcon}
                        danger
                        onClick={() => setDeleting(row)}
                      />
                    </RowActions>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      </Panel>

      <ConfirmDialog
        open={Boolean(deleting)}
        title={`Delete ${list.noun.toLowerCase()}`}
        message={
          <>
            Delete <strong>{String(deleting?.name ?? deleting?.label ?? '')}</strong>?
          </>
        }
        warning="Only a row nothing refers to can be deleted. Anything in use has to be retired instead, so the records that name it still read."
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        busy={busy}
      />
    </>
  );
}
