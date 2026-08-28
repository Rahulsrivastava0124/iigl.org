import { useState, useEffect } from 'react';
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
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/AddOutlined';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { Dialog, IconAction, Notice, PageHead, Panel, RowActions, TableFrame, money } from '../components/ui';
import type { Category, Lab, Price } from '../lib/api';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlineOutlined';

const BLANK = {
  open: false,
  id: undefined as number | undefined,
  category_id: '',
  min_wt: '0',
  max_wt: '',
  smart_price: '',
  classic_price: '',
};

export default function Pricing() {
  const [params] = useSearchParams();
  const [scope, setScope] = useState('standard');

  // "Price list for Laboratory" in the sidebar opens on the first laboratory
  // rather than on the standard rates.
  const wantsLab = params.get('scope') === 'laboratory';
  const categories = useFetch<{ data: Category[] }>('/catalog/categories');
  const labs = useFetch<{ data: Lab[] }>('/users/laboratories');
  const prices = useFetch<{ data: Price[] }>(`/admin/prices?lab_id=${scope}`);

  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const first = labs.data?.data[0];
    if (wantsLab && first && scope === 'standard') setScope(String(first.id));
    if (!wantsLab && scope !== 'standard') setScope('standard');
  }, [wantsLab, labs.data]);

  const cats = categories.data?.data ?? [];
  const rows = prices.data?.data ?? [];
  const catName = (id: string) => cats.find((c) => String(c.id) === String(id))?.name ?? `#${id}`;

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const body = {
        min_wt: Number(form.min_wt),
        max_wt: Number(form.max_wt),
        smart_price: Number(form.smart_price),
        classic_price: Number(form.classic_price),
      };
      if (form.id) {
        await api.patch(`/admin/prices/${form.id}`, body);
        setMsg('Price band updated.');
      } else {
        await api.post('/admin/prices', {
          ...body,
          category_id: Number(form.category_id),
          lab_id: scope === 'standard' ? null : Number(scope),
        });
        setMsg('Price band added.');
      }
      setForm(BLANK);
      prices.reload();
    } catch (e) {
      setErr(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: Price) => {
    setErr(null);
    try {
      await api.del(`/admin/prices/${p.id}`);
      setMsg('Price band removed.');
      prices.reload();
    } catch (e) {
      setErr(messageOf(e));
    }
  };

  return (
    <>
      <PageHead
        title="Pricing"
        subtitle="A certificate is priced by the band its carat weight falls into. A laboratory band wins over the standard one."
        action={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() =>
              setForm({ ...BLANK, open: true, category_id: String(cats[0]?.id ?? '') })
            }
          >
            Add band
          </Button>
        }
      />

      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="error">{err}</Notice>}

      <Panel
        actions={
          <TextField
            select
            label="Rates for"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            sx={{ minWidth: 250 }}
          >
            <MenuItem value="standard">Standard (all laboratories)</MenuItem>
            {(labs.data?.data ?? []).map((l) => (
              <MenuItem key={l.id} value={l.id}>
                {l.fullname}
              </MenuItem>
            ))}
          </TextField>
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
                      <IconAction label="Delete band" icon={DeleteIcon} danger onClick={() => remove(p)} />
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

      {form.open && (
        <Dialog
          title={form.id ? 'Edit price band' : 'Add price band'}
          onClose={() => setForm(BLANK)}
          onSubmit={save}
          busy={busy}
        >
          <Stack spacing={2}>
            {!form.id && (
              <TextField
                select
                label="Category"
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                required
              >
                {cats.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <Stack direction="row" spacing={2}>
              <TextField
                label="From (carat)"
                type="number"
                value={form.min_wt}
                onChange={(e) => setForm({ ...form, min_wt: e.target.value })}
                slotProps={{ htmlInput: { min: 0, step: 0.001 } }}
                required
              />
              <TextField
                label="To (carat)"
                type="number"
                value={form.max_wt}
                onChange={(e) => setForm({ ...form, max_wt: e.target.value })}
                slotProps={{ htmlInput: { min: 0, step: 0.001 } }}
                required
              />
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField
                label="Smart card price"
                type="number"
                value={form.smart_price}
                onChange={(e) => setForm({ ...form, smart_price: e.target.value })}
                slotProps={{ htmlInput: { min: 0 } }}
                required
              />
              <TextField
                label="Classic card price"
                type="number"
                value={form.classic_price}
                onChange={(e) => setForm({ ...form, classic_price: e.target.value })}
                slotProps={{ htmlInput: { min: 0 } }}
                required
              />
            </Stack>
          </Stack>
        </Dialog>
      )}
    </>
  );
}
