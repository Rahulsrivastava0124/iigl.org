import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Button,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material';
import { useToast } from '../components/Toast';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import {
  remainingState,
  IconAction,
  Panel,
  RowActions,
  StateChip,
  TableFrame,
} from '../components/ui';
import NextIcon from '@mui/icons-material/ArrowForwardOutlined';
import CertificateForm, {
  EMPTY_DRAFT,
  type CertificatePayload,
  type OrderHead,
  type OrderItem,
} from '../components/CertificateForm';
import type { Order, Paged } from '../lib/api';

const STEPS = ['Choose the order', 'Choose the item', 'Describe the stone'];

/**
 * Issuing a certificate.
 *
 * A certificate belongs to an order item, so it cannot be created standalone —
 * the order and the item come first, then the stone itself. The form follows
 * that order rather than presenting one long page with ids to type in.
 */
export default function NewReport() {
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [orderId, setOrderId] = useState<number | null>(
    params.get('order') ? Number(params.get('order')) : null,
  );
  const [itemId, setItemId] = useState<number | null>(null);

  const step = orderId === null ? 0 : itemId === null ? 1 : 2;

  // Only orders still in progress can take a new certificate.
  const orders = useFetch<Paged<Order>>(
    orderId === null ? '/orders?status=preparing&per_page=25' : null,
  );
  const order = useFetch<{ data: Order & OrderHead & { items: OrderItem[]; reports: any[] } }>(
    orderId !== null ? `/orders/${orderId}` : null,
  );

  const items = order.data?.data.items ?? [];
  const issued = order.data?.data.reports ?? [];
  const chosenItem = items.find((i) => i.id === itemId);

  /** How many certificates this item still has room for. */
  const remaining = (item: OrderItem) =>
    item.qty - issued.filter((r) => Number(r.order_detail_id) === item.id).length;

  const issue = async (payload: CertificatePayload) => {
    const r = await api.post<{ data: { id: number; report_no: string } }>('/reports', {
      order_id: orderId,
      order_detail_id: itemId,
      ...payload,
    });
    toast.ok(`Certificate ${r.data.report_no} issued.`);
    order.reload();
    // Straight back to the item step, ready for the next stone on the order.
    setItemId(null);
  };

  return (
    <>
      {/* The stepper carries the way out now that the page has no heading: it
          is the one row present at every step. */}
      <Stack
        direction="row"
        spacing={2}
        sx={{ mb: 3, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}
      >
        <Stepper activeStep={step} sx={{ flex: 1, minWidth: 320, maxWidth: 620 }}>
          {STEPS.map((s) => (
            <Step key={s}>
              <StepLabel>{s}</StepLabel>
            </Step>
          ))}
        </Stepper>
        <Button onClick={() => navigate('/reports')}>
          Back to certificates
        </Button>
      </Stack>


      {/* ---------------------------------------------------- 1. the order */}
      {step === 0 && (
        <Panel title="Orders in progress">
          <TableFrame
            loading={orders.loading}
            error={orders.error}
            empty={(orders.data?.data.length ?? 0) === 0}
          >
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Order</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell>Mobile</TableCell>
                  <TableCell>Taken</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {(orders.data?.data ?? []).map((o) => (
                  <TableRow key={o.id} hover>
                    <TableCell className="mono">{o.order_no}</TableCell>
                    <TableCell>{o.customer_name}</TableCell>
                    <TableCell className="mono">{o.mobile}</TableCell>
                    <TableCell>{o.order_date}</TableCell>
                    <TableCell>
                      {/* An arrow, not the word: this moves the wizard on to
                          the next step, and a row's controls are icons here. */}
                      <RowActions>
                        <IconAction
                          label="Choose this order"
                          icon={NextIcon}
                          onClick={() => setOrderId(o.id)}
                        />
                      </RowActions>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        </Panel>
      )}

      {/* ----------------------------------------------------- 2. the item */}
      {step === 1 && (
        <Panel
          title={`Items on ${order.data?.data.order_no ?? '…'}`}
          actions={<Button onClick={() => setOrderId(null)}>Change order</Button>}
        >
          <TableFrame loading={order.loading} error={order.error} empty={items.length === 0}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Item</TableCell>
                  <TableCell>Cards</TableCell>
                  <TableCell align="right">Ordered</TableCell>
                  <TableCell align="right">Issued</TableCell>
                  <TableCell align="right">Remaining</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((it) => {
                  const left = remaining(it);
                  return (
                    <TableRow key={it.id} hover>
                      <TableCell className="mono">#{it.id}</TableCell>
                      <TableCell>
                        {[it.smart_card && 'Smart', it.classic_card && 'Classic']
                          .filter(Boolean)
                          .join(' + ') || '—'}
                      </TableCell>
                      <TableCell align="right" className="tabular">{it.qty}</TableCell>
                      <TableCell align="right" className="tabular">{it.qty - left}</TableCell>
                      <TableCell align="right">
                        <StateChip {...remainingState(left)} />
                      </TableCell>
                      <TableCell>
                        <RowActions>
                          <IconAction
                            label={
                              left <= 0
                                ? 'Every card on this item is written'
                                : 'Write a certificate for this item'
                            }
                            icon={NextIcon}
                            disabled={left <= 0}
                            onClick={() => setItemId(it.id)}
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
      )}

      {/* ---------------------------------------------------- 3. the stone */}
      {step === 2 && chosenItem && (
        <CertificateForm
          // A fresh form for every item: nothing typed for one stone carries
          // over to the next.
          key={chosenItem.id}
          title="Issue certificate"
          actions={<Button onClick={() => setItemId(null)}>Change item</Button>}
          head={order.data?.data}
          item={chosenItem}
          itemNote={
            <>
              Item #{chosenItem.id} ·{' '}
              {[chosenItem.smart_card && 'Smart', chosenItem.classic_card && 'Classic']
                .filter(Boolean)
                .join(' + ') || 'No card'}{' '}
              · {Math.max(remaining(chosenItem), 0)} of {chosenItem.qty} left
            </>
          }
          initial={EMPTY_DRAFT}
          fillUnits
          submitLabel="Issue certificate"
          busyLabel="Issuing…"
          footnote="The number is allocated when you issue. It cannot be changed afterwards."
          onCancel={() => setItemId(null)}
          onSubmit={issue}
        />
      )}
    </>
  );
}
