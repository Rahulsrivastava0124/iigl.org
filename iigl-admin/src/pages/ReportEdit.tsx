import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
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
import { useToast } from '../components/Toast';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { hint, Notice, Panel, TableFrame } from '../components/ui';
import FileField from '../components/FileField';
import { AttributeRow } from './NewReport';
import type { Attribute, Subcategory } from '../lib/api';
import ArrowBackIcon from '@mui/icons-material/ArrowBackOutlined';
import SaveIcon from '@mui/icons-material/SaveOutlined';

interface Unit {
  id: number;
  name: string;
  symbol: string;
}

/** One grading field as the certificate stored it. */
interface SavedAttribute {
  attr_id: string | number;
  attr_value: string | null;
  attr_desc: string | null;
}

interface Report {
  id: number;
  report_no: string;
  order_no: string | null;
  subcategory_id: string | number | null;
  gross_weight: string | null;
  gross_wt_unit: number | null;
  carat_weight: string | null;
  stone_wt_unit: number | null;
  size: string | null;
  comments: string | null;
  item_image: string | null;
  attributes: SavedAttribute[];
}

/**
 * Amending an issued certificate.
 *
 * The same fields it was issued with, less the two that cannot move: the order
 * item it belongs to, and the number. The number is printed on a document
 * already in a customer's hands, and the API never reallocates it.
 *
 * The screen exists for the weight above all. An order is priced per
 * certificate and the band comes from the carat weight, so a stone recorded at
 * a weight no band covers is billed as zero and reads "unpriced" on the order,
 * with nowhere to go and correct it. This is that somewhere.
 */
export default function ReportEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const source = useFetch<{ data: Report }>(`/reports/${id}`);
  const r = source.data?.data;

  const subcategories = useFetch<{ data: Subcategory[] }>('/catalog/subcategories');
  const units = useFetch<{ data: Unit[] }>('/catalog/units');

  const [subcategoryId, setSubcategoryId] = useState('');
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

  /* Filled once, when the certificate arrives, and keyed on its id rather than
     run on every render: from then on the fields are the form's own state, and
     re-seeding them would throw away whatever had been typed. */
  useEffect(() => {
    if (!r) return;
    setSubcategoryId(r.subcategory_id == null ? '' : String(r.subcategory_id));
    setForm({
      gross_weight: r.gross_weight ?? '',
      gross_wt_unit: r.gross_wt_unit == null ? '' : String(r.gross_wt_unit),
      carat_weight: r.carat_weight ?? '',
      stone_wt_unit: r.stone_wt_unit == null ? '' : String(r.stone_wt_unit),
      size: r.size ?? '',
      comments: r.comments ?? '',
    });
    setImage(r.item_image || null);
    const saved = r.attributes ?? [];
    setValues(Object.fromEntries(saved.map((a) => [Number(a.attr_id), a.attr_value ?? ''])));
    setNotes(Object.fromEntries(saved.map((a) => [Number(a.attr_id), a.attr_desc ?? ''])));
  }, [r?.id]);

  const attributes = useFetch<{ data: Attribute[] }>(
    subcategoryId ? `/catalog/subcategories/${subcategoryId}/attributes` : null,
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch(`/reports/${id}`, {
        subcategory_id: Number(subcategoryId),
        gross_weight: form.gross_weight || null,
        gross_wt_unit: form.gross_wt_unit ? Number(form.gross_wt_unit) : null,
        carat_weight: form.carat_weight || null,
        stone_wt_unit: form.stone_wt_unit ? Number(form.stone_wt_unit) : null,
        size: form.size || null,
        comments: form.comments || null,
        item_image: image,
        // The whole set, because the API replaces it: sending only what changed
        // would delete every field left alone.
        attributes: (attributes.data?.data ?? [])
          .filter((a) => values[a.id])
          .map((a) => ({
            attr_id: String(a.id),
            attr_value: values[a.id],
            attr_desc: notes[a.id] ?? null,
          })),
      });
      toast.ok(`Certificate ${r?.report_no ?? ''} amended.`);
      navigate(-1);
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  if (source.error) return <Notice kind="error">{source.error}</Notice>;
  if (source.loading || !r) {
    return (
      <Panel title="Edit certificate">
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={26} />
        </Box>
      </Panel>
    );
  }

  return (
    <Box component="form" onSubmit={submit}>
      <Panel
        title={`Edit — ${r.report_no}`}
        count={r.order_no ? `On order ${r.order_no}` : undefined}
        actions={
          <Button variant="text" startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)}>
            Back
          </Button>
        }
      >
        <Stack spacing={2.5} sx={{ p: 2 }}>
          <TextField
            select
            label="Identification"
            value={subcategoryId}
            onChange={(e) => {
              setSubcategoryId(e.target.value);
              // A different stone is graded on different fields, so the values
              // held against the old set no longer describe anything.
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
              slotProps={hint('Priced from this: the weight decides the band.', true)}
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
        </>
      )}

      <Stack
        direction="row"
        spacing={1}
        sx={{
          mt: 3,
          pt: 2,
          borderTop: 1,
          borderColor: 'divider',
          justifyContent: 'flex-end',
        }}
      >
        <Button color="inherit" onClick={() => navigate(-1)}>
          Cancel
        </Button>
        <Button
          variant="contained"
          type="submit"
          disabled={busy || !subcategoryId}
          startIcon={<SaveIcon />}
        >
          {busy ? 'Saving…' : 'Save changes'}
        </Button>
      </Stack>

      <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, textAlign: 'right' }}>
        The certificate number and the item it belongs to do not change.
      </Typography>
    </Box>
  );
}
