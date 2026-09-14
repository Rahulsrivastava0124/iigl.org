import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Autocomplete,
  Box,
  Button,
  Grid,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/SaveOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBackOutlined';
import { useToast } from '../components/Toast';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf, useAuth } from '../lib/auth';
import { isSuper } from '../lib/portal';
import { Panel, hint } from '../components/ui';
import FileField from '../components/FileField';
import YesNoField from '../components/YesNoField';
import type { Category, Lab } from '../lib/api';

/**
 * Add or edit a registered customer.
 *
 * Until this existed a "registered" customer was whoever had put a GST number
 * on an order, which cannot hold anybody who has not ordered yet and cannot say
 * anything an order does not — the company as against the person, the city, or
 * the terms they have been agreed.
 *
 * The terms are a discount per category. A jeweller sending diamond work in bulk
 * and the same jeweller sending the odd gemstone are not on the same footing, so
 * each category carries its own — and because most customers are given one
 * rate across the board, the first row writes that rate into every category.
 *
 * Stored, not yet applied to an order: pricing is ported behaviour verified
 * against Laravel, and billing a discount is its own change.
 */

type DiscountType = 'percent' | 'per_pc';

interface DiscountRow {
  discount_type: DiscountType;
  value: string;
}

const BLANK = {
  lab_id: '',
  company_name: '',
  owner_name: '',
  mobile: '',
  email: '',
  area: '',
  city: '',
  state: '',
  gst_no: '',
};

/** A row of Master › State or Master › District. */
interface PlaceRow {
  id: number;
  name: string;
  state_id?: number;
}

/** Names compared loosely: "West Bengal" is the Master row called "West bengal". */
const samePlace = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const TYPE_LABEL: Record<DiscountType, string> = {
  percent: 'Percentage (%)',
  per_pc: 'Per Pc. (₹)',
};

