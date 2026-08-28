import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import { useFetch } from '../lib/useFetch';
import { IconAction, OrderChip, Pager, Panel, RowActions, TableFrame, money } from '../components/ui';
import type { Order, Paged } from '../lib/api';
import OpenIcon from '@mui/icons-material/ChevronRightOutlined';

export default function Orders() {
  // The laboratory menu points here four ways — in progress, paid and
  // delivered, dues, and everything — so the URL holds the filter rather than
  // the component.
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const dues = params.get('dues') === '1';

  const [page, setPage] = useState(1);

  const query = new URLSearchParams({ page: String(page), per_page: '25' });
  if (status) query.set('status', status);
  if (dues) query.set('dues', '1');

  const setStatus = (next: string) => {
    setPage(1);
    setParams(next ? { status: next } : {});
  };

  const { data, loading, error } = useFetch<Paged<Order>>(`/orders?${query}`);
  const rows = data?.data ?? [];

  return (
    <>
      <Panel
        title={dues ? 'Dues orders' : 'Orders'}
        count={
          data
            ? `${data.meta.total.toLocaleString()} ${dues ? 'with a balance' : 'orders'}`
            : 'Loading…'
        }
        actions={
          <TextField
            select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            sx={{ minWidth: 0, flex: '1 1 170px', maxWidth: 170 }}
          >
            <MenuItem value="">All statuses</MenuItem>
            <MenuItem value="preparing">In progress</MenuItem>
            <MenuItem value="delivered">Delivered</MenuItem>
            <MenuItem value="not assigned">Not assigned</MenuItem>
          </TextField>
        }
      >
        <TableFrame loading={loading} error={error} empty={rows.length === 0}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Order</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Mobile</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Billed</TableCell>
                <TableCell align="right">Paid</TableCell>
                <TableCell align="right">Dues</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((o) => (
                <TableRow key={o.id} hover>
                  <TableCell className="mono">{o.order_no}</TableCell>
                  <TableCell sx={{ whiteSpace: 'normal', minWidth: 160 }}>
                    {o.customer_name}
                  </TableCell>
                  <TableCell className="mono">{o.mobile}</TableCell>
                  <TableCell>{o.order_date}</TableCell>
                  <TableCell>
                    <OrderChip status={o.status} />
                  </TableCell>
                  <TableCell align="right" className="tabular">
                    {money(o.total_amount)}
                  </TableCell>
                  <TableCell align="right" className="tabular">
                    {money(o.paid_amount)}
                  </TableCell>
                  <TableCell align="right" className="tabular">
                    {money(o.dues_amount)}
                  </TableCell>
                  <TableCell>
                    <RowActions>
                      <IconAction label="Open order" icon={OpenIcon} to={`/orders/${o.id}`} />
                    </RowActions>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
        <Pager meta={data?.meta} onPage={setPage} />
      </Panel>
    </>
  );
}
