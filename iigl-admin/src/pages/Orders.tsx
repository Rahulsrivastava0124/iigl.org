import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Button,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import { useFetch } from '../lib/useFetch';
import { OrderChip, PageHead, Pager, Panel, TableFrame, money } from '../components/ui';
import type { Order, Paged } from '../lib/api';

export default function Orders() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');

  const query = new URLSearchParams({ page: String(page), per_page: '25' });
  if (status) query.set('status', status);

  const { data, loading, error } = useFetch<Paged<Order>>(`/orders?${query}`);
  const rows = data?.data ?? [];

  return (
    <>
      <PageHead
        title="Orders"
        subtitle={data ? `${data.meta.total.toLocaleString()} orders` : 'Loading…'}
      />

      <Panel
        actions={
          <TextField
            select
            label="Status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            sx={{ minWidth: 170 }}
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
                    <Button size="small" component={RouterLink} to={`/orders/${o.id}`}>
                      Open
                    </Button>
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
