import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Autocomplete,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  FormGroup,
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
import FileField from '../components/FileField';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import {
  ConfirmDialog,
  FormPanel,
  IconAction,
  DEFAULT_PER_PAGE, Pager,
  Panel,
  RowActions,
  SearchField,
  TableFrame,
  YesNo,
} from '../components/ui';
import type { Attribute, Category, PageMeta, Subcategory } from '../lib/api';
import type { AttributeMaster } from './AttributeMaster';
import AddIcon from '@mui/icons-material/AddOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';
import ValuesIcon from '@mui/icons-material/ListAltOutlined';
import RetireIcon from '@mui/icons-material/Inventory2Outlined';

interface AttributeValue {
  id: number;
  value_name: string;
  description: string | null;
  icon: string | null;
  attr_id: number;
  subcategory_id: number;
  category_id: number;
}

/** Add and edit share one form, the way the attribute form does. */
const BLANK_VALUE = {
  open: false,
  id: undefined as number | undefined,
  /*
    Several at once when adding, one when renaming.

    A grade scale is seven values and the old form took them one at a time,
    with the branch re-chosen on every pass. Editing stays single because it
    renames one row — there is no such thing as renaming seven at once.
  */
  names: [] as string[],
  value_name: '',
  description: '',
  icon: null as string | null,
};

const BLANK = {
  open: false,
  id: undefined as number | undefined,
  attr_name: '',
  order_no: '0',
  show_in_smart_card: true,
  show_in_classic_card: true,
  show_description: false,
  show_image: false,
  is_opensource: false,
  is_required: false,
  category_id: '',
  subcategory_id: '',
};

