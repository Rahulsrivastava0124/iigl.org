import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
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
import { Link as RouterLink } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { useFetch, useDebounced } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf, useAuth } from '../lib/auth';
import {
  Dialog,
  hint,
  OrderChip,
  Pager,
  Panel,
  SearchField,
  StatusChip,
  TableFrame,
  Tile,
  ToneAction,
  money,
  TILE_CELL,
} from '../components/ui';
import type { Paged, Transaction } from '../lib/api';
import { isLab, isSuper } from '../lib/portal';
import ApproveIcon from '@mui/icons-material/CheckCircleOutlined';
import DeclineIcon from '@mui/icons-material/CancelOutlined';
import CommissionIcon from '@mui/icons-material/PercentOutlined';
import PaidIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import DuesIcon from '@mui/icons-material/PendingActionsOutlined';

/** One order's contribution to the commission. `GET .../commission/earnings`. */
interface Earning {
  order_id: number;
  order_no: string;
  order_date: string | null;
  status: string;
  lab_name: string | null;
  collected: number;
  pieces: number;
  rate: number;
  commission_type: string;
  commission: number;
}

/** `GET /transactions/commission/summary`. Null rate: head office is on none. */
interface CommissionSummary {
  accrued: number;
  paid: number;
  pending: number;
  due: number;
  rate: number | null;
  commission_type: string | null;
  per_piece: boolean;
}

