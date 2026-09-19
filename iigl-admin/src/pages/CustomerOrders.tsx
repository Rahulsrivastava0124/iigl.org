import { useMemo, useState } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  CircularProgress,
  Grid,
  Link,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useFetch } from '../lib/useFetch';
import { useAuth } from '../lib/auth';
import { isSuper } from '../lib/portal';
import {
  Notice,
  OrderChip,
  OrderRef,
  Panel,
  SearchField,
  TableFrame,
  Tile,
  money,
} from '../components/ui';

/**
 * Everything one customer has ordered, and what it came to.
 *
 * A customer is not a record here — it is a mobile number that orders have been
 * placed under — so this page is keyed by the number, exactly as the list it
 * opens from is grouped by it.
 *
 * The money is what was billed and collected, read from the orders themselves
 * rather than re-priced from today's bands: this is a history, and re-pricing
 * it would answer what the same work would cost now.
 */

interface CustomerOrder {
  id: number;
  order_no: string;
  order_date: string | null;
  status: string;
  payable_amt: number | null;
  paid_amount: string | null;
  /** The laboratory the order was placed at. Orders are theirs, not head office's. */
  laboratory: string | null;
}

interface History {
  mobile: string;
  customer_name: string | null;
  orders: CustomerOrder[];
  totals: { orders: number; billed: number; paid: number; due: number };
}

const CELL = { xs: 6, md: 3 } as const;

export default function CustomerOrders() {
  const { mobile = '' } = useParams();
  // Head office reads across the network, where the same number can have
  // ordered from more than one laboratory. A laboratory's own list is all its
  // own, and saying so on every row tells it nothing.
  const { user } = useAuth();
  const admin = isSuper(user);
  const { data, loading, error } = useFetch<{ data: History }>(
    `/customers/${encodeURIComponent(mobile)}/orders`,
  );
  const history = data?.data;
  const orders = history?.orders ?? [];

  /*
    Filtered here rather than at the API.

    A customer's whole history arrives in one response — it is one mobile
    number's orders, 133 at the worst in this data — so narrowing it is a
    property of what is already on the page. A round trip per keystroke would
    buy nothing and lose the instant response.
  */
  const [search, setSearch] = useState('');
  const [lab, setLab] = useState('');

  /** The laboratories this customer has actually been to, in name order. */
  const laboratories = useMemo(
    () => [...new Set(orders.map((o) => o.laboratory).filter((l): l is string => !!l))].sort(),
    [orders],
  );

  const term = search.trim().toLowerCase();
  const shown = useMemo(
    () =>
      orders.filter(
        (o) =>
          (!term || o.order_no.toLowerCase().includes(term)) &&
          (!lab || o.laboratory === lab),
      ),
    [orders, term, lab],
  );

  /*
    The tiles count what is on the screen, not what the API summed.

    Filter to one laboratory and read "Total orders 133" above two rows and the
    page is telling you two different things at once. When nothing is filtered
    these are the same four numbers the endpoint returns, computed the same way
    — billed is `payable_amt` as stored, and due is never negative, because an
    overpayment is somebody's change rather than a debt the order owes back.
  */
  const totals = useMemo(() => {
    const billed = shown.reduce((n, o) => n + (Number(o.payable_amt) || 0), 0);
    const paid = shown.reduce((n, o) => n + (Number(o.paid_amount) || 0), 0);
    const due = shown.reduce(
      (n, o) => n + Math.max(0, (Number(o.payable_amt) || 0) - (Number(o.paid_amount) || 0)),
      0,
    );
    return { orders: shown.length, billed, paid, due };
  }, [shown]);

  const filtering = Boolean(term || lab);

  if (loading) {
    return (
      <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
        <CircularProgress size={26} />
      </Box>
    );
  }
  if (error) return <Notice kind="error">{error}</Notice>;

  return (
    <>
      {/* The four figures the rows below add up to — the whole history, or
          whatever the filters have left of it. Due is red only while something
          is owed. */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={CELL}>
          <Tile label="Total orders" value={String(totals.orders)} fill="brand" />
        </Grid>
        <Grid size={CELL}>
          <Tile label="Total amount" value={money(totals.billed)} fill="brand" />
        </Grid>
        <Grid size={CELL}>
          <Tile label="Paid" value={money(totals.paid)} fill="settled" />
        </Grid>
        <Grid size={CELL}>
          <Tile
            label="Due"
            value={money(totals.due)}
            fill={totals.due > 0 ? 'refused' : 'settled'}
          />
        </Grid>
      </Grid>

      <Panel
        title={history?.customer_name || 'Customer'}
        subtitle={mobile}
        count={
          filtering
            ? `${shown.length} of ${orders.length} ${orders.length === 1 ? 'order' : 'orders'}`
            : `${orders.length} ${orders.length === 1 ? 'order' : 'orders'}`
        }
        actions={
          <>
            <SearchField
              placeholder="Order number…"
              value={search}
              onChange={setSearch}
              width={200}
            />
            {/*
              Only head office, and only when there is a choice to make. A
              laboratory's list is all its own, and a customer who has been to
              one laboratory has nothing to filter by — a select with a single
              option is a control that cannot change anything.
            */}
            {admin && laboratories.length > 1 && (
              <TextField
                select
                label="Laboratory"
                value={lab}
                onChange={(e) => setLab(e.target.value)}
                sx={{ width: 220 }}
              >
                <MenuItem value="">All laboratories</MenuItem>
                {laboratories.map((name) => (
                  <MenuItem key={name} value={name}>
                    {name}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </>
        }
      >
        <TableFrame
          loading={false}
          error={null}
          empty={shown.length === 0}
          emptyText={
            filtering
              ? `Nothing under this number matches${term ? ` “${search.trim()}”` : ''}${
                  lab ? `${term ? ' at ' : ' '}${lab}` : ''
                }.`
              : 'No order under this number is visible to you.'
          }
        >
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Order</TableCell>
                {admin && <TableCell>Laboratory</TableCell>}
                <TableCell>Date</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell align="right">Paid</TableCell>
                <TableCell align="right">Due</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((o) => {
                const paid = Number(o.paid_amount ?? 0);
                const due = Math.max(0, Number(o.payable_amt ?? 0) - paid);
                return (
                  <TableRow key={o.id} hover>
                    <TableCell className="mono">
                      {/* This page says what was billed; the order says what
                          for. */}
                      <OrderRef id={o.id}>{o.order_no}</OrderRef>
                    </TableCell>
                    {admin && (
                      <TableCell sx={{ whiteSpace: 'normal', minWidth: 150 }}>
                        {o.laboratory ?? '—'}
                      </TableCell>
                    )}
                    <TableCell>{o.order_date ?? '—'}</TableCell>
                    <TableCell>
                      <OrderChip status={o.status} />
                    </TableCell>
                    <TableCell align="right" className="tabular">
                      {money(o.payable_amt ?? 0)}
                    </TableCell>
                    <TableCell align="right" className="tabular">
                      {money(paid)}
                    </TableCell>
                    <TableCell
                      align="right"
                      className="tabular"
                      sx={{ color: due > 0 ? 'warning.main' : undefined }}
                    >
                      {money(due)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableFrame>
      </Panel>

      <Typography sx={{ mt: 3 }}>
        <Link component={RouterLink} to="/customers">
          Back to customers
        </Link>
      </Typography>
    </>
  );
}
