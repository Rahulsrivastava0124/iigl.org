import { useEffect, useState, type ReactNode } from 'react';
import dayjs from 'dayjs';
import {
  Box,
  Button,
  Divider,
  FormControlLabel,
  Grid,
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
import { useToast } from './Toast';
import { useFetch } from '../lib/useFetch';
import { messageOf } from '../lib/auth';
import { hint, Panel } from './ui';
import FileField from './FileField';
import type { Attribute, Category, Subcategory } from '../lib/api';

/** An order line, as `GET /orders/:id` returns it. */
export interface OrderItem {
  id: number;
  category_id: number;
  category_name: string | null;
  qty: number;
  smart_card: number;
  classic_card: number;
}

/** What the invoice head of the form reads off the order. */
export interface OrderHead {
  order_no: string;
  customer_name: string;
  mobile: string;
  alt_mobile?: string | null;
  email?: string | null;
  address?: string | null;
  /** dd-mm-yyyy text, as `orders.order_date` stores it. */
  order_date?: string | null;
}

/**
 * `order_date` is dd-mm-yyyy text, which `dayjs()` cannot read without being
 * told the format — it came out as "Invalid Date". Anything that still does not
 * parse is shown as stored rather than hidden.
 */
function invoiceDate(raw?: string | null): string {
  if (!raw) return '—';
  const day = dayjs(raw, 'DD-MM-YYYY', true);
  return day.isValid() ? day.format('DD/MM/YYYY') : raw;
}

interface Unit {
  id: number;
  name: string;
  symbol: string;
}

interface Value {
  id: number;
  value_name: string;
  /** Written into the field's description when the value is picked. */
  description: string | null;
  /** The value's own picture, taken as the field's image when it is picked. */
  icon: string | null;
}

/** Everything the form holds, as it starts and as it is edited. */
export interface CertificateDraft {
  subcategory_id: string;
  gross_weight: string;
  gross_wt_unit: string;
  carat_weight: string;
  stone_wt_unit: string;
  size: string;
  comments: string;
  is_approx: boolean;
  item_image: string | null;
  values: Record<number, string>;
  notes: Record<number, string>;
  images: Record<number, string | null>;
  /**
   * What each stored value reads as. A free-text field stores its text as a
   * value id, so an amendment has to show — and send back — the text: sent
   * back as the id, the API would file "1234" as a new value.
   */
  labels?: Record<number, string>;
}

export const EMPTY_DRAFT: CertificateDraft = {
  subcategory_id: '',
  gross_weight: '',
  gross_wt_unit: '',
  carat_weight: '',
  stone_wt_unit: '',
  size: '',
  comments: '',
  is_approx: false,
  item_image: null,
  values: {},
  notes: {},
  images: {},
};

/** The body `POST /reports` and `PATCH /reports/:id` share. */
export interface CertificatePayload {
  subcategory_id: number;
  gross_weight: string | null;
  gross_wt_unit: number | null;
  carat_weight: string | null;
  stone_wt_unit: number | null;
  size: string | null;
  comments: string | null;
  is_approx: number;
  item_image: string | null;
  attributes: { attr_id: string; attr_value: string; attr_desc: string | null; attr_img?: string }[];
}

/**
 * The fields a certificate carries for the cards it is printed on — Laravel's
 * `getreportform`: both kinds take every field, one kind only the fields
 * marked for it.
 */
function forCards(attributes: Attribute[], item: OrderItem | undefined) {
  if (!item || (item.smart_card && item.classic_card)) return attributes;
  if (item.classic_card) return attributes.filter((a) => a.show_in_classic_card);
  if (item.smart_card) return attributes.filter((a) => a.show_in_smart_card);
  return attributes;
}

/**
 * The certificate form, for issuing one and for amending one.
 *
 * Laid out as the Laravel report form was, which is what the graders know:
 * the invoice head, the category beside the name of the item, the grading
 * table, then the weights and the photograph. The table is there from the
 * start and fills once the name of the item is chosen.
 *
 * One component for both screens, so an issued certificate is amended on the
 * form it was written on rather than a second one that drifts from it.
 */
export default function CertificateForm({
  title,
  actions,
  head,
  item,
  itemNote,
  initial,
  fillUnits = false,
  submitLabel,
  busyLabel,
  footnote,
  onCancel,
  onSubmit,
}: {
  title: string;
  actions?: ReactNode;
  /** The order, for the invoice head. Null while it loads or when it cannot be read. */
  head?: OrderHead | null;
  /** The order line, which decides the category and which fields the cards carry. */
  item?: OrderItem;
  /** A line under the date: which item, how many are left. */
  itemNote?: ReactNode;
  initial: CertificateDraft;
  /** Start both weights in the unit the category is priced by, as Laravel preset them. */
  fillUnits?: boolean;
  submitLabel: string;
  busyLabel: string;
  footnote?: ReactNode;
  onCancel: () => void;
  onSubmit: (payload: CertificatePayload) => Promise<void>;
}) {
  const toast = useToast();

  const subcategories = useFetch<{ data: Subcategory[] }>('/catalog/subcategories');
  const categories = useFetch<{ data: Category[] }>('/catalog/categories');
  const units = useFetch<{ data: Unit[] }>('/catalog/units');

  const [draft, setDraft] = useState<CertificateDraft>(initial);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof CertificateDraft>(key: K, value: CertificateDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const attributes = useFetch<{ data: Attribute[] }>(
    draft.subcategory_id ? `/catalog/subcategories/${draft.subcategory_id}/attributes` : null,
  );

  /*
    The category comes from the order line when there is one. Without it — an
    amendment by somebody who cannot open the order — it is the category of
    the stone the certificate already names.
  */
  const categoryId =
    item?.category_id ??
    (subcategories.data?.data ?? []).find((s) => String(s.id) === initial.subcategory_id)?.category_id;
  const category = (categories.data?.data ?? []).find((c) => Number(c.id) === Number(categoryId));

  useEffect(() => {
    if (!fillUnits || !category?.unit) return;
    const unit = String(category.unit);
    setDraft((d) => ({
      ...d,
      gross_wt_unit: d.gross_wt_unit || unit,
      stone_wt_unit: d.stone_wt_unit || unit,
    }));
  }, [fillUnits, category?.unit]);

  /*
    Free-text fields show their text, not the id they were stored under. Done
    once the fields are known — only then is it clear which ones are free text
    — and only for a field still holding the value it came with.
  */
  const fields = attributes.data?.data;
  useEffect(() => {
    if (!fields || !initial.labels) return;
    const labels = initial.labels;
    setDraft((d) => {
      const values = { ...d.values };
      for (const a of fields) {
        if (a.is_opensource && labels[a.id] && values[a.id] === initial.values[a.id]) {
          values[a.id] = labels[a.id];
        }
      }
      return { ...d, values };
    });
  }, [fields]);

  /** The item's own identifications: an emerald cannot be written on a diamond line. */
  const identifications = (subcategories.data?.data ?? []).filter(
    (s) => categoryId == null || Number(s.category_id) === Number(categoryId),
  );

  const rows = forCards(attributes.data?.data ?? [], item);
  const graded = rows.filter((a) => draft.values[a.id]).length;
  const missing = rows.filter((a) => a.is_required && !draft.values[a.id]);

  const submit = async () => {
    // Said once, on the attempt, rather than as a standing list under the form.
    if (missing.length) {
      toast.error(`Choose a value for ${missing.map((a) => a.attr_name).join(', ')}.`);
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        subcategory_id: Number(draft.subcategory_id),
        gross_weight: draft.gross_weight || null,
        gross_wt_unit: draft.gross_wt_unit ? Number(draft.gross_wt_unit) : null,
        carat_weight: draft.carat_weight || null,
        stone_wt_unit: draft.stone_wt_unit ? Number(draft.stone_wt_unit) : null,
        size: draft.size || null,
        comments: draft.comments || null,
        is_approx: draft.is_approx ? 1 : 0,
        item_image: draft.item_image,
        // The whole set, because an amendment replaces it: sending only what
        // changed would delete every field left alone.
        attributes: rows
          .filter((a) => draft.values[a.id])
          .map((a) => ({
            attr_id: String(a.id),
            attr_value: draft.values[a.id],
            attr_desc: draft.notes[a.id] || null,
            ...(draft.images[a.id] ? { attr_img: draft.images[a.id]! } : {}),
          })),
      });
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const contact = [
    [head?.mobile, head?.alt_mobile].filter(Boolean).join(' / '),
    head?.email,
  ]
    .filter(Boolean)
    .join(' / ');

  return (
    <Panel title={title} actions={actions}>
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        {/* ---------------------------------------------------- invoice head */}
        {head && (
          <>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              sx={{ justifyContent: 'space-between' }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  variant="overline"
                  color="text.secondary"
                  sx={{ display: 'block', lineHeight: 1.6 }}
                >
                  Invoice to
                </Typography>
                <Typography sx={{ fontSize: 26, fontWeight: 500, lineHeight: 1.25 }}>
                  {head.customer_name}
                </Typography>
                {head.address && (
                  <Typography variant="body2" color="text.secondary">
                    {head.address}
                  </Typography>
                )}
                {contact && (
                  <Typography variant="body2" sx={{ color: 'primary.main' }}>
                    {contact}
                  </Typography>
                )}
              </Box>
              <Box sx={{ textAlign: { sm: 'right' } }}>
                <Typography
                  className="mono"
                  sx={{
                    fontSize: { xs: 24, md: 32 },
                    fontWeight: 600,
                    color: 'primary.main',
                    lineHeight: 1.2,
                  }}
                >
                  {head.order_no}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  Date of invoice:{' '}
                  {invoiceDate(head.order_date)}
                </Typography>
                {itemNote && (
                  <Typography variant="body2" color="text.secondary">
                    {itemNote}
                  </Typography>
                )}
              </Box>
            </Stack>
            <Divider sx={{ my: 2.5 }} />
          </>
        )}

        {/* ------------------------------------- category, name of the item */}
        <Grid container spacing={2} sx={{ mb: 2, alignItems: 'center' }}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Typography variant="body2" color="text.secondary">
              Category of item
            </Typography>
            <Typography sx={{ fontWeight: 600, textTransform: 'uppercase', mt: 0.5 }}>
              {item?.category_name ?? category?.name ?? '—'}
            </Typography>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              select
              label="Name of item"
              value={draft.subcategory_id}
              onChange={(e) =>
                // A different stone is graded on different fields, so the
                // values held against the old set no longer describe anything.
                setDraft((d) => ({
                  ...d,
                  subcategory_id: e.target.value,
                  values: {},
                  notes: {},
                  images: {},
                }))
              }
              slotProps={hint(
                'What the stone is. This decides which fields the certificate carries.',
                true,
              )}
              required
            >
              {identifications.map((s) => (
                <MenuItem key={s.id} value={String(s.id)}>
                  {s.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
        </Grid>

        {/* ------------------------------------------------- grading table */}
        <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 48 }}>#</TableCell>
                <TableCell>Attribute name</TableCell>
                <TableCell>Attribute value</TableCell>
                <TableCell>Description</TableCell>
                <TableCell sx={{ width: 150 }}>Image</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!draft.subcategory_id ||
              attributes.loading ||
              attributes.error ||
              rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    sx={{
                      textAlign: 'center',
                      py: 2.5,
                      color: attributes.error ? 'error.main' : 'text.secondary',
                    }}
                  >
                    {!draft.subcategory_id
                      ? 'Choose the name of the item first.'
                      : attributes.loading
                        ? 'Loading the grading fields…'
                        : (attributes.error ?? 'This item has no grading fields for these cards.')}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((a, i) => (
                  <AttributeRow
                    key={a.id}
                    index={i + 1}
                    attribute={a}
                    value={draft.values[a.id] ?? ''}
                    note={draft.notes[a.id] ?? ''}
                    image={draft.images[a.id] ?? null}
                    onValue={(v, picked) =>
                      setDraft((d) => ({
                        ...d,
                        values: { ...d.values, [a.id]: v },
                        // The value brings its own wording and picture, as
                        // Laravel's `showfield` did; both stay editable.
                        notes:
                          picked && a.show_description
                            ? { ...d.notes, [a.id]: picked.description ?? '' }
                            : d.notes,
                        images:
                          picked && a.show_image
                            ? { ...d.images, [a.id]: picked.icon ?? null }
                            : d.images,
                      }))
                    }
                    onNote={(v) => setDraft((d) => ({ ...d, notes: { ...d.notes, [a.id]: v } }))}
                    onImage={(v) =>
                      setDraft((d) => ({ ...d, images: { ...d.images, [a.id]: v } }))
                    }
                  />
                ))
              )}
            </TableBody>
          </Table>
        </Box>
        {draft.subcategory_id && rows.length > 0 && (
          <Typography
            variant="body2"
            color="text.secondary"
            className="tabular"
            sx={{ mt: 1, textAlign: 'right' }}
          >
            {graded} of {rows.length} graded
          </Typography>
        )}

        {/* ---------------------------------------- weights and photograph */}
        <Grid container spacing={2} sx={{ mt: 2 }}>
          <Grid size={{ xs: 12, md: 8 }}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                gap: 2,
                alignItems: 'start',
                '& > *': { width: '100%' },
              }}
            >
              <Stack direction="row" spacing={2} sx={{ gridColumn: '1 / -1', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Approx
                </Typography>
                <RadioGroup
                  row
                  value={draft.is_approx ? 'yes' : 'no'}
                  onChange={(e) => set('is_approx', e.target.value === 'yes')}
                >
                  <FormControlLabel value="yes" control={<Radio size="small" />} label="Yes" />
                  <FormControlLabel value="no" control={<Radio size="small" />} label="No" />
                </RadioGroup>
              </Stack>
              <Weight
                label="Gross weight"
                value={draft.gross_weight}
                unit={draft.gross_wt_unit}
                units={units.data?.data ?? []}
                onValue={(v) => set('gross_weight', v)}
                onUnit={(v) => set('gross_wt_unit', v)}
              />
              <Weight
                label="Carat weight"
                value={draft.carat_weight}
                unit={draft.stone_wt_unit}
                units={units.data?.data ?? []}
                onValue={(v) => set('carat_weight', v)}
                onUnit={(v) => set('stone_wt_unit', v)}
                hintText="Priced from this: the weight decides the band."
              />
              <TextField
                label="Measurement"
                value={draft.size}
                onChange={(e) => set('size', e.target.value)}
              />
              <TextField
                label="Comment"
                value={draft.comments}
                onChange={(e) => set('comments', e.target.value)}
                placeholder="Enter your comment here"
                slotProps={hint('Printed on the card.')}
              />
            </Box>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <FileField
              label="Product image"
              bucket="report"
              value={draft.item_image}
              onChange={(v) => set('item_image', v)}
              ratio="1 / 1"
              helperText="Printed on the card beside the QR code."
            />
          </Grid>
        </Grid>

        <Stack
          direction="row"
          spacing={1}
          sx={{
            mt: 3,
            pt: 2,
            borderTop: 1,
            borderColor: 'divider',
            alignItems: 'center',
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
            rowGap: 1,
          }}
        >
          <Typography variant="body2" color="text.secondary" sx={{ flex: 1, minWidth: 240 }}>
            {footnote}
          </Typography>
          <Button color="inherit" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="contained" disabled={busy || !draft.subcategory_id} onClick={submit}>
            {busy ? busyLabel : submitLabel}
          </Button>
        </Stack>
      </Box>
    </Panel>
  );
}

/** A weight and its unit, one field wide: they are read and written together. */
function Weight({
  label,
  value,
  unit,
  units,
  onValue,
  onUnit,
  hintText,
}: {
  label: string;
  value: string;
  unit: string;
  units: Unit[];
  onValue: (v: string) => void;
  onUnit: (v: string) => void;
  hintText?: string;
}) {
  return (
    <Stack direction="row" spacing={1}>
      <TextField
        label={label}
        type="number"
        value={value}
        onChange={(e) => onValue(e.target.value)}
        slotProps={{ htmlInput: { min: 0, step: 0.001 }, ...(hintText ? hint(hintText) : {}) }}
      />
      <TextField
        select
        label="Unit"
        value={unit}
        onChange={(e) => onUnit(e.target.value)}
        sx={{ width: 104, flexShrink: 0 }}
      >
        {units.map((u) => (
          <MenuItem key={u.id} value={String(u.id)}>
            {u.symbol || u.name}
          </MenuItem>
        ))}
      </TextField>
    </Stack>
  );
}

/**
 * One grading field. An attribute marked `is_opensource` takes free text — a
 * value outside the list is added to it — so that renders as a text box rather
 * than a menu.
 *
 * The description box and the image appear only on the fields marked for them
 * (`show_description`, `show_image`), as on the Laravel form; elsewhere the
 * cell is blank. A picked value is handed back with `onValue` so the form can
 * fill in its wording and picture.
 */
function AttributeRow({
  attribute,
  index,
  value,
  note,
  image,
  onValue,
  onNote,
  onImage,
}: {
  attribute: Attribute;
  index: number;
  value: string;
  note: string;
  image: string | null;
  onValue: (v: string, picked?: Value) => void;
  onNote: (v: string) => void;
  onImage: (v: string | null) => void;
}) {
  const values = useFetch<{ data: Value[] }>(
    attribute.is_opensource ? null : `/catalog/attributes/${attribute.id}/values`,
  );

  return (
    <TableRow hover>
      <TableCell className="tabular" sx={{ color: 'text.secondary' }}>
        {index}
      </TableCell>
      <TableCell sx={{ whiteSpace: 'normal', minWidth: 160, fontWeight: 500 }}>
        {attribute.attr_name}
        {attribute.is_required ? (
          <Box component="span" sx={{ color: 'error.main' }}>
            {' *'}
          </Box>
        ) : null}
      </TableCell>
      <TableCell sx={{ minWidth: 220 }}>
        {attribute.is_opensource ? (
          <TextField
            value={value}
            onChange={(e) => onValue(e.target.value)}
            placeholder="Type the value"
          />
        ) : (
          <TextField
            select
            value={value}
            onChange={(e) => {
              const v = e.target.value;
              onValue(v, (values.data?.data ?? []).find((x) => String(x.id) === String(v)));
            }}
            slotProps={{ select: { displayEmpty: true } }}
          >
            <MenuItem value="">
              <Typography component="span" color="text.disabled">
                Choose…
              </Typography>
            </MenuItem>
            {(values.data?.data ?? []).map((v) => (
              <MenuItem key={v.id} value={String(v.id)}>
                {v.value_name}
              </MenuItem>
            ))}
            {/* An attribute nobody has given values yet: say so, rather than
                open a list with nothing in it. */}
            {!values.loading && (values.data?.data.length ?? 0) === 0 && (
              <MenuItem disabled sx={{ whiteSpace: 'normal', maxWidth: 320 }}>
                {values.error ?? 'No values yet. Add them under Attribute values.'}
              </MenuItem>
            )}
          </TextField>
        )}
      </TableCell>
      <TableCell sx={{ minWidth: 240 }}>
        {attribute.show_description ? (
          <TextField
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder="Optional"
            multiline
            minRows={2}
            maxRows={4}
          />
        ) : null}
      </TableCell>
      <TableCell>
        {attribute.show_image ? (
          <Box sx={{ width: 110 }}>
            <FileField
              label="Picture"
              bucket="report"
              value={image}
              onChange={onImage}
              ratio="1 / 1"
              fill
            />
          </Box>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
