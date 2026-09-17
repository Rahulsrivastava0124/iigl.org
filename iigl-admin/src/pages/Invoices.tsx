import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/AddOutlined';
import CloseIcon from '@mui/icons-material/CloseOutlined';
import MoreIcon from '@mui/icons-material/MoreVertOutlined';
import InvoiceIcon from '@mui/icons-material/ReceiptLongOutlined';
import PayIcon from '@mui/icons-material/PaymentsOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import { Panel, TableFrame, money } from '../components/ui';
import { useDebounced, useFetch } from '../lib/useFetch';
import { api, type Lab, type Paged, type Transaction } from '../lib/api';
import { messageOf, useAuth } from '../lib/auth';
import { isSuper } from '../lib/portal';
import { useToast } from '../components/Toast';

/**
 * Purchase and sales invoices.
 *
 * Purchase is every account's; sales is head office's alone — a laboratory sees
 * only the tab it has. Each row is one line — the party, product, tax number,
 * date, quantity, rate, how it was paid, and the total. A purchase spends: it
 * moves the account's wallet down by what was paid, kept level as it is paid or
 * edited. A sale touches no wallet.
 *
 * A row's own controls open its printable invoice and record a payment while
 * anything is due; its menu edits or removes it.
 */

type Kind = 'purchase' | 'sales';

interface Invoice {
  id: number;
  party_name: string;
  product_name: string;
  gst_no: string | null;
  invoice_date: string;
  quantity: string;
  rate: string;
  amount: string;
  paid_amount: string;
  payment_method: string | null;
}

const PAYMENT_METHODS = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card'] as const;

const today = () => new Date().toISOString().slice(0, 10);
const due = (r: Invoice) => Math.max(0, Number(r.amount) - Number(r.paid_amount));

const blank = () => ({
  party: '',
  product: '',
  gst: '',
  date: today(),
  quantity: '',
  rate: '',
  paid: '',
  payment: '',
});

const fromRow = (r: Invoice) => ({
  party: r.party_name,
  product: r.product_name,
  gst: r.gst_no ?? '',
  date: String(r.invoice_date).slice(0, 10),
  quantity: String(Number(r.quantity)),
  rate: String(Number(r.rate)),
  paid: String(Number(r.paid_amount)),
  payment: r.payment_method ?? '',
});

