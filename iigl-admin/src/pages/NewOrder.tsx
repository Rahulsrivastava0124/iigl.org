import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormLabel,
  Grid,
  IconButton,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import dayjs from 'dayjs';
import AddIcon from '@mui/icons-material/AddOutlined';
import RemoveIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { useToast } from '../components/Toast';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { hint, Panel } from '../components/ui';
import FileField from '../components/FileField';
import type { Category, Paged } from '../lib/api';

interface Item {
  /** The `order_details` row, on an order being amended. New lines have none. */
  id?: number;
  category_id: string;
  qty: string;
  smart_card: boolean;
  classic_card: boolean;
}

const BLANK_ITEM: Item = { category_id: '', qty: '1', smart_card: true, classic_card: false };

/** An order as `GET /api/orders/{id}` returns it, for the fields this form owns. */
interface OrderRecord {
  customer_name: string | null;
  mobile: string | null;
  alt_mobile: string | null;
  email: string | null;
  gst: string | null;
  address: string | null;
  dues_date: string | null;
  assigned_to: number | null;
  show_name_in_card: number | null;
  show_name_input: string | null;
  show_image_in_card: number | null;
  show_image_in_card_file: string | null;
  items: {
    id: number;
    category_id: number;
    qty: number;
    smart_card: number;
    classic_card: number;
  }[];
}

/** Somebody on this laboratory's books, for the Assign to list. */
interface StaffRow {
  id: number;
  fullname: string;
  empid: string | null;
  is_active: number;
}

/**
 * How the counter writes a delivery time, and how the column holds it.
 *
 * `orders.dues_date` is a varchar and the order document prints it verbatim —
 * "Expected ready by Sat 05 Sep 2026 12:03 AM" — so this is the format, not a
 * display choice. It is what the Laravel picker wrote, and changing it would
 * make every new order read differently from every old one on the same page.
 */
const DUES_FORMAT = 'ddd DD MMM YYYY hh:mm A';

/**
 * A yes/no question with whatever answering "yes" then asks for underneath.
 *
 * Two of these sit beside the Assign to field, and the three columns have to
 * line up: a caption above a radio row starts higher than an outlined field's
 * floating label does, which is what made the bottom of this form look ragged.
 * `FormLabel` puts all three on the same first line, and the fixed gap keeps
 * the follow-up control at the same height in both columns.
 */
function YesNo({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <FormControl component="fieldset" fullWidth>
      <FormLabel
        component="legend"
        sx={{ fontSize: 13.5, fontWeight: 600, color: 'text.primary', mb: 0.5 }}
      >
        {label}
      </FormLabel>
      <RadioGroup row value={value ? '1' : '0'} onChange={(e) => onChange(e.target.value === '1')}>
        <FormControlLabel value="1" control={<Radio size="small" />} label="Yes" />
        <FormControlLabel value="0" control={<Radio size="small" />} label="No" />
      </RadioGroup>
      <Box sx={{ mt: 1 }}>{children}</Box>
    </FormControl>
  );
}

/**
 * Taking an order at the counter — "Collect New" in the laboratory menu — and
 * amending one afterwards, which is the same thirty fields and the same rules.
 *
 * One screen for both: `/orders/new` and `/orders/:id/edit`. Two copies of a
 * form this size drift, and the half that drifts is always the one nobody
 * opens on a Tuesday.
 *
 * What amending cannot do is the API's business, not this form's: a line that
 * has certificates against it cannot be removed, and its quantity cannot go
 * below what has been issued. The refusal comes back as a message.
 *
 * The customer is not a record of its own: typing a mobile number that has
 * ordered before fills the rest of the details from the last order, which is
 * how the Laravel counter screen works and why the same person can appear
 * under two spellings.
 *
 * Nothing here sets a price. The totals come from the price bands the moment
 * the order is saved, so the counter cannot quote a figure the books disagree
 * with.
 */
