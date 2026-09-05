import { useState } from 'react';
import {
  useParams,
  useSearchParams,
  useNavigate,
  useLocation,
  Link as RouterLink,
} from 'react-router-dom';
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
import { useDebounced, useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import {
  hint,
  money,
  toneColour,
  ConfirmDialog,
  Dialog,
  IconAction,
  Notice,
  OrderChip,
  Panel,
  RowActions,
  Tile,
  TILE_CELL,
} from '../components/ui';
import { apiUrl } from '../lib/config';
import { CrumbActions } from '../lib/crumbActions';
import PrintIcon from '@mui/icons-material/PrintOutlined';
import BackIcon from '@mui/icons-material/ArrowBackOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';

interface QuoteLine {
  report_id: number;
  report_no: string;
  carat_weight: string;
  category_name: string | null;
  price_source: string;
  /** Why nothing priced it. Null unless `price_source` is 'unpriced'. */
  unpriced_reason: 'no_category_bands' | 'weight_outside' | null;
  smart_price: number;
  classic_price: number;
  line_total: number;
}

interface Quote {
  total_amount: number;
  discount: number;
  payable_amount: number;
  amount_with_gst: number;
  paid_amount: number;
  balance_due: number;
  unpriced_count: number;
  certificates: QuoteLine[];
}

/** One collection against the order — `transactions`, newest first. */
interface Payment {
  id: number;
  amount: string | number;
  pay_mode: string | null;
  transaction_no: string | null;
  created_at: string | null;
  received_by_name: string | null;
}

export default function OrderDetail() {
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  /*
    Back to the list that led here. Three lists open this page — In Progress,
    Dues Order, Delivered — so the way back is the history entry rather
    than one hardcoded list, which would send two of the three somewhere they
    had not been. A page reached by its own URL has no such entry (`key` is
    'default' on the first navigation of a session), and that case goes to the
    order list rather than out of the panel.
  */
  const goBack = () =>
    location.key === 'default' ? navigate('/orders') : navigate(-1);
  const { id } = useParams();
  const order = useFetch<{ data: any }>(`/orders/${id}`);
  /*
    Held as the text in the box, not as a number.

    `Number('') || 0` is zero, so a numeric state refilled the field with "0"
    the instant it was cleared — you could never type a fresh figure, only
    append to the nought already there, which is what made this read as broken.
    Empty is a real state and means "no discount typed": the query then leaves
    the parameter off, and the API answers with the discount the order already
    carries.
  */
  const [discount, setDiscount] = useState('');
  const settled = useDebounced(discount);
  const quote = useFetch<{ data: Quote }>(
    `/orders/${id}/quote${settled.trim() === '' ? '' : `?discount=${Number(settled) || 0}`}`,
  );

  /* `?settle=1` — the Deliver button on the list, which sends whoever pressed
     it straight to the dialog rather than to a page they then have to read for
     the control they already asked for. */
  const [params] = useSearchParams();
  const [settling, setSettling] = useState(params.get('settle') === '1');
  const [confirmingDelivery, setConfirmingDelivery] = useState(false);
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

  const payments: Payment[] = o?.payments ?? [];
  const collected = payments.reduce((t, p) => t + Number(p.amount ?? 0), 0);

  const owed = items.reduce((t, it) => t + owedFor(it), 0);
  const written = items.reduce((t, it) => t + writtenFor(it), 0);

  /** Takes the money. Handing the order over is its own button. */
  const settle = async () => {
    setBusy(true);
    try {
      await api.post(`/orders/${id}/settle`, {
        // What the quote was priced at, so the bill written matches the tiles.
        discount: q?.discount ?? 0,
        paid_amount: paid === '' ? undefined : Number(paid),
        pay_mode: payMode,
      });
      setSettling(false);
      toast.ok('Payment recorded.');
      order.reload();
      quote.reload();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Hands it over. Separate from the money on purpose: an order can be paid for
   * days before it is collected, and one with dues outstanding is still handed
   * over — that is what the dues list is.
   */
  const deliver = async () => {
    setBusy(true);
    try {
      await api.post(`/orders/${id}/deliver`, {});
      setConfirmingDelivery(false);
      toast.ok('Order delivered.');
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
      {/* On the trail's own line, at the right-hand end: it says where this
          page came from, which is what the rest of that line says too. */}
      <CrumbActions>
        <Button color="error" size="small" startIcon={<BackIcon />} onClick={goBack}>
          Back
        </Button>
      </CrumbActions>

      {/*
        The money, at the head of the page.

        Three figures and only these three: the bill, what has been taken
        against it, and what is left. Billed-before-GST, the discount and the
        payable are the arithmetic that produces the first — the discount has
        its own box and the breakdown is in the table below, so as tiles they
        were four numbers to read before reaching the one anybody wanted.

        Coloured, because each is a state as much as a figure: money owed reads
        red until it is not owed, and a settled order is green. A quarter of the
        row each, so they read as a summary above the page rather than as a
        band across it.
      */}
      {q && q.certificates.length > 0 && (
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          <Grid size={TILE_CELL}>
            <Tile label="Billed with GST" value={money(q.amount_with_gst)} fill="brand" />
          </Grid>
          <Grid size={TILE_CELL}>
            <Tile label="Paid" value={money(q.paid_amount)} fill="settled" />
          </Grid>
          <Grid size={TILE_CELL}>
            <Tile
              label="Due"
              value={money(q.balance_due)}
              fill={q.balance_due > 0 ? 'refused' : 'settled'}
            />
          </Grid>
        </Grid>
      )}

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
            {/* Ready reads the same here as it does on the list. */}
            <OrderChip status={o.status} ready={owed > 0 && written >= owed} />
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
            {/*
              Money owed is the whole of the test: there is something to take,
              so there is a button to take it with. That covers the order
              nobody has certified yet — priced at zero, it owes nothing and
              the button stays away rather than standing there live, ready to
              write that zero to the order as its bill — and it keeps the
              button on a delivered order that still owes, which is what the
              dues list sends anybody here to do.
            */}
            {q && q.balance_due > 0 && (
              <Button variant="contained" onClick={() => setSettling(true)}>
                Pay
              </Button>
            )}
            {/*
              Handing it over is its own act, and the one that closes the
              order — so it waits until every certificate it was taken for is
              written. The money may still be owing: an order delivered with
              dues is what the dues list is for.
            */}
            {o.status !== 'delivered' && (
              <Button
                variant="contained"
                color="success"
                onClick={() => setConfirmingDelivery(true)}
                disabled={busy || owed === 0 || written < owed}
              >
                Deliver Order
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
            onChange={(e) => setDiscount(e.target.value)}
            placeholder={q ? String(q.discount) : '0'}
            /* Nothing to take a discount off until a certificate is written. */
            disabled={!q || q.certificates.length === 0}
            slotProps={{ htmlInput: { min: 0 }, inputLabel: { shrink: true } }}
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
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {q.certificates.length === 0 && (
                  <TableRow>
                    {/* Table cells are nowrap by theme, which ran this sentence
                        off the right edge of the panel. */}
                    <TableCell
                      colSpan={7}
                      sx={{ py: 3, color: 'text.secondary', whiteSpace: 'normal' }}
                    >
                      Nothing to price yet: an order is billed per certificate, and the weight band
                      comes from the carat weight each one records. {written} of {owed} written.
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
                    {/*
                      The way to fix an unpriced line. The band is read from the
                      carat weight, so a certificate that fell outside every one
                      is corrected on the certificate — this row is where anyone
                      finds out about it, so it is where the way to amend it
                      belongs.
                    */}
                    <TableCell>
                      <RowActions>
                        <IconAction
                          label="Edit certificate"
                          icon={EditIcon}
                          to={`/reports/${c.report_id}/edit`}
                        />
                      </RowActions>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {q.unpriced_count > 0 && (
              <Box sx={{ px: 2, pb: 2 }}>
                {/*
                  Named, and with the reason.

                  This said every unpriced certificate had "fallen outside every
                  price band" and to widen one. That is only one of the two ways
                  it happens: a category nobody has priced at all has no band to
                  widen, and being told to widen one sends whoever reads it
                  looking for something that was never there. So each line says
                  which certificate, what it is, what it weighs, and which of the
                  two jobs it is.
                */}
                <Notice kind="error" sx={{ mb: 0 }}>
                  <Box component="span" sx={{ display: 'block', mb: 0.5 }}>
                    {q.unpriced_count} certificate{q.unpriced_count === 1 ? ' was' : 's were'}{' '}
                    billed as zero, and the order cannot be settled at a price that leaves{' '}
                    {q.unpriced_count === 1 ? 'it' : 'them'} out:
                  </Box>
                  {q.certificates
                    .filter((c) => c.price_source === 'unpriced')
                    .map((c) => (
                      <Box component="span" key={c.report_id} sx={{ display: 'block' }}>
                        <strong>{c.report_no}</strong> — {c.category_name ?? 'unknown category'} at{' '}
                        {c.carat_weight || '—'} ct.{' '}
                        {c.unpriced_reason === 'no_category_bands'
                          ? `${c.category_name ?? 'This category'} has no price bands at all.`
                          : 'No band covers that weight.'}
                      </Box>
                    ))}
                  <Box component="span" sx={{ display: 'block', mt: 0.5 }}>
                    Set the prices in{' '}
                    <Link component={RouterLink} to="/pricing" underline="hover">
                      Price Setup
                    </Link>
                    , or correct the weight on the certificate.
                  </Box>
                </Notice>
              </Box>
            )}
          </>
        )}
      </Panel>

      {/*
        What has been taken, and when. The order's columns hold the running
        totals and say nothing about how they got there — which is the question
        somebody asks when a customer pays in parts across three visits.
      */}
      {payments.length > 0 && (
        <>
          <Typography variant="h2" sx={{ mt: 4, mb: 1.5 }}>
            Payments
          </Typography>
          <Panel title="Taken against this order" count={`${money(collected)} collected`}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Mode</TableCell>
                  <TableCell>Transaction no.</TableCell>
                  <TableCell>Taken by</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {payments.map((p: Payment) => (
                  <TableRow key={p.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {String(p.created_at ?? '').slice(0, 16).replace('T', ' ') || '—'}
                    </TableCell>
                    <TableCell align="right" className="tabular">
                      {money(p.amount)}
                    </TableCell>
                    <TableCell>{p.pay_mode ?? '—'}</TableCell>
                    <TableCell className="mono">{p.transaction_no ?? '—'}</TableCell>
                    <TableCell>{p.received_by_name ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </>
      )}

      <Typography sx={{ mt: 3 }}>
        <Link component={RouterLink} to="/orders">
          Back to orders
        </Link>
      </Typography>

      {/*
        Asked before, not undone after. Handing an order over closes it: the
        status is what the lists sort on, the delivery date is stamped from it,
        the order can no longer be deleted, and there is no button anywhere that
        puts it back. The dues line is in the question because the commonest
        reason to stop is money still owed on an order about to walk out.
      */}
      <ConfirmDialog
        open={confirmingDelivery}
        danger={false}
        title="Deliver this order?"
        confirmLabel="Deliver"
        busy={busy}
        onClose={() => setConfirmingDelivery(false)}
        onConfirm={deliver}
        message={
          <>
            Hand order <strong>{o.order_no}</strong> to {o.customer_name}, with all {owed}{' '}
            certificate{owed === 1 ? '' : 's'} written.
            {q && q.balance_due > 0 && (
              <>
                {' '}
                <strong>{money(q.balance_due)}</strong> is still owed and stays owed — the order
                moves to the dues list.
              </>
            )}
          </>
        }
        warning="Delivering is not reversible, and a delivered order cannot be deleted."
      />

      {settling && q && (
        <Dialog
          title="Take payment"
          onClose={() => setSettling(false)}
          onSubmit={settle}
          submitLabel="Pay"
          busy={busy}
        >
          <Typography variant="body2" sx={{ mb: 2 }}>
            {q.paid_amount > 0 ? (
              <>
                {money(q.paid_amount)} of {money(q.amount_with_gst)} has been taken.{' '}
                <strong>{money(q.balance_due)}</strong> is still owed; anything less is recorded as
                dues.
              </>
            ) : (
              <>
                Payable including GST is <strong>{money(q.amount_with_gst)}</strong>. Anything less
                is recorded as dues.
              </>
            )}
          </Typography>
          <Stack spacing={2}>
            <TextField
              label="Amount collected"
              type="number"
              value={paid}
              placeholder={String(q.balance_due)}
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
