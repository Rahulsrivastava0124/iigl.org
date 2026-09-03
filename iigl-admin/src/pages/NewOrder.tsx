import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/AddOutlined';
import RemoveIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { useToast } from '../components/Toast';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { hint, Panel } from '../components/ui';
import type { Category } from '../lib/api';

interface Item {
  category_id: string;
  qty: string;
  smart_card: boolean;
  classic_card: boolean;
}

const BLANK_ITEM: Item = { category_id: '', qty: '1', smart_card: true, classic_card: false };

/**
 * Taking an order at the counter — "Collect New" in the laboratory menu.
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
  const categories = useFetch<{ data: Category[] }>('/catalog/categories');
  const cats = categories.data?.data ?? [];

  const [customer, setCustomer] = useState({
    customer_name: '',
    mobile: '',
    alt_mobile: '',
    email: '',
    gst: '',
    address: '',
  });
  const [items, setItems] = useState<Item[]>([{ ...BLANK_ITEM }]);
  const [busy, setBusy] = useState(false);

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
      const res = await api.post<{ data: { id: number } }>('/orders', {
        ...customer,
        items: items.map((i) => ({
          category_id: Number(i.category_id),
          qty: Number(i.qty),
          smart_card: i.smart_card,
          classic_card: i.classic_card,
        })),
      });
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

  return (
    <>

      <Panel title="Customer">
        <Stack spacing={2} sx={{ maxWidth: 720 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Mobile number"
              value={customer.mobile}
              onChange={(e) => set('mobile', e.target.value)}
              onBlur={lookup}
              required
              fullWidth
              slotProps={hint('If they have ordered before, the rest fills itself in.')}
            />
            <TextField
              label="Name"
              value={customer.customer_name}
              onChange={(e) => set('customer_name', e.target.value)}
              required
              fullWidth
            />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Alternate number"
              value={customer.alt_mobile}
              onChange={(e) => set('alt_mobile', e.target.value)}
              fullWidth
            />
            <TextField
              label="Email"
              value={customer.email}
              onChange={(e) => set('email', e.target.value)}
              fullWidth
            />
          </Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="GST number"
              value={customer.gst}
              onChange={(e) => set('gst', e.target.value)}
              fullWidth
              slotProps={hint('A GST number is what makes this a registered customer.')}
            />
            <TextField
              label="Address"
              value={customer.address}
              onChange={(e) => set('address', e.target.value)}
              fullWidth
            />
          </Stack>
        </Stack>
      </Panel>

      <Box sx={{ mt: 3 }}>
      <Panel
        title="Items"
        actions={
          <Button
            startIcon={<AddIcon />}
            onClick={() => setItems((rows) => [...rows, { ...BLANK_ITEM }])}
          >
            Add item
          </Button>
        }
      >
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ minWidth: 220 }}>Category</TableCell>
              <TableCell sx={{ width: 110 }}>Quantity</TableCell>
              <TableCell>Cards</TableCell>
              <TableCell sx={{ width: 56 }} />
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
                  >
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
                  />
                </TableCell>
                <TableCell>
                  <Stack direction="row">
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={item.smart_card}
                          onChange={(e) => setItem(i, { smart_card: e.target.checked })}
                        />
                      }
                      label="Smart"
                      slotProps={{ typography: { sx: { fontSize: 13.5 } } }}
                    />
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={item.classic_card}
                          onChange={(e) => setItem(i, { classic_card: e.target.checked })}
                        />
                      }
                      label="Classic"
                      slotProps={{ typography: { sx: { fontSize: 13.5 } } }}
                    />
                  </Stack>
                </TableCell>
                <TableCell>
                  <IconButton
                    size="small"
                    aria-label="Remove item"
                    disabled={items.length === 1}
                    onClick={() => setItems((rows) => rows.filter((_, n) => n !== i))}
                  >
                    <RemoveIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          An item needs at least one card. The price comes from the band the stone's carat weight
          falls into once the certificate is written, so no total is shown here.
        </Typography>
      </Panel>
      </Box>

      <Stack direction="row" spacing={1} sx={{ mt: 3 }}>
        <Button variant="contained" disabled={!ready || busy} onClick={save}>
          {busy ? 'Saving…' : 'Collect order'}
        </Button>
        <Button onClick={() => navigate('/orders')} disabled={busy}>
          Cancel
        </Button>
      </Stack>
    </>
  );
}
