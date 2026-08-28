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
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { Dialog, Notice, OrderChip, PageHead, Panel, Tile, money, toneColour } from '../components/ui';
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
  const { id } = useParams();
  const order = useFetch<{ data: any }>(`/orders/${id}`);
  const [discount, setDiscount] = useState(0);
  const quote = useFetch<{ data: Quote }>(`/orders/${id}/quote?discount=${discount}`);

  const [settling, setSettling] = useState(false);
  const [paid, setPaid] = useState('');
  const [payMode, setPayMode] = useState('cash');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const o = order.data?.data;
  const q = quote.data?.data;

  const settle = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/orders/${id}/deliver`, {
        discount,
        paid_amount: paid === '' ? undefined : Number(paid),
        pay_mode: payMode,
      });
      setSettling(false);
      setDone('Order settled and marked delivered.');
      order.reload();
      quote.reload();
    } catch (err) {
      setError(messageOf(err));
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
      <PageHead
        title={o.order_no}
        subtitle={
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
            <span>
              {o.customer_name} · {o.mobile} · taken {o.order_date}
            </span>
            <OrderChip status={o.status} />
          </Box>
        }
        action={
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
              <Button variant="contained" onClick={() => setSettling(true)} disabled={!q}>
                Settle and deliver
              </Button>
            )}
          </Stack>
        }
      />

      {done && <Notice kind="ok">{done}</Notice>}
      {error && <Notice kind="error">{error}</Notice>}

      <Panel title="Items">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Item</TableCell>
              <TableCell>Category</TableCell>
              <TableCell align="right">Quantity</TableCell>
              <TableCell>Smart card</TableCell>
              <TableCell>Classic card</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(o.items ?? []).map((it: any) => (
              <TableRow key={it.id} hover>
                <TableCell className="mono">#{it.id}</TableCell>
                <TableCell>{it.category_id}</TableCell>
                <TableCell align="right" className="tabular">
                  {it.qty}
                </TableCell>
                <TableCell>{it.smart_card ? 'Yes' : '—'}</TableCell>
                <TableCell>{it.classic_card ? 'Yes' : '—'}</TableCell>
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
              slotProps={{ htmlInput: { min: 0 } }}
              helperText="Leave blank to record the full amount."
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