export default function Transactions() {
  const toast = useToast();
  const { user } = useAuth();

  /*
    The menu points here three ways: every movement, the commission remittances
    on their own, and the queue awaiting a decision. The URL says which — `type`
    is passed to the API rather than filtered here, because a page of 25 out of
    the whole history would otherwise be filtered down to whatever commission
    happened to be on it.

    The running account is Wallet's screen, not a fourth view of this one.
  */
  const [params, setParams] = useSearchParams();
  const type = params.get('type') ?? '';
  const commissionOnly = type === 'commision';

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [busyId, setBusyId] = useState<number | null>(null);

  const [search, setSearch] = useState('');
  const term = useDebounced(search);

  const query = new URLSearchParams({ page: String(page), per_page: '25' });
  if (status !== '') query.set('status', status);
  if (type !== '') query.set('type', type);
  if (term.trim()) query.set('q', term.trim());

  const { data, loading, error: loadError, reload } = useFetch<Paged<Transaction>>(
    `/transactions?${query}`,
  );
  const rows = data?.data ?? [];

  /* Only on the commission view, and only then: the rest of this screen is a
     list of movements and has no position to report. */
  const summary = useFetch<{ data: CommissionSummary }>(
    commissionOnly ? '/transactions/commission/summary' : null,
  );
  const position = summary.data?.data;

  /* What the accrued figure is made of. The remittance list answers "what have
     I sent"; a laboratory that has never sent anything was reading a due of 30
     over an empty table, with nothing on the screen saying where the 30 came
     from. */
  const [earnPage, setEarnPage] = useState(1);
  const earnings = useFetch<Paged<Earning>>(
    commissionOnly ? `/transactions/commission/earnings?page=${earnPage}&per_page=25` : null,
  );
  const earned = earnings.data?.data ?? [];

  /* Paying is the laboratory's act — head office is the receiver on every
     commission row, and the API refuses it from anybody else. */
  const canPay = commissionOnly && isLab(user) && (position?.rate ?? 0) > 0;

  const [paying, setPaying] = useState(false);
  /** What is being sent, on percentage terms. The base is worked out from it. */
  const [payAmount, setPayAmount] = useState('');
  const [base, setBase] = useState('');
  const [pieces, setPieces] = useState('');
  const [payMode, setPayMode] = useState('cash');
  const [reference, setReference] = useState('');
  const [sending, setSending] = useState(false);

  /*
    What the payment will come to, on this laboratory's own terms — a share of
    what it collected, or a flat amount for each piece. Shown before it is sent
    because the API derives the amount from the configured rate and ignores any
    figure the browser offers: without this the dialog would take a number and
    record a different one.
  */
  const rate = position?.rate ?? 0;

  /*
    The figure the dialog is about is the commission, not the takings it is a
    share of. On percentage terms it is typed directly and the base is worked
    back from it, because a laboratory paying 30 should type 30 — it read 300
    in the field and 30 underneath, which is the wrong way round and looks like
    a bill for ten times the money.

    Per-piece terms are already in the right currency: the pieces are the thing
    counted, and the amount follows from them.
  */
  const amount = position?.per_piece
    ? Math.round((Number(pieces) || 0) * rate * 100) / 100
    : Math.round((Number(payAmount) || 0) * 100) / 100;

  /* What the API is told the commission was calculated on. Derived, so the
     amount it computes from the rate is the amount shown here. */
  const commissionOn =
    position?.per_piece
      ? Math.round((Number(base) || 0) * 100) / 100
      : rate > 0
        ? Math.round((amount * 100 * 100) / rate) / 100
        : 0;

  /*
    Opened on the figure the laboratory came here to pay.

    The API derives the amount from the base — the takings on a percentage, the
    pieces on per-piece terms — so paying an outstanding 30 at 10% meant working
    back to a base of 300 and typing that. An empty base is an amount of zero,
    which left the Send button dead with nothing on the dialog saying why, and
    the payment that should have been in the list below was never sendable.

    So the base is filled in to settle exactly what is owed, and is editable for
    a laboratory paying part of it.
  */
  const openPay = () => {
    const due = position?.due ?? 0;
    if (position?.per_piece) {
      setPieces(rate > 0 ? String(Math.round(due / rate)) : '');
      // Recorded beside the pieces as context, and the API insists on a figure
      // above zero: what the certified pieces were collected against.
      setBase(due > 0 ? String(due) : '');
    } else {
      setPayAmount(due > 0 ? String(due) : '');
    }
    setPaying(true);
  };

  const payCommission = async () => {
    setSending(true);
    try {
      await api.post('/transactions/commission', {
        commission_on: commissionOn,
        pieces: position?.per_piece ? Number(pieces) : undefined,
        pay_mode: payMode,
        transaction_no: reference.trim() === '' ? null : reference.trim(),
      });
      toast.ok('Commission sent. It waits on head office to approve it.');
      setPaying(false);
      setPayAmount('');
      setBase('');
      setPieces('');
      setReference('');
      reload();
      summary.reload();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setSending(false);
    }
  };

  const decide = async (id: number, next: 1 | 2) => {
    setBusyId(id);
    try {
      await api.post(`/transactions/${id}/status`, { status: next });
      toast.ok(next === 1 ? 'Transaction approved.' : 'Transaction declined.');
      reload();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      {/*
        Where commission stands, above the list of the payments that got it
        there: what the rate has earned head office, what has been approved,
        and what is left. Money owed reads red until it is not owed.
      */}
      {commissionOnly && position && (
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid size={TILE_CELL}>
            <Tile
              label="Total commission"
              value={money(position.accrued)}
              note="accrued"
              fill="brand"
              icon={CommissionIcon}
            />
          </Grid>
          <Grid size={TILE_CELL}>
            <Tile
              label="Paid"
              value={money(position.paid)}
              /* A remittance nobody has approved has not moved: it is neither
                 paid nor gone, so it is said here rather than folded into
                 either figure. */
              note={position.pending > 0 ? `${money(position.pending)} awaiting approval` : undefined}
              fill="settled"
              icon={PaidIcon}
            />
          </Grid>
          <Grid size={TILE_CELL}>
            <Tile
              label="Due"
              value={money(position.due)}
              fill={position.due > 0 ? 'refused' : 'settled'}
              icon={DuesIcon}
            />
          </Grid>
        </Grid>
      )}

      {/*
        The evidence for the tile, above the payments against it. Newest order
        first, and priced the way that laboratory's agreement reads: a share of
        what it collected, or a flat amount for each piece it certified.
      */}
      {commissionOnly && (
        <Panel
          title="What the commission is made of"
          count={
            earnings.data
              ? `${earnings.data.meta.total.toLocaleString()} orders`
              : 'Loading…'
          }
          footer={<Pager meta={earnings.data?.meta} onPage={setEarnPage} />}
          sx={{ mb: 2 }}
        >
          <TableFrame
            loading={earnings.loading}
            error={earnings.error}
            empty={earned.length === 0}
            emptyText="No order has earned commission yet: it accrues once an order is delivered or money is taken on it."
          >
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Order</TableCell>
                  <TableCell>Date</TableCell>
                  {isSuper(user) && <TableCell>Laboratory</TableCell>}
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Collected</TableCell>
                  <TableCell align="right">Pieces</TableCell>
                  <TableCell>Rate</TableCell>
                  <TableCell align="right">Commission</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {earned.map((e) => (
                  <TableRow key={e.order_id} hover>
                    <TableCell className="mono">
                      <Link component={RouterLink} to={`/orders/${e.order_id}`} underline="hover">
                        {e.order_no}
                      </Link>
                    </TableCell>
                    <TableCell>{e.order_date ?? '—'}</TableCell>
                    {isSuper(user) && <TableCell>{e.lab_name ?? `#${e.order_id}`}</TableCell>}
                    <TableCell>
                      <OrderChip status={e.status} />
                    </TableCell>
                    <TableCell align="right" className="tabular">
                      {money(e.collected)}
                    </TableCell>
                    <TableCell align="right" className="tabular">
                      {e.pieces}
                    </TableCell>
                    {/* The base is the half of the rate that is doing the work,
                        so it is named rather than left to be inferred from two
                        columns of numbers. */}
                    <TableCell>
                      {e.commission_type === 'per_pc'
                        ? `${money(e.rate)} a piece`
                        : `${e.rate}% of collected`}
                    </TableCell>
                    <TableCell align="right" className="tabular" sx={{ fontWeight: 600 }}>
                      {money(e.commission)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        </Panel>
      )}

      <Panel
        footer={<Pager meta={data?.meta} onPage={setPage} />}
        title={
          status === '0'
            ? 'Commission approval'
            : commissionOnly
              ? 'Commission paid'
              : 'Transaction history'
        }
        count={data ? `${data.meta.total.toLocaleString()} records` : 'Loading…'}
        actions={
          <>
          <SearchField
            placeholder="Transaction no, remark, mode…"
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
          />
          <TextField
            select
            label="Status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
              // `type` is what the menu entry chose; a status filter narrows
              // that list rather than replacing it, so it is carried over.
              setParams(
                e.target.value === ''
                  ? type === ''
                    ? {}
                    : { type }
                  : type === ''
                    ? { status: e.target.value }
                    : { status: e.target.value, type },
              );
            }}
            sx={{ width: 150 }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="0">Pending</MenuItem>
            <MenuItem value="1">Approved</MenuItem>
            <MenuItem value="2">Declined</MenuItem>
          </TextField>
          {/* Last, after the controls that narrow the list: the filters say
              what is being looked at, and this is the one thing on the row
              that acts rather than looks. */}
          {canPay && (
            <Button variant="contained" onClick={openPay} sx={{ ml: 1 }}>
              Pay Commission
            </Button>
          )}
          </>
        }
      >
        <TableFrame loading={loading} error={loadError} empty={rows.length === 0}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Id</TableCell>
                <TableCell>Type</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>From</TableCell>
                <TableCell>To</TableCell>
                <TableCell>Mode</TableCell>
                <TableCell>Reference</TableCell>
                <TableCell>Status</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((t) => {
                const mine = t.received_by === user?.id || isSuper(user);
                const pending = t.status === 0;
                return (
                  <TableRow key={t.id} hover>
                    <TableCell className="mono">#{t.id}</TableCell>
                    <TableCell>{t.transaction_type ?? '—'}</TableCell>
                    <TableCell align="right" className="tabular">
                      {money(t.amount)}
                    </TableCell>
                    <TableCell>{t.send_by === 0 ? 'customer' : `#${t.send_by}`}</TableCell>
                    <TableCell>#{t.received_by}</TableCell>
                    <TableCell>{t.pay_mode}</TableCell>
                    <TableCell className="mono">{t.transaction_no ?? '—'}</TableCell>
                    <TableCell>
                      <StatusChip status={t.status} />
                    </TableCell>
                    <TableCell>
                      {/* Deciding belongs to the receiver, and it is the only
                          thing a row offers: a payment that has been sent is a
                          record of what was sent. */}
                      {pending && mine ? (
                        <Stack direction="row" spacing={0.75} sx={{ justifyContent: 'flex-end' }}>
                          <ToneAction
                            label="Approve"
                            icon={ApproveIcon}
                            tone="settled"
                            disabled={busyId === t.id}
                            onClick={() => decide(t.id, 1)}
                          />
                          <ToneAction
                            label="Decline"
                            icon={DeclineIcon}
                            tone="refused"
                            disabled={busyId === t.id}
                            onClick={() => decide(t.id, 2)}
                          />
                        </Stack>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableFrame>
      </Panel>

      {paying && position && (
        <Dialog
          title="Pay commission"
          onClose={() => setPaying(false)}
          onSubmit={payCommission}
          submitLabel="Send"
          busy={sending}
          disabled={amount <= 0}
        >
          {/* The panel's form grid, in a dialog: two columns rather than the
              page's three, because a `sm` dialog is half a page wide and three
              fields across it read as three slivers. */}
          <Grid container spacing={2}>
            {position.per_piece && (
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Pieces certified"
                  type="number"
                  required
                  value={pieces}
                  onChange={(e) => setPieces(e.target.value)}
                  slotProps={{ htmlInput: { min: 1, step: 1 } }}
                />
              </Grid>
            )}
            <Grid size={{ xs: 12, sm: 6 }}>
              {position.per_piece ? (
                <TextField
                  label="Collected amount"
                  type="number"
                  required
                  value={base}
                  onChange={(e) => setBase(e.target.value)}
                  slotProps={{
                    htmlInput: { min: 0 },
                    ...hint('What was collected on those pieces. Recorded with the payment.'),
                  }}
                />
              ) : (
                <TextField
                  label="Amount to pay"
                  type="number"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  slotProps={{ htmlInput: { min: 0 } }}
                />
              )}
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
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
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Reference"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                slotProps={hint('Cheque or transaction number, if there is one.')}
              />
            </Grid>
            <Grid size={12}>
              <Typography
                variant="body2"
                sx={{ fontWeight: 600, color: amount > 0 ? 'text.primary' : 'error.main' }}
              >
                {amount > 0
                  ? `Sending ${money(amount)} to head office. Opens at what is outstanding; type less to pay part of it.`
                  : position.per_piece
                    ? 'Enter the pieces certified: nothing to send until then.'
                    : 'Enter an amount above zero: nothing to send until then.'}
              </Typography>
            </Grid>
          </Grid>
        </Dialog>
      )}
    </>
  );
}
