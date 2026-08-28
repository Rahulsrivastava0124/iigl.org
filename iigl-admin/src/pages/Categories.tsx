import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Avatar,
  Button,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import { useToast } from '../components/Toast';
import { useFetch } from '../lib/useFetch';
import { fileUrl } from '../lib/config';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import {
  FormPanel,
  IconAction,
  Panel,
  RowActions,
  SearchField,
  TableFrame,
} from '../components/ui';
import type { Category, Subcategory } from '../lib/api';
import AddIcon from '@mui/icons-material/AddOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';

const BLANK_CATEGORY = { open: false, name: '', unit: '', short_description: '' };

interface Unit {
  id: number;
  name: string;
  symbol: string;
}

export default function Categories() {
  const toast = useToast();
  // The menu has a Category entry and a Sub Category entry pointing here, so
  // the URL decides which of the two lists this screen is showing. Showing both
  // would make the two entries the same page.
  const [params] = useSearchParams();
  const showSubs = params.get('tab') === 'sub';

  const categories = useFetch<{ data: Category[] }>('/catalog/categories');
  const subcategories = useFetch<{ data: Subcategory[] }>('/catalog/subcategories');
  const units = useFetch<{ data: Unit[] }>('/catalog/units');

  // One search term per list rather than one shared between them: the two tabs
  // are one component, so a shared term would follow you across and leave the
  // other list looking empty for no visible reason.
  const [catQuery, setCatQuery] = useState('');
  const [subQuery, setSubQuery] = useState('');

  // Which category the subcategory list is narrowed to. Empty is all of them.
  // Local rather than in the URL: the menu deep-links here with `tab`, and a
  // second parameter written alongside it would have to preserve the first.
  const [subCat, setSubCat] = useState('');

  const [busy, setBusy] = useState(false);

  const [catForm, setCatForm] = useState<{
    open: boolean;
    id?: number;
    name: string;
    unit: string;
    short_description: string;
  }>(BLANK_CATEGORY);
  const [subForm, setSubForm] = useState<{
    open: boolean;
    id?: number;
    name: string;
    category_id: string;
    description: string;
  }>({ open: false, name: '', category_id: '', description: '' });

  const saveCategory = async () => {
    setBusy(true);
    try {
      const body = {
        name: catForm.name,
        short_description: catForm.short_description.trim(),
      };
      if (catForm.id) {
        // `unit` only when one is set. The API validates whatever it is sent,
        // so an empty string is a validation error rather than "no change" —
        // which is what made editing a category fail before the form started
        // prefilling the current unit.
        await api.patch(`/admin/categories/${catForm.id}`, {
          ...body,
          ...(catForm.unit ? { unit: catForm.unit } : {}),
        });
        toast.ok('Category updated.');
      } else {
        await api.post('/admin/categories', { ...body, unit: catForm.unit });
        toast.ok(`Category ${catForm.name} added.`);
      }
      setCatForm(BLANK_CATEGORY);
      categories.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const saveSubcategory = async () => {
    setBusy(true);
    try {
      const body = {
        name: subForm.name,
        category_id: Number(subForm.category_id),
        description: subForm.description.trim(),
      };
      if (subForm.id) {
        await api.patch(`/admin/subcategories/${subForm.id}`, body);
        toast.ok('Subcategory updated.');
      } else {
        await api.post('/admin/subcategories', body);
        toast.ok(`Subcategory ${subForm.name} added.`);
      }
      setSubForm({ open: false, name: '', category_id: '', description: '' });
      subcategories.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const cats = categories.data?.data ?? [];
  const allSubs = subcategories.data?.data ?? [];
  const unitName = (id: string | null) => {
    const u = (units.data?.data ?? []).find((x) => String(x.id) === String(id));
    return u ? `${u.name} (${u.symbol})` : '—';
  };

  const catName = (id: number) => cats.find((c) => c.id === id)?.name ?? `#${id}`;

  /** Matches a row against a search term: any of its text, case-insensitive. */
  const matches = (term: string, ...fields: (string | number | null)[]) => {
    const q = term.trim().toLowerCase();
    if (!q) return true;
    return fields.some((f) => f !== null && String(f).toLowerCase().includes(q));
  };

  // `cats` itself stays whole — it is the lookup behind catName and the option
  // list in the subcategory form, and searching a table must not shorten those.
  const shownCats = cats.filter((c) =>
    matches(catQuery, c.id, c.name, c.short_description, unitName(c.unit)),
  );

  const subs = allSubs
    .filter((s) => (subCat ? String(s.category_id) === subCat : true))
    .filter((s) => matches(subQuery, s.id, s.name, s.description, catName(s.category_id)));

  return (
    <>

      {!showSubs && (
      <>
      {/*
        The category form opens above its list rather than over it: it is shown
        on click, not permanently, so the list is not pushed down by a form
        nobody asked for — and once open it leaves the list readable underneath
        while it is filled in.
      */}
      {catForm.open && (
        <FormPanel
          title={catForm.id ? `Edit ${catForm.name || 'category'}` : 'Add a category'}
          onClose={() => setCatForm(BLANK_CATEGORY)}
          onSubmit={saveCategory}
          submitLabel={catForm.id ? 'Save changes' : 'Add category'}
          busy={busy}
        >
          <TextField
            label="Name"
            value={catForm.name}
            onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
            autoFocus
            required
          />
          <TextField
            select
            label="Default weight unit"
            value={catForm.unit}
            onChange={(e) => setCatForm({ ...catForm, unit: e.target.value })}
            required
          >
            <MenuItem value="">Select a unit</MenuItem>
            {(units.data?.data ?? []).map((u) => (
              <MenuItem key={u.id} value={String(u.id)}>
                {u.name} ({u.symbol})
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Short description"
            value={catForm.short_description}
            onChange={(e) => setCatForm({ ...catForm, short_description: e.target.value })}
          />
        </FormPanel>
      )}

      <Panel
        title="Categories"
        count={
          categories.loading ? 'Loading…' : `${shownCats.length} of ${cats.length} categories`
        }
        actions={
          <>
            <SearchField placeholder="Search categories…" value={catQuery} onChange={setCatQuery} />
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setCatForm({ ...BLANK_CATEGORY, open: true })}
            >
              Add category
            </Button>
          </>
        }
      >
        <TableFrame
          loading={categories.loading}
          error={categories.error}
          empty={shownCats.length === 0}
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Id</TableCell>
                <TableCell sx={{ width: 56 }}>Icon</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Weight unit</TableCell>
                <TableCell>Short description</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {shownCats.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell className="mono">#{c.id}</TableCell>
                  <TableCell>
                    {/*
                      Avatar rather than a bare <img>: it renders its children
                      when the file is missing, and every icon here was uploaded
                      by the Laravel application, so some of the files are gone.
                    */}
                    <Avatar
                      variant="rounded"
                      src={fileUrl(c.icon) ?? undefined}
                      alt=""
                      sx={{ width: 36, height: 36, bgcolor: 'action.hover', color: 'text.secondary', fontSize: 14 }}
                    >
                      {c.name.charAt(0)}
                    </Avatar>
                  </TableCell>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>{unitName(c.unit)}</TableCell>
                  <TableCell sx={{ whiteSpace: 'normal', minWidth: 220 }}>
                    {c.short_description ?? '—'}
                  </TableCell>
                  <TableCell>
                    <RowActions>
                      <IconAction
                        label="Edit category"
                        icon={EditIcon}
                        onClick={() =>
                          setCatForm({
                            open: true,
                            id: c.id,
                            name: c.name,
                            unit: c.unit ?? '',
                            short_description: c.short_description ?? '',
                          })
                        }
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
      )}

      {showSubs && (
      <>
      {subForm.open && (
        <FormPanel
          title={subForm.id ? 'Edit subcategory' : 'Add subcategory'}
          onClose={() => setSubForm({ open: false, name: '', category_id: '', description: '' })}
          onSubmit={saveSubcategory}
          submitLabel={subForm.id ? 'Save changes' : 'Add subcategory'}
          busy={busy}
        >
          <TextField
            label="Name"
            value={subForm.name}
            onChange={(e) => setSubForm({ ...subForm, name: e.target.value })}
            required
          />
          <TextField
            select
            label="Category"
            value={subForm.category_id}
            onChange={(e) => setSubForm({ ...subForm, category_id: e.target.value })}
            required
          >
            {cats.map((c) => (
              <MenuItem key={c.id} value={String(c.id)}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Description"
            value={subForm.description}
            onChange={(e) => setSubForm({ ...subForm, description: e.target.value })}
            multiline
            minRows={2}
            sx={{ gridColumn: '1 / -1' }}
          />
        </FormPanel>
      )}

      <Panel
        title="Subcategories"
        count={
          subcategories.loading
            ? 'Loading…'
            : `${subs.length} of ${allSubs.length} subcategories`
        }
        actions={
          <>
            <SearchField
              placeholder="Search subcategories…"
              value={subQuery}
              onChange={setSubQuery}
            />
            <TextField
              select
              label="Category"
              value={subCat}
              onChange={(e) => setSubCat(e.target.value)}
              sx={{ width: 200 }}
              disabled={cats.length === 0}
            >
              <MenuItem value="">All categories</MenuItem>
              {cats.map((c) => (
                <MenuItem key={c.id} value={String(c.id)}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() =>
                setSubForm({
                  open: true,
                  name: '',
                  // The category the list is filtered to: the next subcategory
                  // entered almost always belongs to the same one as the last.
                  category_id: subCat || String(cats[0]?.id ?? ''),
                  description: '',
                })
              }
            >
              Add subcategory
            </Button>
          </>
        }
      >
        <TableFrame
          loading={subcategories.loading}
          error={subcategories.error}
          empty={subs.length === 0}
        >
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Id</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Description</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {subs.map((s) => (
                <TableRow key={s.id} hover>
                  <TableCell className="mono">#{s.id}</TableCell>
                  <TableCell>{s.name}</TableCell>
                  <TableCell>{catName(s.category_id)}</TableCell>
                  <TableCell sx={{ whiteSpace: 'normal', minWidth: 220 }}>
                    {s.description?.trim() ? s.description : '—'}
                  </TableCell>
                  <TableCell>
                    <RowActions>
                      <IconAction
                        label="Edit subcategory"
                        icon={EditIcon}
                        onClick={() =>
                          setSubForm({
                            open: true,
                            id: s.id,
                            name: s.name,
                            category_id: String(s.category_id),
                            description: s.description ?? '',
                          })
                        }
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
      )}
    </>
  );
}
