import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Grid,
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
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/AddOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import { Panel, TableFrame, money, IconAction, RowActions } from '../components/ui';

/**
 * Invoices — purchase and sales on one page, a tab each.
 *
 * The two are the same shape: who it is with, what the line is, the tax number,
 * the date, how many, the rate, how it was paid, and the total the first two
 * make. Purchase is with a supplier, sales with a customer; nothing else
 * differs, so one form drives both.
 *
 * Not yet wired to the API — there is no purchases/sales table behind it. Rows
 * are held in the page for now, so the screen can be used and reviewed while the
 * endpoint is built. A refresh clears them.
 */

type Kind = 'purchase' | 'sales';

interface Line {
  id: number;
  /** Supplier on a purchase, customer on a sale. */
  party: string;
  product: string;
  gst: string;
  date: string;
  quantity: number;
  rate: number;
  payment: string;
}

const PAYMENT_METHODS = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card'] as const;

const today = () => new Date().toISOString().slice(0, 10);

const blank = () => ({
  party: '',
  product: '',
  gst: '',
  date: today(),
  quantity: '',
  rate: '',
  payment: '',
});

/** The total a line comes to: quantity times rate. */
const lineTotal = (l: Line) => l.quantity * l.rate;

function InvoiceTab({ kind }: { kind: Kind }) {
  const partyLabel = kind === 'purchase' ? 'Supplier Name' : 'Customer Name';
  const [form, setForm] = useState(blank());
  const [lines, setLines] = useState<Line[]>([]);

  const set = (key: keyof ReturnType<typeof blank>, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const grandTotal = useMemo(() => lines.reduce((n, l) => n + lineTotal(l), 0), [lines]);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const line: Line = {
      id: Date.now(),
      party: form.party.trim(),
      product: form.product.trim(),
      gst: form.gst.trim(),
      date: form.date,
      quantity: Number(form.quantity) || 0,
      rate: Number(form.rate) || 0,
      payment: form.payment,
    };
    setLines((rows) => [line, ...rows]);
    setForm(blank());
  };

  const remove = (id: number) => setLines((rows) => rows.filter((r) => r.id !== id));

  const cell = { xs: 12, sm: 6, md: 4 } as const;
  const live = Number(form.quantity) && Number(form.rate) ? Number(form.quantity) * Number(form.rate) : 0;

  return (
    <>
      <Box component="form" onSubmit={add} sx={{ p: 2 }}>
        <Grid container spacing={2}>
          <Grid size={cell}>
            <TextField
              label={partyLabel}
              value={form.party}
              onChange={(e) => set('party', e.target.value)}
              required
            />
          </Grid>
          <Grid size={cell}>
            <TextField
              label="Product Name"
              value={form.product}
              onChange={(e) => set('product', e.target.value)}
              required
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
            {/* The total this line comes to — quantity times rate — shown, not
                typed, so it can never disagree with the two figures above it. */}
            <TextField label="Total Amount" value={live ? money(live) : ''} disabled />
          </Grid>
        </Grid>

        <Stack direction="row" spacing={2} sx={{ mt: 2, justifyContent: 'flex-end' }}>
          <Button variant="contained" type="submit" startIcon={<AddIcon />}>
            Add {kind === 'purchase' ? 'Purchase' : 'Sale'}
          </Button>
        </Stack>
      </Box>

      <TableFrame
        loading={false}
        error={null}
        empty={lines.length === 0}
        emptyText={`No ${kind} invoice has been added yet.`}
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{kind === 'purchase' ? 'Supplier' : 'Customer'}</TableCell>
              <TableCell>Product</TableCell>
              <TableCell>GST No.</TableCell>
              <TableCell>Date</TableCell>
              <TableCell align="right">Qty</TableCell>
              <TableCell align="right">Rate</TableCell>
              <TableCell>Payment</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {lines.map((l) => (
              <TableRow key={l.id} hover>
                <TableCell>{l.party || '—'}</TableCell>
                <TableCell>{l.product || '—'}</TableCell>
                <TableCell className="mono">{l.gst || '—'}</TableCell>
                <TableCell>{l.date}</TableCell>
                <TableCell align="right" className="tabular">
                  {l.quantity}
                </TableCell>
                <TableCell align="right" className="tabular">
                  {money(l.rate)}
                </TableCell>
                <TableCell>{l.payment || '—'}</TableCell>
                <TableCell align="right" className="tabular">
                  {money(lineTotal(l))}
                </TableCell>
                <TableCell>
                  <RowActions>
                    <IconAction label="Remove" icon={DeleteIcon} danger onClick={() => remove(l.id)} />
                  </RowActions>
                </TableCell>
              </TableRow>
            ))}
            {lines.length > 0 && (
              <TableRow sx={{ '& td': { fontWeight: 700, borderTop: 2, borderColor: 'divider' } }}>
                <TableCell colSpan={7}>Total</TableCell>
                <TableCell align="right" className="tabular">
                  {money(grandTotal)}
                </TableCell>
                <TableCell />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableFrame>
    </>
  );
}

export default function Invoices() {
  // The tab lives in the URL so the sidebar's Purchase and Sales sub-items open
  // straight to their side.
  const [params, setParams] = useSearchParams();
  const tab: Kind = params.get('tab') === 'sales' ? 'sales' : 'purchase';
  const setTab = (next: Kind) => setParams({ tab: next });

  return (
    <Panel title="Invoices">
      <Box sx={{ px: 2, pt: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Record purchase and sales invoices. Entries are held on this screen for now — the storing endpoint is
          still being built.
        </Typography>
      </Box>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v as Kind)}
        sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="purchase" label="Purchase" />
        <Tab value="sales" label="Sales" />
      </Tabs>

      {/* Keyed so switching tabs starts each side from its own blank form. */}
      <InvoiceTab key={tab} kind={tab} />
    </Panel>
  );
}
