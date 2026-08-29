import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
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
  money,
} from '../components/ui';

/** True when the row's text contains the term. Case-insensitive; blank matches all. */
const hits = (term: string, ...fields: (string | number | null | undefined)[]) => {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f != null && String(f).toLowerCase().includes(q));
};

import type { Category, Lab, Price } from '../lib/api';
import AddIcon from '@mui/icons-material/AddOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlineOutlined';

// No `open`: the form is a panel on the page, empty to add and filled to edit.
const BLANK = {
  open: false,
  id: undefined as number | undefined,
  category_id: '',
  min_wt: '0',
  max_wt: '',
  smart_price: '',
  classic_price: '',
};

type PriceWithCategory = Price & { category_name?: string };

export default function Pricing() {
  const toast = useToast();
  const [params] = useSearchParams();
  const [scope, setScope] = useState('standard');

  // "Price list for Laboratory" in the sidebar opens on the first laboratory
  // rather than on the standard rates.
  const wantsLab = params.get('scope') === 'laboratory';
  const categories = useFetch<{ data: Category[] }>('/catalog/categories');
  const labs = useFetch<{ data: Lab[] }>('/users/laboratories');
  const prices = useFetch<{ data: Price[] }>(`/admin/prices?lab_id=${scope}`);

  const [form, setForm] = useState(BLANK);
  const [deleting, setDeleting] = useState<PriceWithCategory | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const first = labs.data?.data[0];
    if (wantsLab && first && scope === 'standard') setScope(String(first.id));
    if (!wantsLab && scope !== 'standard') setScope('standard');
  }, [wantsLab, labs.data]);

  const cats = categories.data?.data ?? [];
  const allPrices = prices.data?.data ?? [];
  const [search, setSearch] = useState('');
  const catName = (id: string) => cats.find((c) => String(c.id) === String(id))?.name ?? `#${id}`;
  // Filtered after catName exists, so a search on the category name works even
  // though the row itself only carries the id.
  const rows = allPrices.filter((p) =>
    hits(search, catName(p.category_id), p.min_wt, p.max_wt, p.smart_price, p.classic_price),
  );

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        min_wt: Number(form.min_wt),
        max_wt: Number(form.max_wt),
        smart_price: Number(form.smart_price),
        classic_price: Number(form.classic_price),
      };
      if (form.id) {
        await api.patch(`/admin/prices/${form.id}`, body);
        toast.ok('Price band updated.');
      } else {
        await api.post('/admin/prices', {
          ...body,
          category_id: Number(form.category_id),
          lab_id: scope === 'standard' ? null : Number(scope),
        });
        toast.ok('Price band added.');
      }
      setForm(BLANK);
      prices.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.del(`/admin/prices/${deleting.id}`);
      toast.ok('Price band removed.');
      setDeleting(null);
      prices.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>

      {form.open && (
        <FormPanel
          title={form.id ? 'Edit price band' : 'Add price band'}
          onClose={() => setForm(BLANK)}
          onSubmit={save}
          submitLabel={form.id ? 'Save changes' : 'Add band'}
          busy={busy}
        >
          <TextField
          select
          label="Category"
          value={form.category_id}
          onChange={(e) => setForm({ ...form, category_id: e.target.value })}
          // The band's category is fixed once it exists: moving a band between
          // categories is a delete and an add, not an edit, because the
          // overlap it has to not create is inside one category.
          disabled={Boolean(form.id)}
          required
        >
          {cats.map((c) => (
            <MenuItem key={c.id} value={String(c.id)}>
              {c.name}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ gridColumn: { sm: 'span 2' }, display: 'flex', gap: 2 }}>
          <TextField
            label="From (carat)"
            type="number"
            value={form.min_wt}
            onChange={(e) => setForm({ ...form, min_wt: e.target.value })}
            slotProps={{ htmlInput: { min: 0, step: 0.001 } }}
            sx={{ flex: 1 }}
            required
          />
          <TextField
            label="To (carat)"
            type="number"
            value={form.max_wt}
            onChange={(e) => setForm({ ...form, max_wt: e.target.value })}
            slotProps={{ htmlInput: { min: 0, step: 0.001 } }}
            sx={{ flex: 1 }}
            required
          />
        </Box>
        <TextField
          label="Smart card price"
          type="number"
          value={form.smart_price}
          onChange={(e) => setForm({ ...form, smart_price: e.target.value })}
          slotProps={{ htmlInput: { min: 0, style: { width: '100%' } } }}
          sx={{ minWidth: 150 }}
          required
        />
        <TextField
          label="Classic card price"
          type="number"
          value={form.classic_price}
          onChange={(e) => setForm({ ...form, classic_price: e.target.value })}
          slotProps={{ htmlInput: { min: 0, style: { width: '100%' } } }}
          sx={{ minWidth: 150 }}
          required
        />
        </FormPanel>
      )}

      <Panel
        title="Pricing"
        count={prices.loading ? 'Loading…' : `${rows.length} of ${allPrices.length} bands`}
        actions={
          <>
            <SearchField placeholder="Category or weight…" value={search} onChange={setSearch} />
            <TextField
              select
              label="Rates for"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              sx={{ width: 250 }}
            >
              <MenuItem value="standard">Standard (all laboratories)</MenuItem>
              {(labs.data?.data ?? []).map((l) => (
                <MenuItem key={l.id} value={l.id}>
                  {l.fullname}
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() =>
                setForm({ ...BLANK, open: true, category_id: String(cats[0]?.id ?? '') })
              }
            >
              Add band
            </Button>
          </>
        }
      >
        <TableFrame loading={prices.loading} error={prices.error} empty={rows.length === 0}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Category</TableCell>
                <TableCell align="right">From</TableCell>
                <TableCell align="right">To</TableCell>
                <TableCell align="right">Smart card</TableCell>
                <TableCell align="right">Classic card</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id} hover>
                  <TableCell>{catName(p.category_id)}</TableCell>
                  <TableCell align="right" className="tabular">
                    {p.min_wt}
                  </TableCell>
                  <TableCell align="right" className="tabular">
                    {p.max_wt}
                  </TableCell>
                  <TableCell align="right" className="tabular">
                    {money(p.smart_price)}
                  </TableCell>
                  <TableCell align="right" className="tabular">
                    {money(p.classic_price)}
                  </TableCell>
                  <TableCell>
                    <RowActions>
                      <IconAction
                        label="Edit band"
                        icon={EditIcon}
                        onClick={() =>
                          setForm({
                            open: true,
                            id: p.id,
                            category_id: String(p.category_id),
                            min_wt: String(p.min_wt),
                            max_wt: String(p.max_wt),
                            smart_price: String(p.smart_price),
                            classic_price: String(p.classic_price),
                          })
                        }
                      />
                      <IconAction
                        label="Delete band"
                        icon={DeleteIcon}
                        danger
                        onClick={() => setDeleting({ ...p, category_name: catName(p.category_id) })}
                      />
                    </RowActions>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      </Panel>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        A band covers weights from its lower bound up to but not including its upper bound. Bands
        may not overlap — a weight matching two bands would be priced by whichever row happened to
        be created first.
      </Typography>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Price Band"
        message={
          <>
            Delete the price band for <strong>{deleting?.category_name}</strong> ({deleting?.min_wt}–{deleting?.max_wt} carat)?
          </>
        }
        warning="This action cannot be undone."
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        confirmLabel="Delete"
        confirmIcon={DeleteIcon}
        busy={busy}
      />
    </>
  );
}
