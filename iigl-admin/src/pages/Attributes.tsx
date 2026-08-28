import { useState } from 'react';
import {
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  FormGroup,
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
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { Dialog, Notice, PageHead, Panel, TableFrame, YesNo } from '../components/ui';
import type { Attribute, Subcategory } from '../lib/api';

interface AttributeValue {
  id: number;
  value_name: string;
  attr_id: number;
}

const BLANK = {
  open: false,
  id: undefined as number | undefined,
  attr_name: '',
  order_no: '0',
  show_in_smart_card: true,
  show_in_classic_card: true,
  is_opensource: false,
  is_required: false,
};

export default function Attributes() {
  const subcategories = useFetch<{ data: Subcategory[] }>('/catalog/subcategories');
  const subs = subcategories.data?.data ?? [];
  const [subId, setSubId] = useState<string>('');

  const chosen = subId || (subs[0] ? String(subs[0].id) : '');
  const attributes = useFetch<{ data: Attribute[] }>(
    chosen ? `/catalog/subcategories/${chosen}/attributes` : null,
  );
  const rows = attributes.data?.data ?? [];

  const [valuesFor, setValuesFor] = useState<Attribute | null>(null);
  const values = useFetch<{ data: AttributeValue[] }>(
    valuesFor ? `/catalog/attributes/${valuesFor.id}/values` : null,
  );

  const [form, setForm] = useState(BLANK);
  const [newValue, setNewValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const sub = subs.find((s) => String(s.id) === chosen);

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const body = {
        attr_name: form.attr_name,
        order_no: Number(form.order_no) || 0,
        show_in_smart_card: form.show_in_smart_card,
        show_in_classic_card: form.show_in_classic_card,
        is_opensource: form.is_opensource,
        is_required: form.is_required,
      };
      if (form.id) {
        await api.patch(`/admin/attributes/${form.id}`, body);
        setMsg('Attribute updated.');
      } else {
        await api.post('/admin/attributes', {
          ...body,
          subcategory_id: Number(chosen),
          category_id: sub?.category_id ?? 0,
        });
        setMsg(`${form.attr_name} added.`);
      }
      setForm(BLANK);
      attributes.reload();
    } catch (e) {
      setErr(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const retire = async (a: Attribute) => {
    setErr(null);
    try {
      await api.del(`/admin/attributes/${a.id}`);
      setMsg(`${a.attr_name} retired. Certificates already issued keep their values.`);
      attributes.reload();
    } catch (e) {
      setErr(messageOf(e));
    }
  };

  const addValue = async () => {
    if (!valuesFor || !newValue.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await api.post('/admin/attribute-values', {
        attr_id: valuesFor.id,
        value_name: newValue.trim(),
      });
      setNewValue('');
      values.reload();
    } catch (e) {
      setErr(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const check = (key: keyof typeof BLANK, label: string) => (
    <FormControlLabel
      control={
        <Checkbox
          size="small"
          checked={Boolean(form[key])}
          onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
        />
      }
      label={label}
      slotProps={{ typography: { sx: { fontSize: 13.5 } } }}
    />
  );

  return (
    <>
      <PageHead
        title="Attributes"
        subtitle="The fields that make up a certificate, and the order they print in."
        action={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            disabled={!chosen}
            onClick={() => setForm({ ...BLANK, open: true })}
          >
            Add attribute
          </Button>
        }
      />

      {msg && <Notice kind="ok">{msg}</Notice>}
      {err && <Notice kind="error">{err}</Notice>}

      <Panel
        actions={
          <TextField
            select
            label="Subcategory"
            value={chosen}
            onChange={(e) => setSubId(e.target.value)}
            sx={{ minWidth: 220 }}
          >
            {subs.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.name}
              </MenuItem>
            ))}
          </TextField>
        }
      >
        <TableFrame loading={attributes.loading} error={attributes.error} empty={rows.length === 0}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell align="right">Order</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Smart card</TableCell>
                <TableCell>Classic card</TableCell>
                <TableCell>Free text</TableCell>
                <TableCell>Required</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id} hover>
                  <TableCell align="right" className="tabular">
                    {a.order_no}
                  </TableCell>
                  <TableCell>{a.attr_name}</TableCell>
                  <TableCell>
                    <YesNo on={a.show_in_smart_card} />
                  </TableCell>
                  <TableCell>
                    <YesNo on={a.show_in_classic_card} />
                  </TableCell>
                  <TableCell>
                    <YesNo on={a.is_opensource} />
                  </TableCell>
                  <TableCell>
                    <YesNo on={a.is_required} />
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5}>
                      <Button
                        size="small"
                        onClick={() =>
                          setForm({
                            open: true,
                            id: a.id,
                            attr_name: a.attr_name,
                            order_no: String(a.order_no),
                            show_in_smart_card: Boolean(a.show_in_smart_card),
                            show_in_classic_card: Boolean(a.show_in_classic_card),
                            is_opensource: Boolean(a.is_opensource),
                            is_required: Boolean(a.is_required),
                          })
                        }
                      >
                        Edit
                      </Button>
                      <Button size="small" onClick={() => setValuesFor(a)}>
                        Values
                      </Button>
                      <Button size="small" color="error" onClick={() => retire(a)}>
                        Retire
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      </Panel>

      {form.open && (
        <Dialog
          title={form.id ? 'Edit attribute' : 'Add attribute'}
          onClose={() => setForm(BLANK)}
          onSubmit={save}
          busy={busy}
        >
          <Stack spacing={2}>
            <TextField
              label="Name"
              value={form.attr_name}
              onChange={(e) => setForm({ ...form, attr_name: e.target.value })}
              required
            />
            <TextField
              label="Print order"
              type="number"
              value={form.order_no}
              onChange={(e) => setForm({ ...form, order_no: e.target.value })}
              slotProps={{ htmlInput: { min: 0 } }}
            />
            <FormGroup row sx={{ gap: 2 }}>
              {check('show_in_smart_card', 'Show on smart card')}
              {check('show_in_classic_card', 'Show on classic card')}
              {check('is_opensource', 'Accept free text')}
              {check('is_required', 'Required')}
            </FormGroup>
            <Typography variant="caption" color="text.secondary">
              Free text lets a gemologist enter a value outside the list; the new value is added to
              the list automatically.
            </Typography>
          </Stack>
        </Dialog>
      )}

      {valuesFor && (
        <Dialog
          title={`Values — ${valuesFor.attr_name}`}
          onClose={() => setValuesFor(null)}
          onSubmit={addValue}
          submitLabel="Add value"
          busy={busy}
        >
          <TextField
            label="New value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            sx={{ mb: 2 }}
          />
          {values.loading ? (
            <Stack sx={{ alignItems: 'center', py: 3 }}>
              <CircularProgress size={22} />
            </Stack>
          ) : (
            <Table size="small">
              <TableBody>
                {(values.data?.data ?? []).map((v) => (
                  <TableRow key={v.id}>
                    <TableCell className="mono" sx={{ width: 70 }}>
                      #{v.id}
                    </TableCell>
                    <TableCell>{v.value_name}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Dialog>
      )}
    </>
  );
}
