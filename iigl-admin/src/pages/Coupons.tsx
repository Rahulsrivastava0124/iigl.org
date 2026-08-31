import { useState } from 'react';
import {
  Box,
  Button,
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
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import HistoryIcon from '@mui/icons-material/ReceiptLongOutlined';
import OnIcon from '@mui/icons-material/ToggleOnOutlined';
import OffIcon from '@mui/icons-material/ToggleOffOutlined';
import { useDebounced, useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { useToast } from '../components/Toast';
import {
  Dialog,
  FormPanel,
  IconAction,
  Pager,
  Panel,
  RowActions,
  SearchField,
  StateChip,
  TableFrame,
  money,
} from '../components/ui';
import type { Paged } from '../lib/api';

interface Coupon {
  id: number;
  code: string;
  title: string | null;
  description: string | null;
  discount_type: 'percent' | 'fixed';
  discount_value: string;
  max_discount: string | null;
  min_amount: string;
  /** One course, or null for any of them. */
  course_id: number | null;
  course_name: string | null;
  valid_from: string | null;
  valid_to: string | null;
  usage_limit: number | null;
  per_student_limit: number | null;
  used_count: number;
  is_active: number;
  /** The usage limit is reached. */
  spent: boolean;
  /** The last day is behind us. */
  expired: boolean;
}

interface Redemption {
  id: number;
  code: string;
  enrolment_id: number;
  fee: string;
  discount: string;
  final_fee: string;
  note: string | null;
  created_at: string;
  student_name: string | null;
  registration_no: string | null;
  course_name: string | null;
  redeemed_by_name: string | null;
}

interface Course {
  id: number;
  name: string;
}

const BLANK = {
  open: false,
  id: undefined as number | undefined,
  code: '',
  title: '',
  description: '',
  discount_type: 'percent',
  discount_value: '',
  max_discount: '',
  min_amount: '',
  course_id: '',
  valid_from: '',
  valid_to: '',
  usage_limit: '',
  per_student_limit: '',
};

/** What the coupon takes off, said in one line. */
const worth = (c: Coupon) =>
  c.discount_type === 'percent'
    ? `${Number(c.discount_value)}%${c.max_discount ? ` up to ₹${money(c.max_discount)}` : ''}`
    : `₹${money(c.discount_value)}`;

/**
 * The state of a coupon, which is not only its switch.
 *
 * A coupon that has run out or run past its last day is still `is_active = 1`
 * in the table — nothing goes round switching them off — so a screen that read
 * only that flag would show a coupon as usable while every attempt to use it
 * was refused. Order matters: switched off is the answer even for one that also
 * expired, because that is the one somebody can undo.
 */
function couponState(c: Coupon): { tone: 'settled' | 'waiting' | 'refused' | 'plain'; label: string } {
  if (!c.is_active) return { tone: 'plain', label: 'Off' };
  if (c.expired) return { tone: 'refused', label: 'Expired' };
  if (c.spent) return { tone: 'refused', label: 'Used up' };
  return { tone: 'settled', label: 'Live' };
}

/**
 * Discount coupons, for course fees.
 *
 * A coupon is a rule for taking money off a **course enrolment**, written
 * before anybody uses it and spent by presenting its code. That is the only
 * thing it does — there is no coupon on a laboratory's bill or on an order at
 * the counter, because neither of those fees has anywhere to record one.
 *
 * It does not replace the discount on the enrolment (Student › Discount): it
 * writes it. Spending a coupon sets the same columns, with the same `final_fee`
 * arithmetic, and records where it went — so "what does this student owe" still
 * has one answer, and it is still on the enrolment.
 */
export default function Coupons() {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const term = useDebounced(search);
  const [courseId, setCourseId] = useState('');
  const [active, setActive] = useState('');

  const query = new URLSearchParams({ page: String(page), per_page: '25' });
  if (term.trim()) query.set('q', term.trim());
  if (courseId) query.set('course_id', courseId);
  if (active) query.set('active', active);

  const { data, loading, error, reload } = useFetch<Paged<Coupon>>(`/coupons?${query}`);
  const courses = useFetch<{ data: Course[] }>('/courses?per_page=200');
  const rows = data?.data ?? [];

  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Coupon | null>(null);
  const [log, setLog] = useState<Coupon | null>(null);

  const set = <K extends keyof typeof BLANK>(key: K, value: (typeof BLANK)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setBusy(true);
    try {
      // Empty is "no limit" and "no end date", which the API takes as null.
      const body = {
        code: form.code,
        title: form.title || null,
        description: form.description || null,
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value),
        max_discount: form.max_discount === '' ? null : Number(form.max_discount),
        min_amount: form.min_amount === '' ? 0 : Number(form.min_amount),
        course_id: form.course_id === '' ? null : Number(form.course_id),
        valid_from: form.valid_from || null,
        valid_to: form.valid_to || null,
        usage_limit: form.usage_limit === '' ? null : Number(form.usage_limit),
        per_student_limit:
          form.per_student_limit === '' ? null : Number(form.per_student_limit),
      };

      if (form.id) {
        await api.patch(`/coupons/${form.id}`, body);
        toast.ok(`${form.code.toUpperCase()} saved.`);
      } else {
        await api.post('/coupons', body);
        toast.ok(`${form.code.toUpperCase()} written.`);
      }
      setForm(BLANK);
      reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (c: Coupon) => {
    try {
      await api.patch(`/coupons/${c.id}/active`, { is_active: !c.is_active });
      toast.ok(c.is_active ? `${c.code} switched off.` : `${c.code} is live.`);
      reload();
    } catch (e) {
      toast.error(messageOf(e));
    }
  };

  const remove = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await api.del(`/coupons/${confirm.id}`);
      toast.ok(`${confirm.code} deleted.`);
      setConfirm(null);
      reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const edit = (c: Coupon) =>
    setForm({
      open: true,
      id: c.id,
      code: c.code,
      title: c.title ?? '',
      description: c.description ?? '',
      discount_type: c.discount_type,
      discount_value: String(Number(c.discount_value)),
      max_discount: c.max_discount === null ? '' : String(Number(c.max_discount)),
      min_amount: Number(c.min_amount) === 0 ? '' : String(Number(c.min_amount)),
      course_id: c.course_id === null ? '' : String(c.course_id),
      valid_from: c.valid_from ? String(c.valid_from).slice(0, 10) : '',
      valid_to: c.valid_to ? String(c.valid_to).slice(0, 10) : '',
      usage_limit: c.usage_limit === null ? '' : String(c.usage_limit),
      per_student_limit: c.per_student_limit === null ? '' : String(c.per_student_limit),
    });

  return (
    <>
      {form.open && (
        <FormPanel
          title={form.id ? `Edit ${form.code}` : 'Write a coupon'}
          onClose={() => setForm(BLANK)}
          onSubmit={save}
          submitLabel={form.id ? 'Save' : 'Create coupon'}
          busy={busy}
        >
          <TextField
            label="Code"
            required
            value={form.code}
            onChange={(e) => set('code', e.target.value.toUpperCase())}
            placeholder="NEWYEAR25"
            helperText="What somebody types at the counter."
          />
          <TextField
            label="Title"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="New year offer"
          />
          <TextField
            select
            label="Course"
            value={form.course_id}
            onChange={(e) => set('course_id', e.target.value)}
            helperText="Any course unless one is chosen."
          >
            <MenuItem value="">Any course</MenuItem>
            {(courses.data?.data ?? []).map((c) => (
              <MenuItem key={c.id} value={String(c.id)}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Takes off"
            value={form.discount_type}
            onChange={(e) => set('discount_type', e.target.value)}
          >
            <MenuItem value="percent">A percentage</MenuItem>
            <MenuItem value="fixed">A fixed amount</MenuItem>
          </TextField>
          <TextField
            label={form.discount_type === 'percent' ? 'Percent off' : 'Rupees off'}
            required
            type="number"
            value={form.discount_value}
            onChange={(e) => set('discount_value', e.target.value)}
          />
          <TextField
            label="Most it can take off"
            type="number"
            value={form.max_discount}
            onChange={(e) => set('max_discount', e.target.value)}
            disabled={form.discount_type === 'fixed'}
            helperText={
              form.discount_type === 'fixed' ? 'A fixed coupon caps itself.' : 'Blank is no cap.'
            }
          />

          <TextField
            label="Minimum course fee"
            type="number"
            value={form.min_amount}
            onChange={(e) => set('min_amount', e.target.value)}
            helperText="Blank is any fee."
          />
          <TextField
            label="First day"
            type="date"
            value={form.valid_from}
            onChange={(e) => set('valid_from', e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Last day"
            type="date"
            value={form.valid_to}
            onChange={(e) => set('valid_to', e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />

          <TextField
            label="Total uses"
            type="number"
            value={form.usage_limit}
            onChange={(e) => set('usage_limit', e.target.value)}
            helperText="Blank is unlimited."
          />
          <TextField
            label="Uses per student"
            type="number"
            value={form.per_student_limit}
            onChange={(e) => set('per_student_limit', e.target.value)}
            helperText="Blank is unlimited."
          />
          <TextField
            label="Description"
            multiline
            minRows={2}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            sx={{ gridColumn: '1 / -1' }}
          />
        </FormPanel>
      )}

      <Panel
        // No title on this panel. The header is one row by design, and this
        // one already carries a search field, two filters and the Add button —
        // a title beside them truncates to a letter. The breadcrumb above says
        // Discount Coupons, which is the same sentence in the place people
        // look for it.
        count={data?.meta ? `${data.meta.total} coupons` : undefined}
        footer={<Pager meta={data?.meta} onPage={setPage} />}
        actions={
          <>
            <SearchField
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Code or title…"
            />
            <TextField
              select
              size="small"
              label="Course"
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value);
                setPage(1);
              }}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="">Any course</MenuItem>
              {(courses.data?.data ?? []).map((c) => (
                <MenuItem key={c.id} value={String(c.id)}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="State"
              value={active}
              onChange={(e) => {
                setActive(e.target.value);
                setPage(1);
              }}
              sx={{ minWidth: 130 }}
            >
              <MenuItem value="">Any</MenuItem>
              <MenuItem value="1">On</MenuItem>
              <MenuItem value="0">Off</MenuItem>
            </TextField>
            <Button
              startIcon={<AddIcon />}
              variant="contained"
              onClick={() => setForm({ ...BLANK, open: true })}
            >
              Add coupon
            </Button>
          </>
        }
      >
        <TableFrame loading={loading} error={error} empty={rows.length === 0}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Code</TableCell>
                <TableCell>Course</TableCell>
                <TableCell>Takes off</TableCell>
                <TableCell>Minimum fee</TableCell>
                <TableCell>Valid</TableCell>
                <TableCell align="right">Used</TableCell>
                <TableCell>State</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id} hover>
                  <TableCell>
                    <Typography className="mono" sx={{ fontSize: 13.5, fontWeight: 600 }}>
                      {c.code}
                    </Typography>
                    {c.title && (
                      <Typography variant="caption" color="text.secondary">
                        {c.title}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{c.course_name ?? 'Any course'}</TableCell>
                  <TableCell>{worth(c)}</TableCell>
                  <TableCell className="tabular">
                    {Number(c.min_amount) > 0 ? `₹${money(c.min_amount)}` : '—'}
                  </TableCell>
                  <TableCell>
                    {c.valid_from || c.valid_to
                      ? `${c.valid_from ? String(c.valid_from).slice(0, 10) : '—'} → ${
                          c.valid_to ? String(c.valid_to).slice(0, 10) : '—'
                        }`
                      : 'Always'}
                  </TableCell>
                  <TableCell align="right" className="tabular">
                    {c.used_count}
                    {c.usage_limit !== null ? ` / ${c.usage_limit}` : ''}
                  </TableCell>
                  <TableCell>
                    <StateChip {...couponState(c)} />
                  </TableCell>
                  <TableCell>
                    <RowActions>
                      <IconAction
                        label={c.is_active ? 'Switch off' : 'Switch on'}
                        icon={c.is_active ? OnIcon : OffIcon}
                        onClick={() => toggle(c)}
                      />
                      <IconAction label="Edit coupon" icon={EditIcon} onClick={() => edit(c)} />
                      <IconAction
                        label="Where it went"
                        icon={HistoryIcon}
                        onClick={() => setLog(c)}
                        disabled={c.used_count === 0}
                      />
                      <IconAction
                        label="Delete coupon"
                        icon={DeleteIcon}
                        danger
                        // A coupon that has been spent cannot be deleted — the
                        // API refuses it, and the row says so before somebody
                        // finds out by clicking.
                        disabled={c.used_count > 0}
                        onClick={() => setConfirm(c)}
                      />
                    </RowActions>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      </Panel>

      {confirm && (
        <Dialog
          title={`Delete ${confirm.code}?`}
          onClose={() => setConfirm(null)}
          onSubmit={remove}
          submitLabel="Delete"
          busy={busy}
        >
          <Typography>
            It has never been used, so nothing is lost but the coupon itself. A coupon that has been
            spent is switched off instead.
          </Typography>
        </Dialog>
      )}

      {log && <RedemptionLog coupon={log} onClose={() => setLog(null)} />}
    </>
  );
}

/** Where one coupon went: the bill it came off, and who spent it. */
function RedemptionLog({ coupon, onClose }: { coupon: Coupon; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const { data, loading, error } = useFetch<Paged<Redemption>>(
    `/coupons/${coupon.id}/redemptions?page=${page}&per_page=10`,
  );
  const rows = data?.data ?? [];

  return (
    <Dialog title={`${coupon.code} — where it went`} onClose={onClose} onSubmit={onClose} submitLabel="Done" maxWidth="md">
      <TableFrame loading={loading} error={error} empty={rows.length === 0}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>When</TableCell>
              <TableCell>Student</TableCell>
              <TableCell>Course</TableCell>
              <TableCell align="right">Fee</TableCell>
              <TableCell align="right">Off</TableCell>
              <TableCell align="right">Pays</TableCell>
              <TableCell>By</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell>{String(r.created_at).slice(0, 16)}</TableCell>
                <TableCell>
                  {r.student_name ?? `enrolment #${r.enrolment_id}`}
                  {r.registration_no ? ` · ${r.registration_no}` : ''}
                </TableCell>
                <TableCell>{r.course_name ?? '—'}</TableCell>
                <TableCell align="right" className="tabular">
                  {money(r.fee)}
                </TableCell>
                <TableCell align="right" className="tabular">
                  {money(r.discount)}
                </TableCell>
                <TableCell align="right" className="tabular">
                  {money(r.final_fee)}
                </TableCell>
                <TableCell>{r.redeemed_by_name ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
      <Box sx={{ mt: 1 }}>
        <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
          <Pager meta={data?.meta} onPage={setPage} />
        </Stack>
      </Box>
    </Dialog>
  );
}
