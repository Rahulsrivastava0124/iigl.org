import { useParams, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  CircularProgress,
  Grid,
  Link,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useFetch } from '../lib/useFetch';
import { useAuth } from '../lib/auth';
import { isSuper } from '../lib/portal';
import { Notice, OrderChip, Panel, TableFrame, Tile, money } from '../components/ui';

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
  const totals = history?.totals;
  const orders = history?.orders ?? [];

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
      {/* The four figures the whole history adds up to, before the rows that
          make them. Due is red only while something is owed. */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid size={CELL}>
          <Tile label="Total orders" value={String(totals?.orders ?? 0)} fill="brand" />
        </Grid>
        <Grid size={CELL}>
          <Tile label="Total amount" value={money(totals?.billed ?? 0)} fill="brand" />
        </Grid>
        <Grid size={CELL}>
          <Tile label="Paid" value={money(totals?.paid ?? 0)} fill="settled" />
        </Grid>
        <Grid size={CELL}>
          <Tile
            label="Due"
            value={money(totals?.due ?? 0)}
            fill={(totals?.due ?? 0) > 0 ? 'refused' : 'settled'}
          />
        </Grid>
      </Grid>

      <Panel
        title={history?.customer_name || 'Customer'}
        subtitle={mobile}
        count={`${orders.length} ${orders.length === 1 ? 'order' : 'orders'}`}
      >
        <TableFrame
          loading={false}
          error={null}
          empty={orders.length === 0}
          emptyText="No order under this number is visible to you."
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
              {orders.map((o) => {
                const paid = Number(o.paid_amount ?? 0);
                const due = Math.max(0, Number(o.payable_amt ?? 0) - paid);
                return (
                  <TableRow key={o.id} hover>
                    <TableCell className="mono">
                      {/* This page says what was billed; the order says what
                          for. */}
                      <Link component={RouterLink} to={`/orders/${o.id}`} underline="hover">
                        {o.order_no}
                      </Link>
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
