import { useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Dialog as MuiDialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useToast } from '../components/Toast';
import { useFetch, useDebounced } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import {
  IconAction,
  OrderChip,
  Pager,
  Panel,
  RowActions,
  SearchField,
  TableFrame,
} from '../components/ui';
import { apiUrl } from '../lib/config';
import type { Order, Paged } from '../lib/api';
import NextIcon from '@mui/icons-material/ArrowForwardOutlined';
import OpenIcon from '@mui/icons-material/VisibilityOutlined';
import ReceiptIcon from '@mui/icons-material/ReceiptLongOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlineOutlined';

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

  const { data, loading, error, reload } = useFetch<Paged<Order>>(`/orders?${query}`);
  const rows = data?.data ?? [];

  const toast = useToast();
  // The order to delete, held by id and looked up on render rather than kept as
  // an object: the list refetches while the dialog is open, and a row held from
  // a previous page is a record that may no longer be there.
  const [deleting, setDeleting] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const target = rows.find((r) => r.id === deleting) ?? null;

  const confirmDelete = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await api.del(`/orders/${target.id}`);
      toast.ok(`Order ${target.order_no} deleted.`);
      setDeleting(null);
      reload();
    } catch (err) {
      // The API refuses an order that has certificates, payments, or has been
      // delivered, and says which. That sentence is the whole of the answer, so
      // it is shown rather than replaced with a generic failure.
      toast.error(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

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
                <TableCell>Date</TableCell>
                <TableCell>Order</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Mobile</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Items</TableCell>
                <TableCell align="right">Reports</TableCell>
                <TableCell>Assigned to</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((o) => {
                /* Every certificate written, and not yet handed over: nothing
                   is left to do on it but deliver. */
                const ready =
                  o.status === 'preparing' &&
                  o.total_reports > 0 &&
                  o.reports_generated >= o.total_reports;
                return (
                <TableRow key={o.id} hover>
                  <TableCell>{o.order_date}</TableCell>
                  <TableCell className="mono">{o.order_no}</TableCell>
                  <TableCell sx={{ whiteSpace: 'normal', minWidth: 160 }}>
                    {o.customer_name}
                  </TableCell>
                  <TableCell className="mono">{o.mobile}</TableCell>
                  <TableCell>
                    <OrderChip status={o.status} ready={ready} />
                  </TableCell>
                  <TableCell align="right" className="tabular">
                    {o.total_items}
                  </TableCell>
                  {/*
                    Two figures, one column: written of owed. The Laravel list
                    gave each its own column and left the reader to compare them
                    across a table nine columns wide, when what is being asked is
                    how far along the order is.
                  */}
                  <TableCell align="right" className="tabular">
                    <Box
                      component="span"
                      sx={{
                        color:
                          o.reports_generated >= o.total_reports && o.total_reports > 0
                            ? 'success.main'
                            : 'text.primary',
                        fontWeight: 600,
                      }}
                    >
                      {o.reports_generated}
                    </Box>
                    <Box component="span" sx={{ color: 'text.secondary' }}>
                      {' / '}
                      {o.total_reports}
                    </Box>
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'normal', minWidth: 120 }}>
                    {o.assigned_to_name ?? (
                      <Box component="span" sx={{ color: 'text.secondary' }}>
                        Unassigned
                      </Box>
                    )}
                  </TableCell>
                  <TableCell>
                    {/*
                      View stays on the row; the receipt and the delete go
                      behind the ⋯, which `RowActions` does on its own for
                      anything marked `overflow` or `danger`.
                    */}
                    <RowActions>
                      {/*
                        One control, and which one depends on what the order is
                        waiting for. While certificates are outstanding the
                        arrow carries on with the work; once they are all
                        written the only thing left is to take the money and
                        hand it over, so the arrow gives way to Pay — a disabled
                        arrow beside a finished order is a control that exists
                        to say no.

                        Settling happens on the order's own page, where the
                        amount payable is in front of whoever takes the money.
                      */}
                      {ready ? (
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          component={RouterLink}
                          to={`/orders/${o.id}?settle=1`}
                          sx={{ mr: 0.5 }}
                        >
                          Pay
                        </Button>
                      ) : (
                        <IconAction
                          label={
                            o.reports_generated >= o.total_reports
                              ? 'Every certificate on this order is written'
                              : 'Write the next certificate'
                          }
                          icon={NextIcon}
                          disabled={o.reports_generated >= o.total_reports}
                          to={`/reports/new?order=${o.id}`}
                        />
                      )}
                      <IconAction label="View order" icon={OpenIcon} to={`/orders/${o.id}`} />
                      {/* Amending is occasional and it rewrites a record
                          somebody may already have a receipt for, so it sits
                          behind the ⋯ with the other second thoughts. */}
                      <IconAction
                        label="Edit order"
                        icon={EditIcon}
                        overflow
                        to={`/orders/${o.id}/edit`}
                      />
                      <IconAction
                        label="Receipt"
                        icon={ReceiptIcon}
                        overflow
                        onClick={() =>
                          window.open(
                            apiUrl(`/cards/order/receipt/${o.id}`),
                            '_blank',
                            'noopener',
                          )
                        }
                      />
                      <IconAction
                        label="Delete order"
                        icon={DeleteIcon}
                        danger
                        disabled={o.status === 'delivered'}
                        hint={
                          o.status === 'delivered'
                            ? 'A delivered order has been billed and settled, and cannot be deleted.'
                            : undefined
                        }
                        onClick={() => setDeleting(o.id)}
                      />
                    </RowActions>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableFrame>
      </Panel>

      {target && (
        <MuiDialog open onClose={() => setDeleting(null)} maxWidth="xs" fullWidth>
          <DialogTitle sx={{ bgcolor: '#d32f2f', color: '#fff', fontSize: '1rem', fontWeight: 600 }}>
            Delete Order
          </DialogTitle>
          <DialogContent sx={{ pt: 3, pb: 2 }}>
            <Typography variant="body1" sx={{ mb: 2 }}>
              Are you sure you want to delete <strong>{target.order_no}</strong> for{' '}
              <strong>{target.customer_name}</strong>?
            </Typography>
            <Typography variant="body2" color="text.secondary">
              This action cannot be undone. The order and its {target.total_items} item
              {target.total_items === 1 ? '' : 's'} are removed. An order with certificates issued
              or money collected against it is refused.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={() => setDeleting(null)} color="inherit">
              Cancel
            </Button>
            <Button
              variant="contained"
              sx={{ bgcolor: '#d32f2f', '&:hover': { bgcolor: '#b71c1c' } }}
              onClick={confirmDelete}
              disabled={busy}
            >
              {busy ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogActions>
        </MuiDialog>
      )}
    </>
  );
}
