import { useState } from 'react';
import {
  Autocomplete,
  Button,
  Chip,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import { useToast } from '../components/Toast';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import {
  ConfirmDialog,
  FormPanel,
  IconAction,
  Panel,
  RowActions,
  SearchField,
  TableFrame,
} from '../components/ui';
import type { Attribute, Category } from '../lib/api';
import AddIcon from '@mui/icons-material/AddOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';

/**
 * The attribute master list.
 *
 * `attributes` and `attribute_values` are per branch — an attribute belongs to
 * one category *and* one subcategory — so "Colour: D, E, F, G, H, I, J" was
 * typed again, value by value, for every subcategory that grades colour. The
 * seventh time somebody types it, one of them is "Colour " or the list stops
 * at H.
 *
 * This is the library those lists are filled from: an attribute name under a
 * category, and the values it normally takes. Nothing here is a value on any
 * certificate. Picking from a master on the Add Value screen creates real
 * `attribute_values` rows against the branch being worked on, and the two are
 * unrelated from that moment on — which is why deleting a master is a plain
 * delete where retiring an attribute value is not.
 */

export interface AttributeMaster {
  id: number;
  category_id: number;
  attr_name: string;
  values: { id: number; value_name: string }[];
}

const BLANK = {
  open: false,
  id: undefined as number | undefined,
  category_id: '',
  attr_name: '',
  values: [] as string[],
};

export default function AttributeMaster() {
  const toast = useToast();
  const categories = useFetch<{ data: Category[] }>('/catalog/categories');
  const masters = useFetch<{ data: AttributeMaster[] }>('/catalog/attribute-masters');

  const [search, setSearch] = useState('');
  const [form, setForm] = useState(BLANK);
  const [deleting, setDeleting] = useState<AttributeMaster | null>(null);
  const [busy, setBusy] = useState(false);

  /*
    The attributes already defined under the chosen category, so the name is
    picked rather than typed.

    It has to match: the Add Value screen finds a master by the attribute's
    **name**, so "Colour " or "colour" is a master that silently offers nothing.
    Read across every subcategory of the category and reduced to distinct names
    — one "Colour" list serves all of them, which is the point of a master.

    Still `freeSolo`, so a list can be written before the attribute exists.
    Refusing that would mean a master can only ever be built second.
  */
  const catAttributes = useFetch<{ data: Attribute[] }>(
    form.category_id ? `/catalog/categories/${form.category_id}/attributes` : null,
  );
  const attrNames = [
    ...new Set((catAttributes.data?.data ?? []).map((a) => a.attr_name.trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));

  const cats = categories.data?.data ?? [];
  const rows = masters.data?.data ?? [];
  const catName = (id: number) => cats.find((c) => c.id === id)?.name ?? `#${id}`;

  const term = search.trim().toLowerCase();
  const shown = term
    ? rows.filter((m) =>
        [m.attr_name, catName(m.category_id), ...m.values.map((v) => v.value_name)]
          .join(' ')
          .toLowerCase()
          .includes(term),
      )
    : rows;

  const save = async () => {
    if (!form.category_id) return toast.error('Choose the category this attribute belongs to.');
    if (!form.attr_name.trim()) return toast.error('Give the attribute a name.');
    if (!form.values.length) return toast.error('A master needs at least one value.');

    setBusy(true);
    try {
      const body = {
        category_id: Number(form.category_id),
        attr_name: form.attr_name.trim(),
        values: form.values,
      };
      if (form.id) {
        await api.patch(`/admin/attribute-masters/${form.id}`, body);
        toast.ok('Master list updated.');
      } else {
        await api.post('/admin/attribute-masters', body);
        toast.ok(`${body.attr_name} added to the master list.`);
      }
      setForm(BLANK);
      masters.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.del(`/admin/attribute-masters/${deleting.id}`);
      toast.ok(`${deleting.attr_name} removed from the master list.`);
      setDeleting(null);
      masters.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Panel
        form={form.open && (
          <FormPanel
            title={form.id ? `Edit ${form.attr_name || 'master list'}` : 'Add a master list'}
            onClose={() => setForm(BLANK)}
            onSubmit={save}
            submitLabel={form.id ? 'Save changes' : 'Add master list'}
            busy={busy}
          >
            <TextField
              select
              label="Category"
              value={form.category_id}
              // The attribute list hangs off this, so the name goes with it: a
              // name left over from the previous category is worse than an empty
              // box, because it reads as an answer and matches nothing.
              onChange={(e) => setForm({ ...form, category_id: e.target.value, attr_name: '' })}
              required
              disabled={cats.length === 0}
              helperText="A master belongs to a category, not to a subcategory: the same list serves every subcategory under it."
            >
              {cats.map((c) => (
                <MenuItem key={c.id} value={String(c.id)}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>

            <Autocomplete
              freeSolo
              options={attrNames}
              // Controlled on both halves: `value` is what has been settled on,
              // `inputValue` what is in the box. A freeSolo field that only
              // tracks `value` loses a typed name the moment focus leaves it.
              value={form.attr_name}
              onChange={(_, v) => setForm({ ...form, attr_name: (v as string | null) ?? '' })}
              inputValue={form.attr_name}
              onInputChange={(_, v) => setForm({ ...form, attr_name: v })}
              disabled={!form.category_id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Attribute"
                  placeholder={form.category_id ? 'Choose or type an attribute' : 'Choose a category first'}
                  required
                  autoFocus
                  helperText={
                    !form.category_id
                      ? 'The list of attributes follows the category.'
                      : attrNames.length
                        ? `${attrNames.length} attribute${attrNames.length === 1 ? '' : 's'} under this category. The name has to match, so choosing beats typing.`
                        : 'No attributes under this category yet — type the name this list will be offered under.'
                  }
                />
              )}
            />

            {/*
              Typed, not chosen: a master list is being written here, so there is
              nothing to choose from yet. `freeSolo` with `multiple` is the chip
              field that gives — type a value, press Enter, it becomes a chip.

              The order chips are added in is the order they are stored and later
              offered in. Grades read D, E, F; sorting them alphabetically is the
              one thing nobody wants, and it is what a plain sort would do.
            */}
            <Autocomplete
              multiple
              freeSolo
              options={[] as string[]}
              value={form.values}
              onChange={(_, v) =>
                setForm({
                  ...form,
                  values: (v as string[]).map((one) => one.trim()).filter(Boolean),
                })
              }
              renderValue={(chosen, getProps) =>
                (chosen as string[]).map((value, i) => (
                  <Chip size="small" label={value} {...getProps({ index: i })} key={value} />
                ))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Values"
                  placeholder="Type a value and press Enter"
                  helperText="In the order they should be offered — D, E, F, not alphabetically."
                />
              )}
            />
          </FormPanel>
        )}
        title="Attributes Master"
        count={
          masters.loading ? 'Loading…' : `${shown.length} of ${rows.length} master lists`
        }
        actions={
          <>
            <SearchField
              placeholder="Attribute, category, value…"
              value={search}
              onChange={setSearch}
            />
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setForm({ ...BLANK, open: true })}
            >
              Add master list
            </Button>
          </>
        }
      >
        <TableFrame
          loading={masters.loading}
          error={masters.error}
          empty={shown.length === 0}
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Category</TableCell>
                <TableCell>Attribute</TableCell>
                <TableCell>Values</TableCell>
                <TableCell align="right">Count</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((m) => (
                <TableRow key={m.id} hover>
                  <TableCell>{catName(m.category_id)}</TableCell>
                  <TableCell>{m.attr_name}</TableCell>
                  <TableCell sx={{ whiteSpace: 'normal' }}>
                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                      {m.values.map((v) => (
                        <Chip key={v.id} size="small" label={v.value_name} />
                      ))}
                    </Stack>
                  </TableCell>
                  <TableCell align="right" className="tabular">
                    {m.values.length}
                  </TableCell>
                  <TableCell>
                    <RowActions>
                      <IconAction
                        label="Edit master list"
                        icon={EditIcon}
                        onClick={() =>
                          setForm({
                            open: true,
                            id: m.id,
                            category_id: String(m.category_id),
                            attr_name: m.attr_name,
                            values: m.values.map((v) => v.value_name),
                          })
                        }
                      />
                      <IconAction
                        label="Delete master list"
                        icon={DeleteIcon}
                        danger
                        onClick={() => setDeleting(m)}
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
        title="Delete master list"
        message={
          <>
            Delete the <strong>{deleting?.attr_name}</strong> list under{' '}
            {deleting ? catName(deleting.category_id) : ''}?
          </>
        }
        warning="Only the template goes. Every attribute value already created from it stays exactly where it is."
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        busy={busy}
      />
    </>
  );
}