export default function NewOrder() {
  const toast = useToast();
  const navigate = useNavigate();
  /** Set when amending; absent when taking a new order. */
  const { id: orderId } = useParams();
  const amending = Boolean(orderId);
  const categories = useFetch<{ data: Category[] }>('/catalog/categories');
  const cats = categories.data?.data ?? [];

  /*
    Who the job can be handed to. The Laravel screen narrowed this to employees
    whose role may create a report — the people who actually write certificates
    — and this is the same list, less that filter: permissions are per role and
    per person here, and a laboratory that has just made its own roles would
    find the list empty under the old rule.
  */
  const staff = useFetch<Paged<StaffRow>>('/users/staff?per_page=100');
  const team = (staff.data?.data ?? []).filter((s) => s.is_active);

  const [customer, setCustomer] = useState({
    customer_name: '',
    mobile: '',
    alt_mobile: '',
    email: '',
    gst: '',
    address: '',
  });
  const [items, setItems] = useState<Item[]>([{ ...BLANK_ITEM }]);
  const [assignedTo, setAssignedTo] = useState('');
  /* Two hours out, as the counter picker always opened: a job taken now is
     rarely ready before then, and a blank date is one nobody fills in. */
  const [dues, setDues] = useState(() => dayjs().add(2, 'hour'));
  const [showName, setShowName] = useState(false);
  const [nameOnCard, setNameOnCard] = useState('');
  const [showImage, setShowImage] = useState(false);
  const [imageOnCard, setImageOnCard] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /*
    Amending. The record fills the form once, when it arrives; after that the
    form owns the state, or every keystroke would be overwritten by the fetch
    it triggered.
  */
  const existing = useFetch<{ data: OrderRecord }>(orderId ? `/orders/${orderId}` : null);
  const loaded = existing.data?.data;

  useEffect(() => {
    if (!loaded) return;
    setCustomer({
      customer_name: loaded.customer_name ?? '',
      mobile: loaded.mobile ?? '',
      alt_mobile: loaded.alt_mobile ?? '',
      email: loaded.email ?? '',
      gst: loaded.gst ?? '',
      address: loaded.address ?? '',
    });
    setItems(
      (loaded.items ?? []).map((it) => ({
        id: Number(it.id),
        category_id: String(it.category_id),
        qty: String(it.qty),
        smart_card: Boolean(it.smart_card),
        classic_card: Boolean(it.classic_card),
      })),
    );
    setAssignedTo(loaded.assigned_to == null ? '' : String(loaded.assigned_to));
    // The column holds whatever the counter wrote. An unparseable one is left
    // at the default rather than shown as "Invalid Date".
    const when = loaded.dues_date ? dayjs(loaded.dues_date, DUES_FORMAT) : null;
    if (when?.isValid()) setDues(when);
    setShowName(Boolean(loaded.show_name_in_card));
    setNameOnCard(loaded.show_name_input ?? '');
    setShowImage(Boolean(loaded.show_image_in_card));
    setImageOnCard(loaded.show_image_in_card_file ?? null);
  }, [loaded]);

  const set = (key: keyof typeof customer, v: string) =>
    setCustomer((c) => ({ ...c, [key]: v }));

  const setItem = (i: number, patch: Partial<Item>) =>
    setItems((rows) => rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));

  /** Looks the number up when it is long enough to be one. */
  const lookup = async () => {
    const mobile = customer.mobile.trim();
    if (mobile.length < 10) return;
    try {
      const res = await api.get<{ data: Record<string, string> | null }>(
        `/orders/customer/lookup?mobile=${encodeURIComponent(mobile)}`,
      );
      const c = res.data;
      if (!c) return;
      setCustomer((prev) => ({
        ...prev,
        customer_name: c.customer_name ?? prev.customer_name,
        alt_mobile: c.alt_mobile ?? prev.alt_mobile,
        email: c.email ?? prev.email,
        gst: c.gst ?? prev.gst,
        address: c.address ?? prev.address,
      }));
      toast.ok(`Filled in from the last order for ${c.customer_name ?? mobile}.`);
    } catch {
      // A number nobody has ordered under is the normal case, not an error.
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        ...customer,
        assigned_to: assignedTo === '' ? null : Number(assignedTo),
        dues_date: dues.isValid() ? dues.format(DUES_FORMAT) : null,
        // The answer and what it is an answer to travel together: "no" sends no
        // name and no picture, so a card cannot carry one nobody asked for.
        show_name_in_card: showName ? 1 : 0,
        show_name_input: showName ? nameOnCard.trim() || null : null,
        show_image_in_card: showImage ? 1 : 0,
        show_image_in_card_file: showImage ? imageOnCard : null,
        items: items.map((i) => ({
          // A line already on the order keeps its id, so it is amended rather
          // than dropped and re-added — which would strand its certificates.
          ...(i.id ? { id: i.id } : {}),
          category_id: Number(i.category_id),
          qty: Number(i.qty),
          smart_card: i.smart_card,
          classic_card: i.classic_card,
        })),
      };

      if (amending) {
        await api.patch(`/orders/${orderId}`, body);
        toast.ok('Order updated.');
        navigate(`/orders/${orderId}`);
        return;
      }

      const res = await api.post<{ data: { id: number } }>('/orders', body);
      navigate(`/orders/${res.data.id}`);
    } catch (e) {
      toast.error(messageOf(e));
      setBusy(false);
    }
  };

  const ready =
    customer.customer_name.trim() !== '' &&
    customer.mobile.trim() !== '' &&
    items.every(
      (i) => i.category_id !== '' && Number(i.qty) >= 1 && (i.smart_card || i.classic_card),
    );

  /** The three columns the paper form is laid out in. */
  const CELL = { xs: 12, md: 4 } as const;

  return (
    <Panel title={amending ? 'Amend order' : 'Collect Product'}>
      {/* The house layout for a full-page form: the fields are inset from the
          panel's edge, and the actions sit under a rule at the foot of it. */}
      <Box
        component="form"
        onSubmit={(e: React.FormEvent) => {
          e.preventDefault();
          if (ready && !busy) void save();
        }}
        sx={{ p: 2 }}
      >
        <Grid container spacing={2}>
          <Grid size={CELL}>
            <TextField
              label="Customer's Mobile No."
              placeholder="Eg. 84024523654"
              value={customer.mobile}
              onChange={(e) => set('mobile', e.target.value)}
              onBlur={lookup}
              required
              slotProps={{
                htmlInput: { maxLength: 10, inputMode: 'numeric' },
                ...hint('If they have ordered before, the rest fills itself in.'),
              }}
            />
          </Grid>
          <Grid size={CELL}>
            <TextField
              label="Customer's Name"
              placeholder="Eg. Rajesh Mishra"
              value={customer.customer_name}
              onChange={(e) => set('customer_name', e.target.value)}
              required
            />
          </Grid>
          <Grid size={CELL}>
            <TextField
              label="Alt Mobile No."
              placeholder="Eg. 84024523654"
              value={customer.alt_mobile}
              onChange={(e) => set('alt_mobile', e.target.value)}
              slotProps={{ htmlInput: { maxLength: 10, inputMode: 'numeric' } }}
            />
          </Grid>
          <Grid size={CELL}>
            <TextField
              label="Email ID"
              type="email"
              placeholder="Eg. example@gmail.com"
              value={customer.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </Grid>
          <Grid size={CELL}>
            <TextField
              label="GST No"
              placeholder="Enter GST number"
              value={customer.gst}
              onChange={(e) => set('gst', e.target.value.toUpperCase())}
              slotProps={hint('A GST number is what makes this a registered customer.')}
            />
          </Grid>
          <Grid size={CELL}>
            <TextField
              label="Complete Address"
              placeholder="Full address"
              value={customer.address}
              onChange={(e) => set('address', e.target.value)}
            />
          </Grid>

          {/* --------------------------------------------------- items */}
          <Grid size={12}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 600, mt: 1 }}>Items Details</Typography>
          </Grid>
          <Grid size={12}>
            <Table size="small">
              <TableHead>
                {/*
                  Proportions, not pixels. Fixed widths on four columns left the
                  fifth absorbing every spare pixel of a wide screen, so Category
                  ran half the page while the checkboxes huddled at the far right.
                */}
                <TableRow>
                  <TableCell sx={{ width: '40%' }}>Category</TableCell>
                  <TableCell sx={{ width: '15%' }}>No. of Items</TableCell>
                  <TableCell align="center" sx={{ width: '17%' }}>
                    Issue Smart Card
                  </TableCell>
                  <TableCell align="center" sx={{ width: '17%' }}>
                    Issue Classic Card
                  </TableCell>
                  <TableCell align="center" sx={{ width: '11%' }}>
                    #
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((item, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <TextField
                        select
                        value={item.category_id}
                        onChange={(e) => setItem(i, { category_id: e.target.value })}
                        fullWidth
                        disabled={categories.loading}
                        slotProps={{ select: { displayEmpty: true } }}
                      >
                        <MenuItem value="" disabled>
                          Select Category
                        </MenuItem>
                        {cats.map((c) => (
                          <MenuItem key={c.id} value={c.id}>
                            {c.name}
                          </MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                    <TableCell>
                      <TextField
                        type="number"
                        value={item.qty}
                        onChange={(e) => setItem(i, { qty: e.target.value })}
                        slotProps={{ htmlInput: { min: 1 } }}
                        sx={{ width: 110 }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Checkbox
                        size="small"
                        checked={item.smart_card}
                        onChange={(e) => setItem(i, { smart_card: e.target.checked })}
                        slotProps={{ input: { 'aria-label': `Issue smart card for item ${i + 1}` } }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Checkbox
                        size="small"
                        checked={item.classic_card}
                        onChange={(e) => setItem(i, { classic_card: e.target.checked })}
                        slotProps={{
                          input: { 'aria-label': `Issue classic card for item ${i + 1}` },
                        }}
                      />
                    </TableCell>
                    {/*
                      The last row adds another; the ones above it are removed.
                      One control in one column, as the paper form has it, rather
                      than an Add button in the panel header a row away from the
                      row it appends to.
                    */}
                    <TableCell align="center">
                      {i === items.length - 1 ? (
                        <IconButton
                          color="primary"
                          aria-label="Add item"
                          onClick={() => setItems((rows) => [...rows, { ...BLANK_ITEM }])}
                        >
                          <AddIcon fontSize="small" />
                        </IconButton>
                      ) : (
                        <IconButton
                          size="small"
                          aria-label={`Remove item ${i + 1}`}
                          onClick={() => setItems((rows) => rows.filter((_, n) => n !== i))}
                        >
                          <RemoveIcon fontSize="small" />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Grid>

          {/* ------------------------------------------- handover details */}
          <Grid size={CELL}>
            <Stack spacing={2}>
              <TextField
                select
                label="Assign to"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                disabled={staff.loading}
                slotProps={{
                  select: { displayEmpty: true },
                  /*
                    `displayEmpty` draws "Nobody yet" while the value is still
                    empty, and an empty value leaves the label sitting at full
                    size in the same place — the two were printed on top of each
                    other. The label is told to stay up: there is always something
                    in the box for it to sit above.
                  */
                  inputLabel: { shrink: true },
                  // `true`: on a select the mark has to clear the dropdown arrow.
                  ...hint('Who writes the certificates for this order. It can be changed later.', true),
                }}
              >
                <MenuItem value="">Nobody yet</MenuItem>
                {team.map((s) => (
                  <MenuItem key={s.id} value={String(s.id)}>
                    {s.fullname}
                    {s.empid ? ` (${s.empid})` : ''}
                  </MenuItem>
                ))}
              </TextField>

              <DateTimePicker
                label="Delivery Date"
                format={DUES_FORMAT}
                value={dues}
                onChange={(next) => next && setDues(next)}
                slotProps={{ textField: { fullWidth: true } }}
              />
            </Stack>
          </Grid>

          <Grid size={CELL}>
            <YesNo
              label="Show Name on Card"
              value={showName}
              onChange={setShowName}
            >
              {/* Shown either way so the column does not jump when the answer
                  changes, and disabled until it is "Yes" — a name typed under
                  "No" is printed nowhere. */}
              <TextField
                label="Name to print"
                value={nameOnCard}
                onChange={(e) => setNameOnCard(e.target.value)}
                disabled={!showName}
                fullWidth
              />
            </YesNo>
          </Grid>

          <Grid size={CELL}>
            <YesNo label="Show Image on Card" value={showImage} onChange={setShowImage}>
              {showImage ? (
                <FileField
                  label="Picture for the card"
                  bucket="order"
                  value={imageOnCard}
                  onChange={setImageOnCard}
                  accept="image/png,image/jpeg"
                  ratio="4 / 3"
                  fill
                />
              ) : null}
            </YesNo>
          </Grid>

        </Grid>

        <Stack
          direction="row"
          spacing={2}
          sx={{
            mt: 3,
            pt: 2,
            borderTop: 1,
            borderColor: 'divider',
            justifyContent: 'flex-end',
          }}
        >
          <Button variant="contained" type="submit" disabled={!ready || busy}>
            {busy ? 'Saving…' : amending ? 'Save changes' : 'Collect order'}
          </Button>
          <Button
            variant="outlined"
            onClick={() => navigate(amending ? `/orders/${orderId}` : '/orders')}
            disabled={busy}
          >
            Cancel
          </Button>
        </Stack>
      </Box>
    </Panel>
  );
}
