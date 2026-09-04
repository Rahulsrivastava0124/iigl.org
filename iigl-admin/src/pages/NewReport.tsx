import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Button,
  MenuItem,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useToast } from '../components/Toast';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import {
  hint,
  remainingState,
  IconAction,
  Notice,
  Panel,
  RowActions,
  StateChip,
  TableFrame,
} from '../components/ui';
import NextIcon from '@mui/icons-material/ArrowForwardOutlined';
import FileField from '../components/FileField';
import type { Attribute, Order, Paged, Subcategory } from '../lib/api';

interface OrderItem {
  id: number;
  category_id: number;
  qty: number;
  smart_card: number;
  classic_card: number;
}

interface Unit {
  id: number;
  name: string;
  symbol: string;
}

interface Value {
  id: number;
  value_name: string;
}

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
  const [subcategoryId, setSubcategoryId] = useState('');

  const step = orderId === null ? 0 : itemId === null ? 1 : 2;

  // Only orders still in progress can take a new certificate.
  const orders = useFetch<Paged<Order>>(
    orderId === null ? '/orders?status=preparing&per_page=25' : null,
  );
  const order = useFetch<{ data: Order & { items: OrderItem[]; reports: any[] } }>(
    orderId !== null ? `/orders/${orderId}` : null,
  );
  const subcategories = useFetch<{ data: Subcategory[] }>('/catalog/subcategories');
  const units = useFetch<{ data: Unit[] }>('/catalog/units');
  const attributes = useFetch<{ data: Attribute[] }>(
    subcategoryId ? `/catalog/subcategories/${subcategoryId}/attributes` : null,
  );

  const [form, setForm] = useState({
    gross_weight: '',
    gross_wt_unit: '',
    carat_weight: '',
    stone_wt_unit: '',
    size: '',
    comments: '',
  });
  const [image, setImage] = useState<string | null>(null);
  const [values, setValues] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});

  const [busy, setBusy] = useState(false);

  const items = order.data?.data.items ?? [];
  const issued = order.data?.data.reports ?? [];
  const chosenItem = items.find((i) => i.id === itemId);

  /** How many certificates this item still has room for. */
  const remaining = (item: OrderItem) =>
    item.qty - issued.filter((r) => Number(r.order_detail_id) === item.id).length;

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post<{ data: { id: number; report_no: string } }>('/reports', {
        order_id: orderId,
        order_detail_id: itemId,
        subcategory_id: Number(subcategoryId),
        gross_weight: form.gross_weight || null,
        gross_wt_unit: form.gross_wt_unit ? Number(form.gross_wt_unit) : null,
        carat_weight: form.carat_weight || null,
        stone_wt_unit: form.stone_wt_unit ? Number(form.stone_wt_unit) : null,
        size: form.size || null,
        comments: form.comments || null,
        item_image: image,
        attributes: (attributes.data?.data ?? [])
          .filter((a) => values[a.id])
          .map((a) => ({
            attr_id: String(a.id),
            attr_value: values[a.id],
            attr_desc: notes[a.id] ?? null,
          })),
      });
      toast.ok(`Certificate ${r.data.report_no} issued.`);
      order.reload();
      // Straight back to the item step, ready for the next stone on the order.
      setItemId(null);
      setValues({});
      setNotes({});
      setImage(null);
      setForm({ gross_weight: '', gross_wt_unit: '', carat_weight: '', stone_wt_unit: '', size: '', comments: '' });
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
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
        <>
          <Panel
            title={`Certificate for item #${chosenItem.id} on ${order.data?.data.order_no}`}
            actions={<Button onClick={() => setItemId(null)}>Change item</Button>}
          >
            <Stack spacing={2.5} sx={{ p: 2 }}>
              <TextField
                select
                label="Identification"
                value={subcategoryId}
                onChange={(e) => {
                  setSubcategoryId(e.target.value);
                  setValues({});
                  setNotes({});
                }}
                slotProps={hint(
                  'What the stone is. This decides which fields the certificate carries.',
                  true,
                )}
                required
                sx={{ maxWidth: 340 }}
              >
                {(subcategories.data?.data ?? []).map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name}
                  </MenuItem>
                ))}
              </TextField>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Gross weight"
                  value={form.gross_weight}
                  onChange={(e) => setForm({ ...form, gross_weight: e.target.value })}
                />
                <TextField
                  select
                  label="Unit"
                  value={form.gross_wt_unit}
                  onChange={(e) => setForm({ ...form, gross_wt_unit: e.target.value })}
                  sx={{ minWidth: 130 }}
                >
                  {(units.data?.data ?? []).map((u) => (
                    <MenuItem key={u.id} value={u.id}>
                      {u.symbol || u.name}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  label="Stone weight"
                  value={form.carat_weight}
                  onChange={(e) => setForm({ ...form, carat_weight: e.target.value })}
                  slotProps={hint('Priced from this.', true)}
                />
                <TextField
                  select
                  label="Unit"
                  value={form.stone_wt_unit}
                  onChange={(e) => setForm({ ...form, stone_wt_unit: e.target.value })}
                  sx={{ minWidth: 130 }}
                >
                  {(units.data?.data ?? []).map((u) => (
                    <MenuItem key={u.id} value={u.id}>
                      {u.symbol || u.name}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Dimensions"
                  value={form.size}
                  onChange={(e) => setForm({ ...form, size: e.target.value })}
                />
                <TextField
                  label="Comments"
                  value={form.comments}
                  onChange={(e) => setForm({ ...form, comments: e.target.value })}
                  slotProps={hint('Printed on the card.')}
                />
              </Stack>

              <FileField
                label="Photograph"
                bucket="report"
                value={image}
                onChange={setImage}
                helperText="Printed on the card beside the QR code."
              />
            </Stack>
          </Panel>

          {subcategoryId && (
            <>
              <Typography variant="h2" sx={{ mt: 4, mb: 1.5 }}>
                Grading
              </Typography>
              <Panel>
                <TableFrame
                  loading={attributes.loading}
                  error={attributes.error}
                  empty={(attributes.data?.data.length ?? 0) === 0}
                >
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Field</TableCell>
                        <TableCell>Value</TableCell>
                        <TableCell>Note</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(attributes.data?.data ?? []).map((a) => (
                        <AttributeRow
                          key={a.id}
                          attribute={a}
                          value={values[a.id] ?? ''}
                          note={notes[a.id] ?? ''}
                          onValue={(v) => setValues({ ...values, [a.id]: v })}
                          onNote={(v) => setNotes({ ...notes, [a.id]: v })}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </TableFrame>
              </Panel>

              <Stack direction="row" spacing={2} sx={{ mt: 3, alignItems: 'center' }}>
                <Button
                  variant="contained"
                  size="large"
                  disabled={busy || !subcategoryId}
                  onClick={submit}
                >
                  {busy ? 'Issuing…' : 'Issue certificate'}
                </Button>
                <Typography variant="body2" color="text.secondary">
                  The number is allocated when you issue. It cannot be changed afterwards.
                </Typography>
              </Stack>
            </>
          )}

          {!subcategoryId && (
            <Notice kind="info" sx={{ mt: 3, mb: 0 }}>
              Choose what the stone is to see its grading fields.
            </Notice>
          )}
        </>
      )}
    </>
  );
}

/**
 * One grading field. An attribute marked `is_opensource` takes free text — a
 * value outside the list is added to it — so that renders as a text box rather
 * than a menu.
 */
function AttributeRow({
  attribute,
  value,
  note,
  onValue,
  onNote,
}: {
  attribute: Attribute;
  value: string;
  note: string;
  onValue: (v: string) => void;
  onNote: (v: string) => void;
}) {
  const values = useFetch<{ data: Value[] }>(
    attribute.is_opensource ? null : `/catalog/attributes/${attribute.id}/values`,
  );

  return (
    <TableRow>
      <TableCell sx={{ whiteSpace: 'normal', minWidth: 180 }}>
        {attribute.attr_name}
        {attribute.is_required ? ' *' : ''}
      </TableCell>
      <TableCell sx={{ minWidth: 220 }}>
        {attribute.is_opensource ? (
          <TextField
            value={value}
            onChange={(e) => onValue(e.target.value)}
            placeholder="Free text"
          />
        ) : (
          <TextField select value={value} onChange={(e) => onValue(e.target.value)}>
            <MenuItem value="">—</MenuItem>
            {(values.data?.data ?? []).map((v) => (
              <MenuItem key={v.id} value={v.id}>
                {v.value_name}
              </MenuItem>
            ))}
          </TextField>
        )}
      </TableCell>
      <TableCell sx={{ minWidth: 200 }}>
        <TextField value={note} onChange={(e) => onNote(e.target.value)} placeholder="Optional" />
      </TableCell>
    </TableRow>
  );
}
