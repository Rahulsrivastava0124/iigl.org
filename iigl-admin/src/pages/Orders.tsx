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
import { useFetch, useDebounced } from '../lib/useFetch';
import {
  IconAction,
  OrderChip,
  Pager,
  Panel,
  RowActions,
  SearchField,
  TableFrame,
  money,
} from '../components/ui';
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

  // Searched on the server, not in the browser: the list is one page of 25 out
  // of 9,600 orders, so filtering what has already arrived would search the
  // page rather than the orders.
  //
  // The term is held for 150ms so a typed word is one query rather than eight,
  // and `useFetch` discards all but the newest response — a debounce shortens
  // the queue but does not stop two from overlapping.
  const [search, setSearch] = useState('');
  const term = useDebounced(search);

  const query = new URLSearchParams({ page: String(page), per_page: '25' });
  if (status) query.set('status', status);
  if (dues) query.set('dues', '1');
  if (term.trim()) query.set('q', term.trim());

  const setStatus = (next: string) => {
    setPage(1);
    setParams(next ? { status: next } : {});
  };

  const { data, loading, error } = useFetch<Paged<Order>>(`/orders?${query}`);
  const rows = data?.data ?? [];

  return (
    <>
      <Panel
        footer={<Pager meta={data?.meta} onPage={setPage} />}
        title={dues ? 'Dues orders' : 'Orders'}
        count={
          data
            ? `${data.meta.total.toLocaleString()} ${dues ? 'with a balance' : 'orders'}`
            : 'Loading…'
        }
        actions={
          <>
          <SearchField
            placeholder="Order no, customer, mobile…"
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
            onChange={(e) => setStatus(e.target.value)}
            sx={{ width: 170 }}
          >
            <MenuItem value="">All statuses</MenuItem>
            <MenuItem value="preparing">In progress</MenuItem>
            <MenuItem value="delivered">Delivered</MenuItem>
            <MenuItem value="not assigned">Not assigned</MenuItem>
          </TextField>
          </>
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
      </Panel>
    </>
  );
}
