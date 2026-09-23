import { useMemo, useState } from 'react';
import { Link as RouterLink, useParams, useSearchParams } from 'react-router-dom';
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
import ViewIcon from '@mui/icons-material/VisibilityOutlined';
import BackIcon from '@mui/icons-material/ArrowBackOutlined';
import PayIcon from '@mui/icons-material/PaymentsOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import { Panel, TableFrame, money } from '../components/ui';
import { apiUrl } from '../lib/config';
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
  /**
   * Whose row it is.
   *
   * `sale` is head office's sale to this laboratory, listed here as the
   * purchase it also is. It belongs to the seller: this side reads it and
   * prints it, and cannot edit, pay or delete it.
   */
  source?: 'purchase' | 'sale';
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

/**
 * The printable invoice, on the company letterhead.
 *
 * Rendered by the API — the same head every other document prints on — rather
 * than drawn here, so a purchase or sales bill carries the company block a tax
 * invoice and a fee statement do. A head office sale a laboratory sees as its
 * own purchase (`source: 'sale'`) prints from the sales row it belongs to.
 */
function printInvoice(r: Invoice, kind: Kind) {
  const resource = r.source === 'sale' || kind === 'sales' ? 'sales' : 'purchases';
  window.open(apiUrl(`/invoices/${resource}/${r.id}/document`), '_blank', 'noopener');
}

