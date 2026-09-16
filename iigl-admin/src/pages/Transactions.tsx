import { useEffect, useState } from 'react';
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
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { useFetch, useDebounced } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf, useAuth } from '../lib/auth';
import { payModeLabel } from '../lib/payModes';
import { PayCommissionDialog } from '../components/PayCommission';
import {
  OrderChip,
  DEFAULT_PER_PAGE, Pager,
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
    The menu points here for a laboratory's commission remittances; head office
    decides commission on its Wallet and is sent there. The URL says which — `type`
    is passed to the API rather than filtered here, because a page of 25 out of
    the whole history would otherwise be filtered down to whatever commission
    happened to be on it.

    The running account is Wallet's screen, not a fourth view of this one.
  */
  const [params, setParams] = useSearchParams();
  const type = params.get('type') ?? '';
  const commissionOnly = type === 'commision';

  const [page, setPage] = useState(1);
  /** Rows per page. Component state, not a URL parameter: it is how somebody
   * likes to read a list, not which list they are looking at. */
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [busyId, setBusyId] = useState<number | null>(null);

  const [search, setSearch] = useState('');
  const term = useDebounced(search);

  const query = new URLSearchParams({ page: String(page), per_page: String(perPage) });
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
  const [earnPerPage, setEarnPerPage] = useState(DEFAULT_PER_PAGE);
  const earnings = useFetch<Paged<Earning>>(
    commissionOnly
      ? `/transactions/commission/earnings?page=${earnPage}&per_page=${earnPerPage}`
      : null,
  );
  const earned = earnings.data?.data ?? [];

  /* Paying is the laboratory's act — head office is the receiver on every
     commission row, and the API refuses it from anybody else. */
  const canPay = commissionOnly && isLab(user) && (position?.rate ?? 0) > 0;

  /** What the dialog opens on, and whether it is open at all. */
  const [payDue, setPayDue] = useState<number | null>(null);

  /** Opened on what is outstanding; editable for a part payment. */
  const openPay = () => setPayDue(position?.due ?? 0);

  /*
    Arriving from a Pay elsewhere: the dialog opens on what that screen says is
    outstanding, once — the parameter is dropped as it opens.
  */
  const payParam = params.get('pay');
  useEffect(() => {
    if (!payParam || !canPay) return;
    setPayDue(Number(payParam) || 0);
    const next = new URLSearchParams(params);
    next.delete('pay');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payParam, canPay]);

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
          footer={
            <Pager
              meta={earnings.data?.meta}
              onPage={setEarnPage}
              onPerPage={(n) => {
                setEarnPerPage(n);
                setEarnPage(1);
              }}
            />
          }
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
        footer={<Pager meta={data?.meta} onPage={setPage} onPerPage={(n) => {
            setPerPage(n);
            setPage(1);
          }} />}
        title={
          commissionOnly
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
                    {/*
                      Names, not ids. The endpoint has resolved both for a
                      while; the table went on printing the key beside them,
                      which is a row somebody has to go and look things up in.

                      A collection is named from its order — a walk-in has no
                      account, so `send_by` is 0 — and "Customer" is the last
                      resort, for a payment with no order behind it.
                    */}
                    <TableCell sx={{ whiteSpace: 'normal', minWidth: 130 }}>
                      {t.send_by_name ?? (t.send_by > 0 ? `#${t.send_by}` : 'Customer')}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'normal', minWidth: 130 }}>
                      {t.received_by_name ?? `#${t.received_by}`}
                    </TableCell>
                    <TableCell>{payModeLabel(t.pay_mode)}</TableCell>
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

      {payDue !== null && (
        <PayCommissionDialog
          due={payDue}
          onClose={() => setPayDue(null)}
          onPaid={() => {
            reload();
            summary.reload();
          }}
        />
      )}
    </>
  );
}