export default function RegisteredCustomerForm() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const admin = isSuper(user);

  const categories = useFetch<{ data: Category[] }>('/catalog/categories');
  // Head office belongs to no laboratory, so it says which one this customer is
  // registered with. A laboratory and its staff are never asked.
  const labs = useFetch<{ data: Lab[] }>(admin ? '/users/laboratories' : null);
  const existing = useFetch<{
    data: typeof BLANK & {
      lab_id: number;
      discounts: { category_id: number; discount_type: DiscountType; value: number }[];
      show_name_in_card: number;
      show_name_input: string | null;
      show_image_in_card: number;
      show_image_in_card_file: string | null;
      logo: string | null;
    };
  }>(editing ? `/customers/accounts/${id}` : null);

  /*
    State and city from the Master lists, so the website's state and city
    filters see one spelling of each place rather than every way it was typed.
    Free text is still accepted: a town missing from Master is common, and a
    customer should not wait on somebody adding it there.
  */
  const states = useFetch<{ data: PlaceRow[] }>('/master/states?active=1');
  const districts = useFetch<{ data: PlaceRow[] }>('/master/districts?active=1');

  /* Opened by Edit on a customer known only from their orders: the form starts
     from what those orders say about them, and saving registers them. */
  const prefill = (useLocation().state as { prefill?: Partial<typeof BLANK> } | null)?.prefill;
  const [form, setForm] = useState(() => ({ ...BLANK, ...(editing ? {} : prefill) }));
  const [discounts, setDiscounts] = useState<Record<number, DiscountRow>>({});
  // The "every category" row. Kept apart from the per-category rows so a person
  // can still correct one category after setting them all.
  const [all, setAll] = useState<DiscountRow>({ discount_type: 'percent', value: '' });
  /*
    What they want printed on their certificates. The same four fields an order
    carries, so a later order for this customer can take them as they are.
  */
  const [showName, setShowName] = useState(false);
  const [nameOnCard, setNameOnCard] = useState('');
  const [showImage, setShowImage] = useState(false);
  const [imageOnCard, setImageOnCard] = useState<string | null>(null);
  /** The logo the website shows on this customer's card. */
  const [logo, setLogo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cats = categories.data?.data ?? [];

  useEffect(() => {
    const d = existing.data?.data;
    if (!d) return;
    setForm({
      lab_id: String(d.lab_id ?? ''),
      company_name: d.company_name ?? '',
      owner_name: d.owner_name ?? '',
      mobile: d.mobile ?? '',
      email: d.email ?? '',
      area: d.area ?? '',
      city: d.city ?? '',
      state: d.state ?? '',
      gst_no: d.gst_no ?? '',
    });
    setLogo(d.logo ?? null);
    setShowName(Boolean(d.show_name_in_card));
    setNameOnCard(d.show_name_input ?? '');
    setShowImage(Boolean(d.show_image_in_card));
    setImageOnCard(d.show_image_in_card_file ?? null);
    setDiscounts(
      Object.fromEntries(
        d.discounts.map((x) => [x.category_id, { discount_type: x.discount_type, value: String(x.value) }]),
      ),
    );
  }, [existing.data]);

  /*
    The "All categories" row reads back what it wrote.

    It was only ever set by typing into it, so a customer saved at 10% on every
    category reopened with that row blank — the one row somebody looks at — and
    the discount read as lost although each category below still held it. When
    every category carries the same discount, the top row shows it.
  */
  useEffect(() => {
    const saved = existing.data?.data.discounts ?? [];
    const first = saved[0];
    if (!first || cats.length === 0) return;
    const uniform =
      cats.every((c) => saved.some((x) => x.category_id === c.id)) &&
      saved.every((x) => x.discount_type === first.discount_type && Number(x.value) === Number(first.value));
    if (uniform) setAll({ discount_type: first.discount_type, value: String(first.value) });
  }, [existing.data, categories.data]);

  const rowFor = (categoryId: number): DiscountRow =>
    discounts[categoryId] ?? { discount_type: 'percent', value: '' };

  const setRow = (categoryId: number, next: Partial<DiscountRow>) =>
    setDiscounts((d) => ({ ...d, [categoryId]: { ...rowFor(categoryId), ...next } }));

  /*
    Writing the "every category" row writes every category.

    Live, not behind an Apply button: typing a rate and then having to press
    something for it to take is a step people miss, and they save a form whose
    categories are still empty. A category changed afterwards keeps its own value
    until the top row is touched again.
  */
  const setEvery = (next: Partial<DiscountRow>) => {
    const merged = { ...all, ...next };
    setAll(merged);
    setDiscounts(Object.fromEntries(cats.map((c) => [c.id, { ...merged }])));
  };

  const set = (key: keyof typeof BLANK, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        // Optional: none is head office's own customer.
        ...(admin && !editing && form.lab_id ? { lab_id: Number(form.lab_id) } : {}),
        company_name: form.company_name,
        owner_name: form.owner_name,
        mobile: form.mobile,
        email: form.email,
        area: form.area,
        city: form.city,
        state: form.state,
        logo,
        gst_no: form.gst_no,
        show_name_in_card: showName ? 1 : 0,
        show_name_input: showName ? nameOnCard.trim() || null : null,
        show_image_in_card: showImage ? 1 : 0,
        show_image_in_card_file: showImage ? imageOnCard : null,
        // Empty and zero both mean no discount, and are sent as zero so the API
        // drops the row rather than keeping a stale one.
        discounts: cats.map((c) => {
          const r = rowFor(c.id);
          return { category_id: c.id, discount_type: r.discount_type, value: Number(r.value) || 0 };
        }),
      };
      if (editing) {
        await api.patch(`/customers/accounts/${id}`, body);
        toast.ok(`${form.company_name} updated.`);
      } else {
        await api.post('/customers/accounts', body);
        toast.ok(`${form.company_name} registered.`);
      }
      navigate('/customers');
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const cell = { xs: 12, md: 4 } as const;

  const stateNames = (states.data?.data ?? []).map((r) => r.name);
  const stateRow = (states.data?.data ?? []).find((r) => samePlace(r.name, form.state));
  const cityNames = (districts.data?.data ?? [])
    .filter((d) => !stateRow || d.state_id === stateRow.id)
    .map((d) => d.name);

  return (
    /*
      One form across two Panels.

      Each block carries its own Panel title, as OrderDetail's Items and
      Certificates do, rather than a heading typed into the middle of one panel
      — a full-page form here has no section headers, and "Discount" set in
      Typography was the one that did. The buttons sit under both, because Save
      commits the customer and their terms together.
    */
    <Box component="form" onSubmit={submit}>
      <Panel
        title={editing ? 'Edit Registered Customer' : 'Add Registered Customer'}
        actions={
          <Button variant="text" startIcon={<ArrowBackIcon />} onClick={() => navigate('/customers')}>
            Back to list
          </Button>
        }
      >
        <Box sx={{ p: 2 }}>
          <Grid container spacing={2}>
            {admin && !editing && (
              <Grid size={cell}>
                <TextField
                  select
                  label="Laboratory"
                  value={form.lab_id}
                  onChange={(e) => set('lab_id', e.target.value)}
                  slotProps={hint(
                    'Optional. The laboratory this customer is registered with, whose terms apply there only. Left blank, the customer is created by Super Admin as its own.',
                    true,
                  )}
                >
                  {/* Blank in the field; this is only how to clear a choice. */}
                  <MenuItem value="">
                    <em>None — Super Admin</em>
                  </MenuItem>
                  {(labs.data?.data ?? []).map((l) => (
                    <MenuItem key={l.id} value={String(l.id)}>
                      {l.fullname}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            )}
            <Grid size={cell}>
              <TextField
                label="Company Name"
                placeholder="Eg. Sri Ram Jewellers"
                value={form.company_name}
                onChange={(e) => set('company_name', e.target.value)}
                required
              />
            </Grid>
            <Grid size={cell}>
              <TextField
                label="Owner Name"
                placeholder="Eg. Ramesh Mishra"
                value={form.owner_name}
                onChange={(e) => set('owner_name', e.target.value)}
                required
              />
            </Grid>
            <Grid size={cell}>
              <TextField
                label="Contact No."
                placeholder="Eg. 9875642310"
                value={form.mobile}
                onChange={(e) => set('mobile', e.target.value.replace(/\D/g, ''))}
                slotProps={{
                  htmlInput: { maxLength: 10, inputMode: 'numeric' },
                  ...hint('Ten digits. Their orders are found by this number.'),
                }}
                required
              />
            </Grid>
            <Grid size={cell}>
              <TextField
                label="Email"
                type="email"
                placeholder="Eg. accounts@sriram.com"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
              />
            </Grid>
            <Grid size={cell}>
              <Autocomplete
                freeSolo
                options={stateNames}
                value={form.state}
                onInputChange={(_, v) => set('state', v)}
                renderInput={(params) => <TextField {...params} label="State" placeholder="Eg. West Bengal" />}
              />
            </Grid>
            <Grid size={cell}>
              <Autocomplete
                freeSolo
                options={cityNames}
                value={form.city}
                onInputChange={(_, v) => set('city', v)}
                renderInput={(params) => <TextField {...params} label="City" placeholder="Eg. Howrah" />}
              />
            </Grid>
            <Grid size={cell}>
              <TextField
                label="Area"
                placeholder="Eg. Salkia"
                value={form.area}
                onChange={(e) => set('area', e.target.value)}
                slotProps={hint('The locality, shown before the city on the website: “Salkia, Howrah”.')}
              />
            </Grid>
            <Grid size={cell}>
              <TextField
                label="GST No."
                placeholder="Eg. 22AAAAA0000A1Z5"
                value={form.gst_no}
                onChange={(e) => set('gst_no', e.target.value.toUpperCase())}
                slotProps={{
                  htmlInput: { maxLength: 15 },
                  ...hint('A registered customer is one with a GST number.'),
                }}
                required
              />
            </Grid>

            <Grid size={cell}>
              <YesNoField label="Show Name on Card" value={showName} onChange={setShowName}>
                {/* Shown either way so the row does not jump when the answer
                    changes, and disabled until "Yes" — a name typed under "No"
                    is printed nowhere. Blank prints the company name. */}
                <TextField
                  label="Name to print"
                  placeholder={form.company_name || 'Eg. Sri Ram Jewellers'}
                  value={nameOnCard}
                  onChange={(e) => setNameOnCard(e.target.value)}
                  disabled={!showName}
                  fullWidth
                />
              </YesNoField>
            </Grid>
            <Grid size={cell}>
              <YesNoField label="Show Image on Card" value={showImage} onChange={setShowImage}>
                {/* The upload only appears on "Yes": there is nothing to hold
                    a place for, and an empty drop zone under "No" invites a
                    picture that would never print. Same bucket, types and shape
                    as the order form, so the file carries straight onto an order. */}
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
              </YesNoField>
            </Grid>
            <Grid size={cell}>
              {/* The website's customer card shows this. Square works best:
                  the card draws it in a square frame. */}
              <FileField
                label="Logo"
                bucket="employee"
                value={logo}
                onChange={setLogo}
                accept="image/png,image/jpeg,image/webp"
                ratio="1 / 1"
              />
            </Grid>
          </Grid>
        </Box>
      </Panel>

      <Panel
        title="Discount"
        subtitle="Per category. The first row sets every category at once."
        sx={{ mt: 2 }}
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Category</TableCell>
              <TableCell sx={{ width: 220 }}>Type</TableCell>
              <TableCell sx={{ width: 200 }}>Value</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {/* One rate, into every category — what most customers are given. */}
            <TableRow sx={{ bgcolor: 'action.hover' }}>
              <TableCell sx={{ fontWeight: 600 }}>All categories</TableCell>
              <TableCell>
                <TextField
                  select
                  size="small"
                  value={all.discount_type}
                  onChange={(e) => setEvery({ discount_type: e.target.value as DiscountType })}
                >
                  {(Object.keys(TYPE_LABEL) as DiscountType[]).map((t) => (
                    <MenuItem key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </MenuItem>
                  ))}
                </TextField>
              </TableCell>
              <TableCell>
                <TextField
                  size="small"
                  type="number"
                  placeholder="Applies to every category"
                  value={all.value}
                  onChange={(e) => setEvery({ value: e.target.value })}
                  slotProps={{ htmlInput: { min: 0, max: all.discount_type === 'percent' ? 100 : undefined, step: '0.01' } }}
                />
              </TableCell>
            </TableRow>
            {cats.map((c) => {
              const r = rowFor(c.id);
              return (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>
                    <TextField
                      select
                      size="small"
                      value={r.discount_type}
                      onChange={(e) => setRow(c.id, { discount_type: e.target.value as DiscountType })}
                    >
                      {(Object.keys(TYPE_LABEL) as DiscountType[]).map((t) => (
                        <MenuItem key={t} value={t}>
                          {TYPE_LABEL[t]}
                        </MenuItem>
                      ))}
                    </TextField>
                  </TableCell>
                  <TableCell>
                    <TextField
                      size="small"
                      type="number"
                      placeholder="0"
                      value={r.value}
                      onChange={(e) => setRow(c.id, { value: e.target.value })}
                      slotProps={{ htmlInput: { min: 0, max: r.discount_type === 'percent' ? 100 : undefined, step: '0.01' } }}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Panel>

      <Stack direction="row" spacing={2} sx={{ mt: 2, justifyContent: 'flex-end' }}>
        <Button variant="contained" type="submit" disabled={busy} startIcon={<SaveIcon />}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Register Customer'}
        </Button>
        <Button variant="outlined" onClick={() => navigate('/customers')}>
          Cancel
        </Button>
      </Stack>
    </Box>
  );
}