export default function Attributes() {
  const toast = useToast();
  const categories = useFetch<{ data: Category[] }>('/catalog/categories');
  const cats = categories.data?.data ?? [];
  const [catId, setCatId] = useState<string>('');

  // Every subcategory is fetched once and narrowed here rather than refetched
  // per category: the list is short, and filtering in place keeps the two
  // selects in step without a request between picking a category and seeing
  // the subcategories under it.
  const subcategories = useFetch<{ data: Subcategory[] }>('/catalog/subcategories');
  const allSubs = subcategories.data?.data ?? [];
  const [subId, setSubId] = useState<string>('');

  // Nothing is picked for the user: both selects start empty and the tables say
  // so, rather than quietly showing the first subcategory's attributes as if
  // they were the whole catalogue.
  const chosenCat = catId;
  const subs = allSubs.filter((s) => String(s.category_id) === chosenCat);

  // A category on its own lists every attribute beneath it; the subcategory
  // select only narrows that further.
  const chosen = subId;
  const attributes = useFetch<{ data: Attribute[] }>(
    chosen
      ? `/catalog/subcategories/${chosen}/attributes`
      : chosenCat
        ? `/catalog/categories/${chosenCat}/attributes`
        : null,
  );
  const rows = chosenCat ? (attributes.data?.data ?? []) : [];

  // `rows` stays whole — it also backs the attribute picker in values mode and
  // the `picked` default below, neither of which a table search should narrow.
  const [search, setSearch] = useState('');
  const shownRows = rows.filter((a) => {
    const q = search.trim().toLowerCase();
    return !q || String(a.attr_name).toLowerCase().includes(q) || String(a.id).includes(q);
  });

  const [attrId, setAttrId] = useState('');

  // The menu's Attribute Values entry opens this screen on the values instead
  // of the attributes: the attribute is picked from a select and its values are
  // listed on the page rather than in a dialog.
  const [params, setParams] = useSearchParams();
  const valuesMode = params.get('tab') === 'values';
  const pickPrompt = chosenCat ? undefined : 'Select a category.';

  // Values narrow to the deepest filter set: one attribute, else the whole
  // subcategory, else the whole category. 3,899 of them sit under a single
  // category, so the list is paged rather than poured onto the screen.
  const [page, setPage] = useState(1);
  /** Rows per page. Component state, not a URL parameter: it is how somebody
   * likes to read a list, not which list they are looking at. */
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const valuesQuery = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (attrId) valuesQuery.set('attr_id', attrId);
  else if (chosen) valuesQuery.set('subcategory_id', chosen);
  else if (chosenCat) valuesQuery.set('category_id', chosenCat);

  const values = useFetch<{ data: AttributeValue[]; meta: PageMeta }>(
    (valuesMode && chosenCat) || attrId ? `/catalog/attribute-values?${valuesQuery}` : null,
  );
  const valueRows = values.data?.data ?? [];

  /*
    The master list for this category, and what it offers for the attribute in
    hand.

    Matched on the attribute's **name**, not its id: a master belongs to a
    category and the attribute belongs to a subcategory below it, which is the
    whole point — one "Colour" list serving every subcategory that grades
    colour. An attribute with no master offers nothing, and the field is then
    exactly the free-text box it was before.
  */
  const masters = useFetch<{ data: AttributeMaster[] }>(
    chosenCat ? `/catalog/attribute-masters?category_id=${chosenCat}` : null,
  );
  const attrName = rows.find((a) => String(a.id) === attrId)?.attr_name ?? '';
  const masterValues =
    (masters.data?.data ?? [])
      .find((m) => m.attr_name.toLowerCase() === attrName.toLowerCase())
      ?.values.map((v) => v.value_name) ?? [];
  // What this attribute already carries, so the list does not offer it again.
  const alreadyHeld = new Set(
    valueRows
      .filter((v) => String(v.attr_id) === attrId)
      .map((v) => v.value_name.toLowerCase()),
  );

  const nameOf = {
    category: (id: number) => cats.find((c) => c.id === id)?.name ?? '—',
    subcategory: (id: number) => allSubs.find((x) => x.id === id)?.name ?? '—',
    attribute: (id: number) => rows.find((a) => a.id === id)?.attr_name ?? '—',
  };

  // Renaming a value: the only edit the old screen offered, and the only one
  // the API accepts.
  const [valueForm, setValueForm] = useState(BLANK_VALUE);

  const [form, setForm] = useState(BLANK);
  // A form belongs to the table it was opened on: switching between attributes
  // and values closes both. Only the tab — the forms set the category and
  // attribute selects themselves, so keying on those would close them mid-edit.
  useEffect(() => {
    setForm(BLANK);
    setValueForm(BLANK_VALUE);
  }, [valuesMode]);
  const [retiring, setRetiring] = useState<Attribute | null>(null);
  const [busy, setBusy] = useState(false);

  const sub = subs.find((s) => String(s.id) === chosen);
  const cat = cats.find((c) => String(c.id) === chosenCat);

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        attr_name: form.attr_name,
        order_no: Number(form.order_no) || 0,
        show_in_smart_card: form.show_in_smart_card,
        show_in_classic_card: form.show_in_classic_card,
        show_description: form.show_description,
        show_image: form.show_image,
        is_opensource: form.is_opensource,
        is_required: form.is_required,
      };
      const branch = {
        category_id: Number(form.category_id),
        subcategory_id: Number(form.subcategory_id),
      };
      if (form.id) {
        await api.patch(`/admin/attributes/${form.id}`, { ...body, ...branch });
        toast.ok('Attribute updated.');
      } else {
        await api.post('/admin/attributes', { ...body, ...branch });
        toast.ok(`${form.attr_name} added.`);
      }
      // Follow the row: an attribute moved to another branch, or added to one
      // you were not looking at, would otherwise vanish on save.
      setCatId(form.category_id);
      if (chosen) setSubId(form.subcategory_id);
      setForm(BLANK);
      attributes.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const retire = async () => {
    if (!retiring) return;
    setBusy(true);
    try {
      await api.del(`/admin/attributes/${retiring.id}`);
      toast.ok(`${retiring.attr_name} retired. Certificates already issued keep their values.`);
      setRetiring(null);
      attributes.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const saveValue = async () => {
    if (!attrId) return toast.error('Choose the attribute this value belongs to.');
    setBusy(true);
    try {
      if (valueForm.id) {
        if (!valueForm.value_name.trim()) return;
        await api.patch(`/admin/attribute-values/${valueForm.id}`, {
          attr_id: Number(attrId),
          value_name: valueForm.value_name.trim(),
          description: valueForm.description.trim(),
          icon: valueForm.icon,
        });
        toast.ok('Value updated.');
      } else {
        if (!valueForm.names.length) return toast.error('Choose or type at least one value.');
        /*
          One request for the whole list. Sent to the bulk endpoint rather than
          looped here: a name the attribute already carries is skipped there,
          where a loop would create the first four, refuse the fifth and leave
          somebody to work out which of the seven landed.
        */
        const { data } = await api.post<{ data: { added: number; skipped: number } }>(
          '/admin/attribute-values/bulk',
          { attr_id: Number(attrId), values: valueForm.names },
        );
        // A description or a picture applies to each of them, and the bulk
        // endpoint deliberately takes neither — so they are written after, and
        // only when there is something to write.
        const extra = {
          ...(valueForm.description.trim() ? { description: valueForm.description.trim() } : {}),
          ...(valueForm.icon ? { icon: valueForm.icon } : {}),
        };
        if (Object.keys(extra).length && data.added) {
          const fresh = await api.get<{ data: AttributeValue[] }>(
            `/catalog/attribute-values?attr_id=${attrId}&per_page=200`,
          );
          const chosen = new Set(valueForm.names.map((n) => n.toLowerCase()));
          await Promise.all(
            fresh.data
              .filter((v) => chosen.has(v.value_name.toLowerCase()))
              .map((v) => api.patch(`/admin/attribute-values/${v.id}`, extra)),
          );
        }
        toast.ok(
          data.skipped
            ? `${data.added} added, ${data.skipped} already there.`
            : `${data.added} value${data.added === 1 ? '' : 's'} added.`,
        );
      }
      setValueForm(BLANK_VALUE);
      values.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Category narrows the subcategory list, and the subcategory is what the
   * attributes hang off. Changing either clears the chosen subcategory or
   * attribute below it, so the page cannot go on showing something from the
   * branch just left.
   *
   * Every `MenuItem` value is a string, and it has to stay one. Material UI
   * hands the chosen item's value straight back through `e.target.value`,
   * which TypeScript types as `string` whatever was actually put there — so a
   * numeric id compiles and then fails at runtime against the `String(x) ===`
   * comparisons below, which is what emptied the subcategory list the moment a
   * category was picked.
   */
  const branchFilters = (width?: number) => (
    <>
      <TextField
        select
        label="Category"
        value={chosenCat}
        onChange={(e) => {
          setCatId(e.target.value);
          setSubId('');
          setAttrId('');
          setPage(1);
        }}
        sx={{ width }}
        disabled={cats.length === 0}
      >
        {cats.map((c) => (
          <MenuItem key={c.id} value={String(c.id)}>
            {c.name}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        label="Subcategory"
        value={chosen}
        onChange={(e) => {
          setSubId(e.target.value);
          setAttrId('');
          setPage(1);
        }}
        sx={{ width }}
        disabled={subs.length === 0}
      >
        {subs.map((s) => (
          <MenuItem key={s.id} value={String(s.id)}>
            {s.name}
          </MenuItem>
        ))}
      </TextField>
    </>
  );

  const check = (key: keyof typeof BLANK, label: string) => (
    <FormControlLabel
      control={
        <Checkbox
          size="small"
          checked={Boolean(form[key])}
          onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
        />
      }
      label={label}
      slotProps={{ typography: { sx: { fontSize: 13.5 } } }}
    />
  );

  return (
    <>

      {valuesMode ? (
        <>
        <Panel
          form={valueForm.open && (
            <FormPanel
              title={valueForm.id ? 'Edit value' : 'Add value'}
              onClose={() => setValueForm(BLANK_VALUE)}
              onSubmit={saveValue}
              submitLabel={
                valueForm.id
                  ? 'Save changes'
                  : valueForm.names.length > 1
                    ? `Add ${valueForm.names.length} values`
                    : 'Add value'
              }
              busy={busy}
            >
              {branchFilters()}
              <TextField
                select
                label="Attribute"
                value={attrId}
                onChange={(e) => {
                  setAttrId(e.target.value);
                  setPage(1);
                }}
                required
                disabled={rows.length === 0}
              >
                {rows.map((a) => (
                  <MenuItem key={a.id} value={String(a.id)}>
                    {a.attr_name}
                  </MenuItem>
                ))}
              </TextField>
              {valueForm.id ? (
                <TextField
                  label="Value"
                  value={valueForm.value_name}
                  onChange={(e) => setValueForm({ ...valueForm, value_name: e.target.value })}
                  required
                  autoFocus
                />
              ) : (
                /*
                  Pick several from the master list, or type ones that are not on
                  it — `freeSolo`, so the field is still the free-text box it was
                  for an attribute no master covers.

                  Values this attribute already carries are filtered out of the
                  options rather than shown and refused: the list is there so
                  nobody has to check first.
                */
                <Autocomplete
                  multiple
                  freeSolo
                  options={masterValues.filter((v) => !alreadyHeld.has(v.toLowerCase()))}
                  value={valueForm.names}
                  onChange={(_, v) =>
                    setValueForm({
                      ...valueForm,
                      names: (v as string[]).map((one) => one.trim()).filter(Boolean),
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
                      placeholder={
                        masterValues.length
                          ? 'Choose from the master list, or type your own'
                          : 'Type a value and press Enter'
                      }
                      autoFocus
                      helperText={
                        !attrId
                          ? 'Choose an attribute first.'
                          : masterValues.length
                            ? `${masterValues.length} on the master list for ${attrName}.`
                            : `No master list for ${attrName || 'this attribute'} \u2014 type the values, or build one under Attributes Master.`
                      }
                    />
                  )}
                />
              )}
              <TextField
                label="Description"
                value={valueForm.description}
                onChange={(e) => setValueForm({ ...valueForm, description: e.target.value })}
                helperText={valueForm.id ? undefined : 'Applies to every value added here. Usually left empty when adding several.'}
              />
              <FileField
                label="Image"
                bucket="icon"
                value={valueForm.icon}
                onChange={(icon) => setValueForm({ ...valueForm, icon })}
              />
            </FormPanel>
          )}
          footer={<Pager meta={values.data?.meta} onPage={setPage} onPerPage={(n) => {
            setPerPage(n);
            setPage(1);
          }} />}
          title="Attribute values"
          actions={
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
              {branchFilters(220)}
              <TextField
                select
                label="Attribute"
                value={attrId}
                onChange={(e) => {
                  setAttrId(e.target.value);
                  setPage(1);
                }}
                sx={{ width: 220 }}
                disabled={rows.length === 0}
              >
                <MenuItem value="">All attributes</MenuItem>
                {rows.map((a) => (
                  <MenuItem key={a.id} value={String(a.id)}>
                    {a.attr_name}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setValueForm({ ...BLANK_VALUE, open: true })}
              >
                Add value
              </Button>
            </Stack>
          }
          count={
            values.data
              ? `${values.data.meta.total.toLocaleString()} values`
              : (pickPrompt ?? 'Loading…')
          }
        >
          <TableFrame
            loading={values.loading}
            error={values.error}
            empty={valueRows.length === 0}
            emptyText={pickPrompt}
          >
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 90 }}>#</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Subcategory</TableCell>
                  <TableCell>Attribute</TableCell>
                  <TableCell>Value</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {valueRows.map((v) => (
                  <TableRow key={v.id} hover>
                    <TableCell className="mono">#{v.id}</TableCell>
                    <TableCell>{nameOf.category(v.category_id)}</TableCell>
                    <TableCell>{nameOf.subcategory(v.subcategory_id)}</TableCell>
                    <TableCell>{nameOf.attribute(v.attr_id)}</TableCell>
                    <TableCell>{v.value_name}</TableCell>
                    <TableCell>
                      <RowActions>
                        <IconAction
                          label="Edit value"
                          icon={EditIcon}
                          onClick={() => {
                            setCatId(String(v.category_id));
                            setSubId(String(v.subcategory_id));
                            setAttrId(String(v.attr_id));
                            setValueForm({
                              open: true,
                              id: v.id,
                              names: [],
                              value_name: v.value_name,
                              description: v.description ?? '',
                              icon: v.icon,
                            });
                          }}
                        />
                      </RowActions>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        </Panel>
        </>
      ) : (
      <>
      <Panel
        form={form.open && (
          <FormPanel
            title={form.id ? 'Edit attribute' : 'Add attribute'}
            onClose={() => setForm(BLANK)}
            onSubmit={save}
            submitLabel={form.id ? 'Save changes' : 'Add attribute'}
            busy={busy}
          >
            <TextField
              select
              label="Category"
              value={form.category_id}
              onChange={(e) => {
                setForm({ ...form, category_id: e.target.value, subcategory_id: '' });
                // While adding, the pair doubles as the page filter. While
                // editing it must not: the row would filter itself out of the
                // list the moment you moved it.
                if (!form.id) {
                  setCatId(e.target.value);
                  setSubId('');
                }
              }}
              required
            >
              {cats.map((c) => (
                <MenuItem key={c.id} value={String(c.id)}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Subcategory"
              value={form.subcategory_id}
              onChange={(e) => {
                setForm({ ...form, subcategory_id: e.target.value });
                if (!form.id) setSubId(e.target.value);
              }}
              required
              disabled={!form.category_id}
            >
              {allSubs
                .filter((s) => String(s.category_id) === form.category_id)
                .map((s) => (
                  <MenuItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </MenuItem>
                ))}
            </TextField>
            <TextField
              label="Name"
              value={form.attr_name}
              onChange={(e) => setForm({ ...form, attr_name: e.target.value })}
              required
            />
            <TextField
              label="Print order"
              type="number"
              value={form.order_no}
              onChange={(e) => setForm({ ...form, order_no: e.target.value })}
              slotProps={{ htmlInput: { min: 0 } }}
            />
            <FormGroup row sx={{ gap: 2, gridColumn: '1 / -1' }}>
              {check('show_in_smart_card', 'Show on smart card')}
              {check('show_in_classic_card', 'Show on classic card')}
              {check('show_description', 'Description / comment box')}
              {check('show_image', 'Upload image')}
              {check('is_opensource', 'Accept free text')}
              {check('is_required', 'Required')}
            </FormGroup>
          </FormPanel>
        )}
        title="Attributes"
        count={
          pickPrompt
            ? pickPrompt
            : attributes.loading
              ? 'Loading…'
              : `${shownRows.length} of ${rows.length} in ${sub?.name ?? cat?.name ?? 'this category'}`
        }
        actions={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
            <SearchField
              placeholder="Attribute name…"
              value={search}
              onChange={setSearch}
              width={200}
            />
            {branchFilters(220)}
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() =>
                setForm({ ...BLANK, open: true, category_id: chosenCat, subcategory_id: chosen })
              }
            >
              Add attribute
            </Button>
          </Stack>
        }
      >
        <TableFrame
          loading={attributes.loading}
          error={attributes.error}
          empty={shownRows.length === 0}
          emptyText={pickPrompt}
        >
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell align="right">Order</TableCell>
                <TableCell>Name</TableCell>
                {!chosen && <TableCell>Subcategory</TableCell>}
                <TableCell>Smart card</TableCell>
                <TableCell>Classic card</TableCell>
                <TableCell>Desc / comment</TableCell>
                <TableCell>Upload image</TableCell>
                <TableCell>Free text</TableCell>
                <TableCell>Required</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {shownRows.map((a) => (
                <TableRow key={a.id} hover>
                  <TableCell align="right" className="tabular">
                    {a.order_no}
                  </TableCell>
                  <TableCell>{a.attr_name}</TableCell>
                  {!chosen && (
                    <TableCell>
                      {allSubs.find((x) => x.id === a.subcategory_id)?.name ?? '—'}
                    </TableCell>
                  )}
                  <TableCell>
                    <YesNo on={a.show_in_smart_card} />
                  </TableCell>
                  <TableCell>
                    <YesNo on={a.show_in_classic_card} />
                  </TableCell>
                  <TableCell>
                    <YesNo on={a.show_description} />
                  </TableCell>
                  <TableCell>
                    <YesNo on={a.show_image} />
                  </TableCell>
                  <TableCell>
                    <YesNo on={a.is_opensource} />
                  </TableCell>
                  <TableCell>
                    <YesNo on={a.is_required} />
                  </TableCell>
                  <TableCell>
                    <RowActions>
                      <IconAction
                        label="Edit attribute"
                        icon={EditIcon}
                        onClick={() =>
                          setForm({
                            open: true,
                            id: a.id,
                            attr_name: a.attr_name,
                            // Never `String(null)`: the column is nullable, and
                            // the word "null" in the box is what gets saved back.
                            order_no: a.order_no == null ? '' : String(a.order_no),
                            category_id: String(a.category_id),
                            subcategory_id: String(a.subcategory_id),
                            show_in_smart_card: Boolean(a.show_in_smart_card),
                            show_in_classic_card: Boolean(a.show_in_classic_card),
                            show_description: Boolean(a.show_description),
                            show_image: Boolean(a.show_image),
                            is_opensource: Boolean(a.is_opensource),
                            is_required: Boolean(a.is_required),
                          })
                        }
                      />
                      <IconAction
                        label="Values"
                        icon={ValuesIcon}
                        onClick={() => {
                          setAttrId(String(a.id));
                          setParams({ tab: 'values' });
                        }}
                      />
                      <IconAction label="Retire" icon={RetireIcon} danger onClick={() => setRetiring(a)} />
                    </RowActions>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      </Panel>
      </>
      )}

      <ConfirmDialog
        open={Boolean(retiring)}
        title="Retire Attribute"
        message={<>Are you sure you want to retire <strong>{retiring?.attr_name}</strong>?</>}
        warning="Certificates already issued keep their values."
        onClose={() => setRetiring(null)}
        onConfirm={retire}
        confirmLabel="Retire"
        confirmIcon={RetireIcon}
        busy={busy}
      />
    </>
  );
}
