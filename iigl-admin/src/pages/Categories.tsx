import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import AddIcon from '@mui/icons-material/AddOutlined';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { Dialog, IconAction, Notice, PageHead, Panel, RowActions, TableFrame } from '../components/ui';
import type { Category, Subcategory } from '../lib/api';
import EditIcon from '@mui/icons-material/EditOutlined';

interface Unit {
  id: number;
  name: string;
  symbol: string;
}

export default function Categories() {
  // The menu has a Category entry and a Sub Category entry pointing here, so
  // the URL decides which of the two lists this screen is showing. Showing both
  // would make the two entries the same page.
  const [params] = useSearchParams();
  const showSubs = params.get('tab') === 'sub';

  const categories = useFetch<{ data: Category[] }>('/catalog/categories');
  const subcategories = useFetch<{ data: Subcategory[] }>('/catalog/subcategories');
  const units = useFetch<{ data: Unit[] }>('/catalog/units');

  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [catForm, setCatForm] = useState<{ open: boolean; id?: number; name: string; unit: string }>({
    open: false,
    name: '',
    unit: '',
  });
  const [subForm, setSubForm] = useState<{
    open: boolean;
    id?: number;
    name: string;
    category_id: string;
  }>({ open: false, name: '', category_id: '' });

  const saveCategory = async () => {
    setBusy(true);
    setErr(null);
    try {
      if (catForm.id) {
        await api.patch(`/admin/categories/${catForm.id}`, { name: catForm.name, unit: catForm.unit });
        setMsg('Category updated.');
      } else {
        await api.post('/admin/categories', { name: catForm.name, unit: catForm.unit });
        setMsg(`Category ${catForm.name} added.`);
      }
      setCatForm({ open: false, name: '', unit: '' });
      categories.reload();
    } catch (e) {
      setErr(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const saveSubcategory = async () => {
    setBusy(true);
    setErr(null);
    try {
      const body = { name: subForm.name, category_id: Number(subForm.category_id) };
      if (subForm.id) {
        await api.patch(`/admin/subcategories/${subForm.id}`, body);
        setMsg('Subcategory updated.');
      } else {
        await api.post('/admin/subcategories', body);
        setMsg(`Subcategory ${subForm.name} added.`);
      }
      setSubForm({ open: false, name: '', category_id: '' });
      subcategories.reload();
    } catch (e) {
      setErr(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const cats = categories.data?.data ?? [];
  const subs = subcategories.data?.data ?? [];
  const catName = (id: number) => cats.find((c) => c.id === id)?.name ?? `#${id}`;

  return (
    <>
      <PageHead
        title={showSubs ? 'Subcategories' : 'Categories'}
        subtitle={
          showSubs
            ? 'The divisions within a category. A certificate is built from a subcategory.'
            : 'What the laboratory tests, and how each item is described.'
        }
      />

      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="error">{err}</Notice>}

      {!showSubs && (
      <Panel
        title="Categories"
        actions={
          <Button
            size="small"
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCatForm({ open: true, name: '', unit: '' })}
          >
            Add category
          </Button>
        }
      >
        <TableFrame loading={categories.loading} error={categories.error} empty={cats.length === 0}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Id</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Short description</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {cats.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell className="mono">#{c.id}</TableCell>
                  <TableCell>{c.name}</TableCell>
                  <TableCell sx={{ whiteSpace: 'normal', minWidth: 220 }}>
                    {c.short_description ?? '—'}
                  </TableCell>
                  <TableCell>
                    <RowActions>
                      <IconAction
                        label="Edit category"
                        icon={EditIcon}
                        onClick={() => setCatForm({ open: true, id: c.id, name: c.name, unit: '' })}
                      />
                    </RowActions>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      </Panel>
      )}

      {showSubs && (
      <Panel
        actions={
          <Button
            size="small"
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() =>
              setSubForm({ open: true, name: '', category_id: String(cats[0]?.id ?? '') })
            }
          >
            Add subcategory
          </Button>
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
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {subs.map((s) => (
                <TableRow key={s.id} hover>
                  <TableCell className="mono">#{s.id}</TableCell>
                  <TableCell>{s.name}</TableCell>
                  <TableCell>{catName(s.category_id)}</TableCell>
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
      )}

      {catForm.open && (
        <Dialog
          title={catForm.id ? 'Edit category' : 'Add category'}
          onClose={() => setCatForm({ open: false, name: '', unit: '' })}
          onSubmit={saveCategory}
          busy={busy}
        >
          <Stack spacing={2}>
            <TextField
              label="Name"
              value={catForm.name}
              onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
              required
            />
            <TextField
              select
              label="Default weight unit"
              value={catForm.unit}
              onChange={(e) => setCatForm({ ...catForm, unit: e.target.value })}
              required={!catForm.id}
              helperText={catForm.id ? 'Leave blank to keep the current unit.' : undefined}
            >
              <MenuItem value="">Select a unit</MenuItem>
              {(units.data?.data ?? []).map((u) => (
                <MenuItem key={u.id} value={u.id}>
                  {u.name} ({u.symbol})
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </Dialog>
      )}

      {subForm.open && (
        <Dialog
          title={subForm.id ? 'Edit subcategory' : 'Add subcategory'}
          onClose={() => setSubForm({ open: false, name: '', category_id: '' })}
          onSubmit={saveSubcategory}
          busy={busy}
        >
          <Stack spacing={2}>
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
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </Dialog>
      )}
    </>
  );
}