/** A printable invoice, opened in its own window. */
function printInvoice(r: Invoice, kind: Kind) {
  const label = kind === 'purchase' ? 'Purchase' : 'Sales';
  const prefix = kind === 'purchase' ? 'PUR' : 'SAL';
  const party = kind === 'purchase' ? 'Supplier' : 'Customer';
  const rows: [string, string][] = [
    ['Invoice No.', `${prefix}-${r.id}`],
    ['Date', String(r.invoice_date).slice(0, 10)],
    [party, r.party_name],
    ['GST No.', r.gst_no || '—'],
    ['Product', r.product_name],
    ['Quantity', String(Number(r.quantity))],
    ['Rate', money(r.rate)],
    ['Payment', r.payment_method || '—'],
    ['Total', money(r.amount)],
    ['Paid', money(r.paid_amount)],
    ['Due', money(due(r))],
  ];
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${label} Invoice ${prefix}-${r.id}</title>
    <style>
      body{font-family:Arial,Helvetica,sans-serif;color:#1b2440;margin:40px}
      h1{font-size:22px;margin:0 0 2px}.sub{color:#6b7285;font-size:13px;margin:0 0 24px}
      table{border-collapse:collapse;width:100%;max-width:520px}
      td{padding:9px 12px;border-bottom:1px solid #e6e8ee;font-size:14px}
      td:first-child{color:#6b7285;width:40%}td:last-child{font-weight:600;text-align:right}
      tr:last-child td{border-bottom:2px solid #1b2440}
    </style></head><body>
    <h1>IIGL — ${label} Invoice</h1><p class="sub">${prefix}-${r.id}</p>
    <table>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
    <script>window.onload=function(){window.print()}</script>
    </body></html>`;
  const w = window.open('', '_blank', 'width=680,height=800');
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

export default function Invoices() {
  const toast = useToast();
  const { user } = useAuth();
  const admin = isSuper(user);

  // The tab lives in the URL. Sales is head office's alone; a laboratory is held
  // to Purchase whatever the address says.
  const [params, setParams] = useSearchParams();
  const kind: Kind = admin && params.get('tab') === 'sales' ? 'sales' : 'purchase';
  const resource = kind === 'purchase' ? 'purchases' : 'sales';
  const base = `/invoices/${resource}`;
  const party = kind === 'purchase' ? 'Supplier' : 'Customer';

  const [form, setForm] = useState(blank());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  const [supplierQ, setSupplierQ] = useState('');
  const [productQ, setProductQ] = useState('');
  const supplier = useDebounced(supplierQ);
  const product = useDebounced(productQ);

  const [menu, setMenu] = useState<{ el: HTMLElement; row: Invoice } | null>(null);
  const [payFor, setPayFor] = useState<Invoice | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [paying, setPaying] = useState(false);
  const [supplierView, setSupplierView] = useState<string | null>(null);

  const query = new URLSearchParams({ per_page: '100' });
  if (supplier.trim()) query.set('supplier', supplier.trim());
  if (product.trim()) query.set('product', product.trim());
  const list = useFetch<Paged<Invoice>>(`${base}?${query}`);
  const rows = list.data?.data ?? [];

  // Every name and product on record, for the filter dropdowns — read unfiltered
  // so the options do not shrink as a filter narrows the list.
  const pool = useFetch<Paged<Invoice>>(`${base}?per_page=500`);
  const stock = useFetch<Paged<Invoice>>(kind === 'sales' ? '/invoices/purchases?per_page=500' : null);
  const uniq = (vals: (string | null)[]) =>
    [...new Set(vals.filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b));
  const poolRows = pool.data?.data ?? [];
  const supplierOptions = useMemo(() => uniq(poolRows.map((r) => r.party_name)), [pool.data]);
  const supplierFilteredRows =
    kind === 'purchase' && supplierQ.trim()
      ? poolRows.filter((r) => r.party_name === supplierQ.trim())
      : poolRows;
  const productOptions = useMemo(
    () => uniq(supplierFilteredRows.map((r) => r.product_name)),
    [pool.data, supplierQ, kind],
  );
  const productSourceRows =
    kind === 'sales'
      ? stock.data?.data ?? []
      : form.party.trim()
        ? poolRows.filter((r) => r.party_name === form.party.trim())
        : poolRows;
  const stockProductOptions = uniq(productSourceRows.map((r) => r.product_name));

  // On a sale the customer is one of head office's laboratories: the list picks
  // the name and the laboratory's own GST fills in with it.
  const labs = useFetch<{ data: Lab[] }>(kind === 'sales' ? '/users/laboratories' : null);
  const labList = labs.data?.data ?? [];
  const labForParty = useMemo(
    () => labList.find((l) => l.fullname === form.party) ?? null,
    [form.party, labList],
  );
  const supplierHistory = useFetch<Paged<Invoice>>(
    supplierView
      ? `/invoices/purchases?supplier=${encodeURIComponent(supplierView)}&per_page=100`
      : null,
  );
  const supplierTransactions = useFetch<Paged<Transaction>>(
    supplierView
      ? `/transactions?type=expense&q=${encodeURIComponent(supplierView)}&per_page=100`
      : null,
  );
  const supplierPurchases = supplierHistory.data?.data ?? [];
  const supplierTxns = supplierTransactions.data?.data ?? [];

  const set = (key: keyof ReturnType<typeof blank>, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const setSaleLab = (lab: Lab | null) => {
    setForm((f) => ({
      ...f,
      party: lab?.fullname ?? '',
      gst: lab?.gst_no ?? '',
    }));
  };

  const setSupplierChoice = (name: string) => {
    const found = (pool.data?.data ?? []).find((r) => r.party_name === name);
    setForm((f) => ({
      ...f,
      party: name,
      gst: name === '' ? '' : found?.gst_no ?? '',
    }));
  };

  const setProductChoice = (name: string) => {
    const found = productSourceRows.find((r) => r.product_name === name);
    setForm((f) => ({
      ...f,
      product: name,
      ...(name === '' ? { rate: '' } : found ? { rate: String(Number(found.rate)) } : {}),
    }));
  };

  const totals = useMemo(() => {
    const amount = rows.reduce((n, r) => n + Number(r.amount), 0);
    const paid = rows.reduce((n, r) => n + Number(r.paid_amount), 0);
    const qty = rows.reduce((n, r) => n + Number(r.quantity), 0);
    return { amount, paid, due: amount - paid, qty };
  }, [rows]);

  const setTab = (next: Kind) => {
    setShowForm(false);
    setEditingId(null);
    setSupplierView(null);
    setParams(next === 'sales' ? { tab: 'sales' } : {});
  };

  const openAdd = () => {
    setEditingId(null);
    setForm(blank());
    setShowForm(true);
  };

  const openEdit = (r: Invoice) => {
    setEditingId(r.id);
    setForm(fromRow(r));
    setShowForm(true);
    setMenu(null);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        party_name: form.party.trim(),
        product_name: form.product.trim(),
        gst_no: form.gst.trim() || null,
        invoice_date: form.date,
        quantity: Number(form.quantity) || 0,
        rate: Number(form.rate) || 0,
        paid_amount: form.paid === '' ? null : Number(form.paid),
        payment_method: form.payment || null,
      };
      if (editingId) await api.put(`${base}/${editingId}`, body);
      else await api.post(base, body);
      setForm(blank());
      setEditingId(null);
      setShowForm(false);
      await list.reload();
      pool.reload();
      toast.ok(editingId ? 'Invoice updated.' : `${party === 'Supplier' ? 'Purchase' : 'Sale'} added.`);
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: Invoice) => {
    setMenu(null);
    try {
      await api.del(`${base}/${r.id}`);
      await list.reload();
      pool.reload();
      toast.ok('Invoice removed.');
    } catch (err) {
      toast.error(messageOf(err));
    }
  };

  const openPay = (r: Invoice) => {
    setPayFor(r);
    setPayAmount(String(due(r)));
    setMenu(null);
  };

  const submitPay = async () => {
    if (!payFor) return;
    setPaying(true);
    try {
      await api.post(`${base}/${payFor.id}/pay`, { amount: Number(payAmount) || 0 });
      setPayFor(null);
      await list.reload();
      pool.reload();
      toast.ok('Payment recorded.');
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setPaying(false);
    }
  };

  const cell = { xs: 12, sm: 6, md: 4 } as const;
  const live = Number(form.quantity) && Number(form.rate) ? Number(form.quantity) * Number(form.rate) : 0;
  const filterControls = (
    <>
      {/* Pick from the names and products on record. The first row clears it. */}
      <TextField
        select
        size="small"
        label={`Filter by ${party.toLowerCase()}`}
        value={supplierQ}
        onChange={(e) => setSupplierQ(e.target.value)}
        sx={{ width: { xs: '100%', sm: 210 } }}
      >
        <MenuItem value="">
          <em>All {party.toLowerCase()}s</em>
        </MenuItem>
        {supplierOptions.map((o) => (
          <MenuItem key={o} value={o}>
            {o}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        select
        size="small"
        label="Filter by product"
        value={productQ}
        onChange={(e) => setProductQ(e.target.value)}
        sx={{ width: { xs: '100%', sm: 210 } }}
      >
        <MenuItem value="">
          <em>All products</em>
        </MenuItem>
        {productOptions.map((o) => (
          <MenuItem key={o} value={o}>
            {o}
          </MenuItem>
        ))}
      </TextField>
    </>
  );

  return (
    <Panel
      title={`${kind === 'purchase' ? 'Purchase' : 'Sales'} Invoices`}
      actions={
        !showForm ? (
          <>
            {!admin && filterControls}
            <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
              Add {kind === 'purchase' ? 'Purchase' : 'Sale'}
            </Button>
          </>
        ) : null
      }
    >
      {admin && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexWrap: 'wrap',
            borderBottom: 1,
            borderColor: 'divider',
            px: 2,
          }}
        >
          <Tabs value={kind} onChange={(_, v) => setTab(v as Kind)} sx={{ minHeight: 48 }}>
            <Tab value="purchase" label="Purchase" />
            <Tab value="sales" label="Sales" />
          </Tabs>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ py: 1.25, ml: 'auto' }}>
            {filterControls}
          </Stack>
        </Box>
      )}

      {showForm && (
        <Box component="form" onSubmit={save} sx={{ p: 2 }}>
          <Grid container spacing={2}>
            <Grid size={cell}>
              {kind === 'sales' ? (
                <Autocomplete
                  size="small"
                  fullWidth
                  options={labList}
                  loading={labs.loading}
                  value={labForParty}
                  inputValue={form.party}
                  getOptionKey={(option) => option.id}
                  getOptionLabel={(option) => option.fullname}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                  onChange={(_, value) => setSaleLab(value)}
                  onInputChange={(_, value, reason) => {
                    if (reason !== 'input') return;
                    setForm((f) => ({ ...f, party: value, gst: '' }));
                  }}
                  renderInput={(params) => (
                    <TextField {...params} label={`${party} Name`} required />
                  )}
                />
              ) : (
                <Autocomplete
                  freeSolo
                  size="small"
                  fullWidth
                  openOnFocus
                  options={supplierOptions}
                  inputValue={form.party}
                  onInputChange={(_, value, reason) => {
                    if (reason !== 'input') return;
                    setForm((f) => ({ ...f, party: value, gst: '' }));
                  }}
                  onChange={(_, value) => setSupplierChoice(value ?? '')}
                  renderInput={(params) => (
                    <TextField {...params} label={`${party} Name`} required />
                  )}
                />
              )}
            </Grid>
            <Grid size={cell}>
              <Autocomplete
                freeSolo
                size="small"
                fullWidth
                openOnFocus
                options={stockProductOptions}
                inputValue={form.product}
                onInputChange={(_, value) => set('product', value)}
                onChange={(_, value) => setProductChoice(value ?? '')}
                loading={kind === 'sales' ? stock.loading : pool.loading}
                noOptionsText={kind === 'sales' ? 'No purchased stock items' : 'No products yet'}
                renderInput={(params) => <TextField {...params} label="Product Name" required />}
              />
            </Grid>
            <Grid size={cell}>
              <TextField label="GST No." value={form.gst} onChange={(e) => set('gst', e.target.value.toUpperCase())} />
            </Grid>
            <Grid size={cell}>
              <TextField
                label="Date"
                type="date"
                value={form.date}
                onChange={(e) => set('date', e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                required
              />
            </Grid>
            <Grid size={cell}>
              <TextField
                label="Quantity"
                type="number"
                value={form.quantity}
                onChange={(e) => set('quantity', e.target.value)}
                slotProps={{ htmlInput: { min: 0, step: 1 } }}
                required
              />
            </Grid>
            <Grid size={cell}>
              <TextField
                label="Amount (rate)"
                type="number"
                value={form.rate}
                onChange={(e) => set('rate', e.target.value)}
                slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
                required
              />
            </Grid>
            <Grid size={cell}>
              <TextField
                select
                label="Payment Method"
                value={form.payment}
                onChange={(e) => set('payment', e.target.value)}
                required
              >
                {PAYMENT_METHODS.map((m) => (
                  <MenuItem key={m} value={m}>
                    {m}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={cell}>
              <TextField
                label="Paid Amount"
                type="number"
                value={form.paid}
                onChange={(e) => set('paid', e.target.value)}
                placeholder={live ? String(live) : ''}
                helperText="Blank = paid in full"
                slotProps={{ htmlInput: { min: 0, step: '0.01' } }}
              />
            </Grid>
            <Grid size={cell}>
              <TextField label="Total Amount" value={live ? money(live) : ''} disabled />
            </Grid>
          </Grid>

          <Stack direction="row" spacing={2} sx={{ mt: 2, justifyContent: 'flex-end' }}>
            <Button
              variant="outlined"
              startIcon={<CloseIcon />}
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
              }}
            >
              Close
            </Button>
            <Button variant="contained" type="submit" disabled={busy} startIcon={<AddIcon />}>
              {busy ? 'Saving…' : editingId ? 'Save changes' : `Save ${kind === 'purchase' ? 'Purchase' : 'Sale'}`}
            </Button>
          </Stack>
        </Box>
      )}

      <TableFrame
        loading={list.loading}
        error={list.error}
        empty={rows.length === 0}
        emptyText={`No ${kind === 'purchase' ? 'purchase' : 'sales'} invoice found.`}
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{party}</TableCell>
              <TableCell>Product</TableCell>
              <TableCell>GST No.</TableCell>
              <TableCell>Date</TableCell>
              <TableCell align="right">Qty</TableCell>
              <TableCell align="right">Rate</TableCell>
              <TableCell>Payment</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell align="right">Paid</TableCell>
              <TableCell align="right">Due</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell>
                  {kind === 'purchase' && r.party_name ? (
                    <Box
                      component="button"
                      type="button"
                      onClick={() => setSupplierView(r.party_name)}
                      sx={{
                        p: 0,
                        border: 0,
                        background: 'none',
                        color: 'primary.main',
                        cursor: 'pointer',
                        font: 'inherit',
                        textAlign: 'left',
                        '&:hover': { textDecoration: 'underline' },
                      }}
                    >
                      {r.party_name}
                    </Box>
                  ) : (
                    r.party_name || '—'
                  )}
                </TableCell>
                <TableCell>{r.product_name || '—'}</TableCell>
                <TableCell className="mono">{r.gst_no || '—'}</TableCell>
                <TableCell>{String(r.invoice_date).slice(0, 10)}</TableCell>
                <TableCell align="right" className="tabular">
                  {Number(r.quantity)}
                </TableCell>
                <TableCell align="right" className="tabular">
                  {money(r.rate)}
                </TableCell>
                <TableCell>{r.payment_method || '—'}</TableCell>
                <TableCell align="right" className="tabular">
                  {money(r.amount)}
                </TableCell>
                <TableCell align="right" className="tabular">
                  {money(r.paid_amount)}
                </TableCell>
                <TableCell
                  align="right"
                  className="tabular"
                  sx={{ color: due(r) > 0 ? 'error.main' : 'text.secondary' }}
                >
                  {money(due(r))}
                </TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                  <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                    <Tooltip title="Open invoice">
                      <IconButton size="small" onClick={() => printInvoice(r, kind)}>
                        <InvoiceIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {due(r) > 0 && (
                      <Tooltip title={`Pay ${money(due(r))} due`}>
                        <IconButton size="small" color="primary" onClick={() => openPay(r)}>
                          <PayIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="More">
                      <IconButton
                        size="small"
                        onClick={(e) => setMenu({ el: e.currentTarget, row: r })}
                        aria-label="More actions"
                      >
                        <MoreIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
            {rows.length > 0 && (
              <TableRow sx={{ '& td': { fontWeight: 700, borderTop: 2, borderColor: 'divider' } }}>
                <TableCell colSpan={4}>Total</TableCell>
                <TableCell align="right" className="tabular">
                  {totals.qty}
                </TableCell>
                <TableCell colSpan={2} />
                <TableCell align="right" className="tabular">
                  {money(totals.amount)}
                </TableCell>
                <TableCell align="right" className="tabular">
                  {money(totals.paid)}
                </TableCell>
                <TableCell align="right" className="tabular">
                  {money(totals.due)}
                </TableCell>
                <TableCell />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableFrame>

      {/* Edit and delete; Invoice and Pay are on the row itself. */}
      <Menu anchorEl={menu?.el ?? null} open={Boolean(menu)} onClose={() => setMenu(null)}>
        {kind === 'purchase' && menu?.row.party_name && (
          <MenuItem
            onClick={() => {
              setSupplierView(menu.row.party_name);
              setMenu(null);
            }}
          >
            <ListItemIcon>
              <InvoiceIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Supplier history</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={() => menu && openEdit(menu.row)}>
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edit</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => menu && remove(menu.row)} sx={{ color: 'error.main' }}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" sx={{ color: 'error.main' }} />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>

      <Dialog open={Boolean(payFor)} onClose={() => setPayFor(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Record a payment</DialogTitle>
        <DialogContent>
          {payFor && (
            <Stack spacing={2} sx={{ mt: 0.5 }}>
              <TextField label={party} value={payFor.party_name} disabled />
              <TextField label="Due" value={money(due(payFor))} disabled />
              <TextField
                label="Amount to pay"
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                slotProps={{ htmlInput: { min: 0, max: due(payFor), step: '0.01' } }}
                autoFocus
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPayFor(null)}>Cancel</Button>
          <Button variant="contained" onClick={submitPay} disabled={paying || !(Number(payAmount) > 0)}>
            {paying ? 'Paying…' : 'Pay'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(supplierView)} onClose={() => setSupplierView(null)} maxWidth="lg" fullWidth>
        <DialogTitle>{supplierView ? `${supplierView} history` : 'Supplier history'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Box>
              <Typography variant="h2" sx={{ mb: 1 }}>
                Purchase history
              </Typography>
              <TableFrame
                loading={supplierHistory.loading}
                error={supplierHistory.error}
                empty={supplierPurchases.length === 0}
                emptyText="No purchases found for this supplier."
              >
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell>Product</TableCell>
                      <TableCell align="right">Qty</TableCell>
                      <TableCell align="right">Rate</TableCell>
                      <TableCell align="right">Total</TableCell>
                      <TableCell align="right">Paid</TableCell>
                      <TableCell align="right">Due</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {supplierPurchases.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{String(p.invoice_date).slice(0, 10)}</TableCell>
                        <TableCell>{p.product_name || '—'}</TableCell>
                        <TableCell align="right" className="tabular">
                          {Number(p.quantity)}
                        </TableCell>
                        <TableCell align="right" className="tabular">
                          {money(p.rate)}
                        </TableCell>
                        <TableCell align="right" className="tabular">
                          {money(p.amount)}
                        </TableCell>
                        <TableCell align="right" className="tabular">
                          {money(p.paid_amount)}
                        </TableCell>
                        <TableCell
                          align="right"
                          className="tabular"
                          sx={{ color: due(p) > 0 ? 'error.main' : 'text.secondary' }}
                        >
                          {money(due(p))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableFrame>
            </Box>

            <Box>
              <Typography variant="h2" sx={{ mb: 1 }}>
                Transaction history
              </Typography>
              <TableFrame
                loading={supplierTransactions.loading}
                error={supplierTransactions.error}
                empty={supplierTxns.length === 0}
                emptyText="No purchase transactions found for this supplier."
              >
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell>Remark</TableCell>
                      <TableCell>Mode</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Amount</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {supplierTxns.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>{t.created_at ? String(t.created_at).slice(0, 10) : '—'}</TableCell>
                        <TableCell>{t.remark || '—'}</TableCell>
                        <TableCell>{t.pay_mode || '—'}</TableCell>
                        <TableCell>{t.status === 1 ? 'Approved' : t.status === 2 ? 'Declined' : 'Pending'}</TableCell>
                        <TableCell align="right" className="tabular">
                          {money(t.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableFrame>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSupplierView(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Panel>
  );
}