export default function Invoices() {
  const toast = useToast();
  const { user } = useAuth();
  const admin = isSuper(user);

  // The tab lives in the URL. Sales is head office's alone; a laboratory is held
  // to Purchase whatever the address says.
  const [params, setParams] = useSearchParams();
  /*
    One supplier's own page, at /invoices/supplier/<name>.

    The same screen: the list is simply held to that supplier, and every row
    control — the invoice, the payment, edit, delete — is the one it already
    had. Purchases are what a supplier has; the tabs are not offered here.
  */
  const { name: supplierParam } = useParams();
  const viewing = supplierParam ? decodeURIComponent(supplierParam) : null;
  const kind: Kind = !viewing && admin && params.get('tab') === 'sales' ? 'sales' : 'purchase';
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

  const query = new URLSearchParams({ per_page: '100' });
  if (viewing) query.set('supplier', viewing);
  else if (supplier.trim()) query.set('supplier', supplier.trim());
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
  // What has actually been paid out to them, beside what was bought.
  const supplierTransactions = useFetch<Paged<Transaction>>(
    viewing ? `/transactions?type=expense&q=${encodeURIComponent(viewing)}&per_page=100` : null,
  );
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

  /*
    The purchase list is a list of suppliers, not of lines.

    A supplier buying the same printer every month filled the screen with the
    same name; what the list is read for is who is supplied from, what they
    supply, and what is still owed them. The lines themselves are on their own
    page, which is also the only place they can be paid or corrected.

    Folded from the rows already fetched, so the supplier and product filters
    above narrow this exactly as they narrow the lines.
  */
  const suppliers = useMemo(() => {
    const by = new Map<
      string,
      { name: string; gst: string | null; products: string[]; lines: number; amount: number; paid: number }
    >();
    for (const r of rows) {
      const name = r.party_name || '—';
      const seen = by.get(name) ?? { name, gst: r.gst_no, products: [], lines: 0, amount: 0, paid: 0 };
      if (r.product_name && !seen.products.includes(r.product_name)) seen.products.push(r.product_name);
      seen.gst = seen.gst || r.gst_no;
      seen.lines += 1;
      seen.amount += Number(r.amount);
      seen.paid += Number(r.paid_amount);
      by.set(name, seen);
    }
    return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const totals = useMemo(() => {
    const amount = rows.reduce((n, r) => n + Number(r.amount), 0);
    const paid = rows.reduce((n, r) => n + Number(r.paid_amount), 0);
    const qty = rows.reduce((n, r) => n + Number(r.quantity), 0);
    return { amount, paid, due: amount - paid, qty };
  }, [rows]);

  const setTab = (next: Kind) => {
    setShowForm(false);
    setEditingId(null);
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
      title={viewing ?? `${kind === 'purchase' ? 'Purchase' : 'Sales'} Invoices`}
      subtitle={viewing ? 'Supplier' : undefined}
      actions={
        !showForm ? (
          <>
            {viewing ? (
              <Button variant="outlined" startIcon={<BackIcon />} component={RouterLink} to="/invoices">
                All suppliers
              </Button>
            ) : (
              !admin && filterControls
            )}
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                openAdd();
                // Opened from a supplier's own page: it is their purchase.
                if (viewing) setForm((f) => ({ ...f, party: viewing }));
              }}
            >
              Add {kind === 'purchase' ? 'Purchase' : 'Sale'}
            </Button>
          </>
        ) : null
      }
    >
      {admin && !viewing && (
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

      {/* The purchase list, folded to one row a supplier. Their lines are on
          their own page, reached from here. */}
      {kind === 'purchase' && !viewing ? (
        <TableFrame
          loading={list.loading}
          error={list.error}
          empty={suppliers.length === 0}
          emptyText="No supplier has been purchased from yet."
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Supplier</TableCell>
                <TableCell>Products</TableCell>
                <TableCell>GST No.</TableCell>
                <TableCell align="right">Purchases</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell align="right">Paid</TableCell>
                <TableCell align="right">Due</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {suppliers.map((sup) => {
                const owed = Math.max(0, sup.amount - sup.paid);
                return (
                  <TableRow key={sup.name} hover>
                    <TableCell sx={{ whiteSpace: 'normal', minWidth: 150 }}>
                      <Box
                        component={RouterLink}
                        to={`/invoices/supplier/${encodeURIComponent(sup.name)}`}
                        sx={{
                          color: 'primary.main',
                          fontWeight: 600,
                          textDecoration: 'none',
                          '&:hover': { textDecoration: 'underline' },
                        }}
                      >
                        {sup.name}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'normal', minWidth: 180 }}>
                      {sup.products.join(', ') || '—'}
                    </TableCell>
                    <TableCell className="mono">{sup.gst || '—'}</TableCell>
                    <TableCell align="right" className="tabular">
                      {sup.lines}
                    </TableCell>
                    <TableCell align="right" className="tabular">
                      {money(sup.amount)}
                    </TableCell>
                    <TableCell align="right" className="tabular">
                      {money(sup.paid)}
                    </TableCell>
                    <TableCell
                      align="right"
                      className="tabular"
                      sx={{ fontWeight: 600, color: owed > 0 ? 'error.main' : 'text.secondary' }}
                    >
                      {money(owed)}
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<ViewIcon />}
                        component={RouterLink}
                        to={`/invoices/supplier/${encodeURIComponent(sup.name)}`}
                        sx={{ whiteSpace: 'nowrap' }}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableFrame>
      ) : (
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
              <TableRow key={`${r.source ?? 'purchase'}-${r.id}`} hover>
                <TableCell>
                  {kind === 'purchase' && r.party_name && !viewing ? (
                    <Box
                      component={RouterLink}
                      to={`/invoices/supplier/${encodeURIComponent(r.party_name)}`}
                      sx={{
                        color: 'primary.main',
                        textDecoration: 'none',
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
                    {/* Head office's own row: read it and print it, nothing more. */}
                    {r.source !== 'sale' && due(r) > 0 && (
                      <Tooltip title={`Pay ${money(due(r))} due`}>
                        <IconButton size="small" color="primary" onClick={() => openPay(r)}>
                          <PayIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                    {r.source !== 'sale' && (
                      <Tooltip title="More">
                        <IconButton
                          size="small"
                          onClick={(e) => setMenu({ el: e.currentTarget, row: r })}
                          aria-label="More actions"
                        >
                          <MoreIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
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
      )}

      {/* What has been paid out to this supplier, beside what was bought. */}
      {viewing && (
        <Box sx={{ p: 2, pt: 3 }}>
          <Typography variant="h2" sx={{ mb: 1 }}>
            Payment history
          </Typography>
          <TableFrame
            loading={supplierTransactions.loading}
            error={supplierTransactions.error}
            empty={supplierTxns.length === 0}
            emptyText="Nothing has been paid out to this supplier yet."
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
                  <TableRow key={t.id} hover>
                    <TableCell>{t.created_at ? String(t.created_at).slice(0, 10) : '—'}</TableCell>
                    <TableCell sx={{ whiteSpace: 'normal', minWidth: 180 }}>{t.remark || '—'}</TableCell>
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
      )}

      {/* Edit and delete; Invoice and Pay are on the row itself. */}
      <Menu anchorEl={menu?.el ?? null} open={Boolean(menu)} onClose={() => setMenu(null)}>
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

    </Panel>
  );
}
