import { useState } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  Link,
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
import { useToast } from '../components/Toast';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { hint, money, toneColour, Dialog, Notice, OrderChip, Panel, Tile } from '../components/ui';
import { apiUrl } from '../lib/config';
import PrintIcon from '@mui/icons-material/PrintOutlined';

interface QuoteLine {
  report_id: number;
  report_no: string;
  carat_weight: string;
  price_source: string;
  smart_price: number;
  classic_price: number;
  line_total: number;
}

interface Quote {
  total_amount: number;
  discount: number;
  payable_amount: number;
  amount_with_gst: number;
  unpriced_count: number;
  certificates: QuoteLine[];
}

export default function OrderDetail() {
  const toast = useToast();
  const { id } = useParams();
  const order = useFetch<{ data: any }>(`/orders/${id}`);
  const [discount, setDiscount] = useState(0);
  const quote = useFetch<{ data: Quote }>(`/orders/${id}/quote?discount=${discount}`);

  const [settling, setSettling] = useState(false);
  const [paid, setPaid] = useState('');
  const [payMode, setPayMode] = useState('cash');
  const [busy, setBusy] = useState(false);

  const o = order.data?.data;
  const q = quote.data?.data;

  /**
   * How far the order has been certified.
   *
   * The money on this screen is priced from certificates, not from the order —
   * a line has no price of its own, and the band is chosen by the carat weight
   * the certificate records. So an order nobody has written a certificate for
   * prices at zero, correctly and unhelpfully. These two figures are what turn
   * that zero into a sentence.
   *
   * `owed` counts a line's quantity once per card kind it asks for, matching
   * the Total Report column the Laravel list and detail screens both carried.
   */
  const items: any[] = o?.items ?? [];
  const reports: any[] = o?.reports ?? [];
  const writtenPerItem = new Map<string, number>();
  for (const r of reports) {
    const key = String(r.order_detail_id);
    writtenPerItem.set(key, (writtenPerItem.get(key) ?? 0) + 1);
  }
  const owedFor = (it: any) => it.qty * (it.smart_card + it.classic_card);
  const writtenFor = (it: any) =>
    (writtenPerItem.get(String(it.id)) ?? 0) * (it.smart_card + it.classic_card);

  const owed = items.reduce((t, it) => t + owedFor(it), 0);
  const written = items.reduce((t, it) => t + writtenFor(it), 0);

  const settle = async () => {
    setBusy(true);
    try {
      await api.post(`/orders/${id}/deliver`, {
        discount,
        paid_amount: paid === '' ? undefined : Number(paid),
        pay_mode: payMode,
      });
      setSettling(false);
      toast.ok('Order settled and marked delivered.');
      order.reload();
      quote.reload();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  if (order.loading) {
    return (
      <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
        <CircularProgress size={26} />
      </Box>
    );
  }
  if (order.error) return <Notice kind="error">{order.error}</Notice>;
  if (!o) return null;

  return (
    <>

      {/* Who the order belongs to travels with the first panel now that the
          page carries no heading. The breadcrumb already names the order, so
          this says the part the trail cannot: whose it is and where it is. */}
      <Panel
        title="Items"
        subtitle={
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
            <span>
              {o.customer_name} · {o.mobile} · taken {o.order_date}
            </span>
            <OrderChip status={o.status} />
          </Box>
        }
        actions={
          <Stack direction="row" spacing={1}>
            <Button
              startIcon={<PrintIcon />}
              onClick={() => window.open(apiUrl(`/cards/order/receipt/${id}`), '_blank', 'noopener')}
            >
              Receipt
            </Button>
            <Button
              startIcon={<PrintIcon />}
              onClick={() => window.open(apiUrl(`/cards/order/invoice/${id}`), '_blank', 'noopener')}
            >
              Invoice
            </Button>
            {o.status !== 'delivered' && (
              /*
                Not settleable until something has been certified. Without this
                the button was live on an order priced at zero, and settling it
                writes that zero to the order as its bill and marks it
                delivered — a mistake with no undo on this screen.
              */
              <Button
                variant="contained"
                onClick={() => setSettling(true)}
                disabled={!q || written === 0}
              >
                Settle and deliver
              </Button>
            )}
          </Stack>
        }
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Item</TableCell>
              <TableCell>Category</TableCell>
              <TableCell align="right">Quantity</TableCell>
              <TableCell>Smart card</TableCell>
              <TableCell>Classic card</TableCell>
              <TableCell align="right">Certificates</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((it: any) => (
              <TableRow key={it.id} hover>
                <TableCell className="mono">#{it.id}</TableCell>
                <TableCell>{it.category_name ?? it.category_id}</TableCell>
                <TableCell align="right" className="tabular">
                  {it.qty}
                </TableCell>
                <TableCell>{it.smart_card ? 'Yes' : '—'}</TableCell>
                <TableCell>{it.classic_card ? 'Yes' : '—'}</TableCell>
                {/* Written of owed, the way the order list reads it. */}
                <TableCell align="right" className="tabular">
                  <Box
                    component="span"
                    sx={{
                      fontWeight: 600,
                      color:
                        writtenFor(it) >= owedFor(it) && owedFor(it) > 0
                          ? 'success.main'
                          : 'text.primary',
                    }}
                  >
                    {writtenFor(it)}
                  </Box>
                  <Box component="span" sx={{ color: 'text.secondary' }}>
                    {' / '}
                    {owedFor(it)}
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <Typography variant="h2" sx={{ mt: 4, mb: 1.5 }}>
        Pricing
      </Typography>
      <Panel
        title="Certificates on this order"
        actions={
          <TextField
            label="Discount"
            type="number"
            value={discount}
            onChange={(e) => setDiscount(Number(e.target.value) || 0)}
            slotProps={{ htmlInput: { min: 0 } }}
            sx={{ width: 130 }}
          />
        }
      >
        {quote.loading && (
          <Box sx={{ py: 4, display: 'grid', placeItems: 'center' }}>
            <CircularProgress size={22} />
          </Box>
        )}
        {quote.error && (
          <Typography
            sx={{ py: 4, textAlign: 'center', color: `${toneColour('refused')}.main` }}
            variant="body2"
          >
            {quote.error}
          </Typography>
        )}
        {q && (
          <>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Certificate</TableCell>
                  <TableCell align="right">Carat</TableCell>
                  <TableCell>Band</TableCell>
                  <TableCell align="right">Smart</TableCell>
                  <TableCell align="right">Classic</TableCell>
                  <TableCell align="right">Line</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {q.certificates.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ py: 3, color: 'text.secondary' }}>
                      No certificate has been written against this order yet, so there is nothing
                      to price. An order is billed per certificate — the weight band is chosen by
                      the carat weight each one records — so the totals below stay at zero until
                      the first is issued. {written} of {owed} written.
                    </TableCell>
                  </TableRow>
                )}
                {q.certificates.map((c) => (
                  <TableRow key={c.report_id} hover>
                    <TableCell className="mono">{c.report_no}</TableCell>
                    <TableCell align="right" className="tabular">
                      {c.carat_weight}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        variant="outlined"
                        color={c.price_source === 'unpriced' ? 'error' : 'default'}
                        label={c.price_source}
                      />
                    </TableCell>
                    <TableCell align="right" className="tabular">
                      {money(c.smart_price)}
                    </TableCell>
                    <TableCell align="right" className="tabular">
                      {money(c.classic_price)}
                    </TableCell>
                    <TableCell align="right" className="tabular">
                      {money(c.line_total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <Grid container spacing={1.5} sx={{ p: 2 }}>
              <Grid size={{ xs: 6, md: 3 }}>
                <Tile label="Billed" value={money(q.total_amount)} />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Tile label="Discount" value={money(q.discount)} />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Tile label="Payable" value={money(q.payable_amount)} />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Tile label="With 18% GST" value={money(q.amount_with_gst)} />
              </Grid>
            </Grid>

            {q.unpriced_count > 0 && (
              <Box sx={{ px: 2, pb: 2 }}>
                <Notice kind="error" sx={{ mb: 0 }}>
                  {q.unpriced_count} certificate{q.unpriced_count === 1 ? '' : 's'} fell outside
                  every price band and were billed as zero. Add a band covering that weight before
                  settling.
                </Notice>
              </Box>
            )}
          </>
        )}
      </Panel>

      <Typography sx={{ mt: 3 }}>
        <Link component={RouterLink} to="/orders">
          Back to orders
        </Link>
      </Typography>

      {settling && q && (
        <Dialog
          title="Settle and deliver"
          onClose={() => setSettling(false)}
          onSubmit={settle}
          submitLabel="Settle"
          busy={busy}
        >
          <Typography variant="body2" sx={{ mb: 2 }}>
            Payable including GST is <strong>{money(q.amount_with_gst)}</strong>. Anything less is
            recorded as dues.
          </Typography>
          <Stack spacing={2}>
            <TextField
              label="Amount collected"
              type="number"
              value={paid}
              placeholder={String(q.amount_with_gst)}
              onChange={(e) => setPaid(e.target.value)}
              slotProps={{
                htmlInput: { min: 0 },
                ...hint('Leave blank to record the full amount.'),
              }}
            />
            <TextField
              select
              label="Payment mode"
              value={payMode}
              onChange={(e) => setPayMode(e.target.value)}
            >
              <MenuItem value="cash">Cash</MenuItem>
              <MenuItem value="upi">UPI</MenuItem>
              <MenuItem value="card">Card</MenuItem>
              <MenuItem value="bank">Bank transfer</MenuItem>
            </TextField>
          </Stack>
        </Dialog>
      )}
    </>
  );
}
