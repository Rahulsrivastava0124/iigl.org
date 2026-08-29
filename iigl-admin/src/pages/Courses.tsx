import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Button,
  MenuItem,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/AddOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlineOutlined';
import StartIcon from '@mui/icons-material/PlayCircleOutlined';
import DoneIcon from '@mui/icons-material/CheckCircleOutlined';
import PaymentIcon from '@mui/icons-material/PaymentsOutlined';
import DiscountIcon from '@mui/icons-material/LocalOfferOutlined';
import ClearIcon from '@mui/icons-material/BackspaceOutlined';
import { useDebounced, useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { useToast } from '../components/Toast';
import {
  ConfirmDialog,
  Dialog,
  FormPanel,
  IconAction,
  Pager,
  Panel,
  RowActions,
  SearchField,
  StateChip,
  TableFrame,
  YesNo,
  money,
} from '../components/ui';
import type { Tone } from '../components/ui';
import type { Paged } from '../lib/api';

type CourseStatus = 'upcoming' | 'ongoing' | 'completed';

const STATE: Record<CourseStatus, { tone: Tone; label: string }> = {
  upcoming: { tone: 'plain', label: 'Upcoming' },
  ongoing: { tone: 'waiting', label: 'Ongoing' },
  completed: { tone: 'settled', label: 'Completed' },
};

interface Course {
  id: number;
  name: string;
  code: string | null;
  duration: string | null;
  fee: string;
  description: string | null;
  is_active: number;
}

interface Enrolment {
  id: number;
  student_id: number;
  course_id: number;
  student_name: string | null;
  registration_no: string | null;
  course_name: string | null;
  batch: string | null;
  start_date: string | null;
  end_date: string | null;
  fee: string;
  discount_type: 'percent' | 'fixed' | null;
  discount_value: string;
  discount_amount: string;
  /** Why, or `Coupon NEWYEAR25` when a code decided it. */
  discount_reason: string | null;
  final_fee: string;
  fee_paid: string;
  status: CourseStatus;
  completed_on: string | null;
}

const BLANK_COURSE = {
  id: undefined as number | undefined,
  name: '',
  code: '',
  duration: '',
  fee: '0',
  description: '',
  is_active: true,
};

/**
 * Stage three: the catalogue of courses, and who is on them.
 *
 * Two tabs rather than two screens, because they are two halves of one subject:
 * a course is what we teach, an enrolment is one student on it in one batch —
 * and the enrolment is where the money lives. The **Discount** screen works on
 * the same enrolments; it is a separate menu entry because that is how the
 * money is reviewed, not because a discount is a stage of its own.
 */
export default function Courses() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'enrolments' ? 'enrolments' : 'catalogue';
  const status = params.get('status') as CourseStatus | null;
  const page = Number(params.get('page') ?? 1);

  const [search, setSearch] = useState('');
  const term = useDebounced(search);

  const query = new URLSearchParams({ page: String(page), per_page: '25' });
  if (term.trim()) query.set('q', term.trim());
  if (tab === 'enrolments' && status) query.set('status', status);

  const catalogue = useFetch<Paged<Course>>(tab === 'catalogue' ? `/courses?${query}` : null);
  const enrolments = useFetch<Paged<Enrolment>>(
    tab === 'enrolments' ? `/courses/enrolments?${query}` : null,
  );

  const [form, setForm] = useState<typeof BLANK_COURSE | null>(null);
  const [paying, setPaying] = useState<Enrolment | null>(null);
  const [deletingCourse, setDeletingCourse] = useState<Course | null>(null);
  const [deletingEnrolment, setDeletingEnrolment] = useState<Enrolment | null>(null);

  /**
   * The discount on one enrolment, and the coupon that can decide it.
   *
   * This lived on a Discount screen of its own, which reviewed the same
   * enrolments from a second list. It belongs here: the fee is on the
   * enrolment, and money off a fee is an act on the row that holds it.
   *
   * Two ways in, one result. A figure typed with a reason goes to
   * `PATCH /courses/enrolments/{id}/discount`; a code goes to
   * `/coupons/redeem`, which writes the same columns and records where the
   * coupon went. Either way `final_fee` is computed by the API and never sent
   * from here — a client that posts its own total can post one the arithmetic
   * does not support.
   */
  const [discounting, setDiscounting] = useState<Enrolment | null>(null);
  const [cut, setCut] = useState({ type: 'percent', value: '', reason: '' });
  const [code, setCode] = useState('');
  const [checked, setChecked] = useState<{ discount: number; final_fee: number } | null>(null);
  const [cutBusy, setCutBusy] = useState(false);

  const closeDiscount = () => {
    setDiscounting(null);
    setCut({ type: 'percent', value: '', reason: '' });
    setCode('');
    setChecked(null);
  };

  const openDiscount = (e: Enrolment) => {
    setCut({
      type: e.discount_type ?? 'percent',
      value: Number(e.discount_amount) > 0 ? String(Number(e.discount_value)) : '',
      reason: '',
    });
    setCode('');
    setChecked(null);
    setDiscounting(e);
  };

  const applyDiscount = async () => {
    if (!discounting) return;
    setCutBusy(true);
    try {
      const res = await api.patch<{ data: { discount: number; final_fee: number } }>(
        `/courses/enrolments/${discounting.id}/discount`,
        { type: cut.type, value: Number(cut.value) || 0, reason: cut.reason },
      );
      toast.ok(
        `${money(res.data.discount)} off — ${discounting.student_name} now pays ${money(res.data.final_fee)}.`,
      );
      closeDiscount();
      enrolments.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setCutBusy(false);
    }
  };

  const clearDiscount = async (e: Enrolment) => {
    try {
      await api.patch(`/courses/enrolments/${e.id}/discount`, { type: null, value: 0 });
      toast.ok(`Discount removed. ${e.student_name} pays the full ${money(e.fee)}.`);
      enrolments.reload();
    } catch (err) {
      toast.error(messageOf(err));
    }
  };

  /** Ask what a coupon would take off, before committing to it. */
  const checkCoupon = async () => {
    if (!discounting || !code.trim()) return;
    setCutBusy(true);
    setChecked(null);
    try {
      const res = await api.post<{ data: { discount: number; final_fee: number } }>(
        '/coupons/validate',
        { code: code.trim(), enrolment_id: discounting.id },
      );
      setChecked(res.data);
    } catch (e) {
      // The refusal names the reason — expired, wrong course, used up — which
      // is the whole point of asking before applying.
      toast.error(messageOf(e));
    } finally {
      setCutBusy(false);
    }
  };

  const redeemCoupon = async () => {
    if (!discounting || !code.trim()) return;
    setCutBusy(true);
    try {
      const res = await api.post<{ data: { discount: number; final_fee: number } }>(
        '/coupons/redeem',
        { code: code.trim(), enrolment_id: discounting.id },
      );
      toast.ok(
        `${code.trim().toUpperCase()} applied — ${money(res.data.discount)} off, ${discounting.student_name} now pays ${money(res.data.final_fee)}.`,
      );
      closeDiscount();
      enrolments.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setCutBusy(false);
    }
  };
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const go = (next: { tab?: string; status?: string | null; page?: number }) => {
    const q: Record<string, string> = {};
    const t = next.tab ?? tab;
    if (t === 'enrolments') q.tab = 'enrolments';
    const s = next.status === undefined ? (status ?? '') : (next.status ?? '');
    if (s && t === 'enrolments') q.status = s;
    if (next.page && next.page > 1) q.page = String(next.page);
    setParams(q);
  };

  const set = (key: keyof typeof BLANK_COURSE, v: string | boolean) =>
    setForm((f) => (f ? { ...f, [key]: v } : f));

  const saveCourse = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const body = {
        name: form.name,
        code: form.code,
        duration: form.duration,
        fee: Number(form.fee) || 0,
        description: form.description,
        is_active: form.is_active,
      };
      if (form.id) {
        await api.patch(`/courses/${form.id}`, body);
        toast.ok(`${form.name} updated.`);
      } else {
        await api.post('/courses', body);
        toast.ok(`${form.name} added.`);
      }
      setForm(null);
      catalogue.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const removeCourse = async () => {
    if (!deletingCourse) return;
    setBusy(true);
    try {
      await api.del(`/courses/${deletingCourse.id}`);
      toast.ok(`${deletingCourse.name} deleted.`);
      setDeletingCourse(null);
      catalogue.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const moveEnrolment = async (e: Enrolment, next: CourseStatus) => {
    try {
      await api.patch(`/courses/enrolments/${e.id}`, { status: next });
      toast.ok(
        next === 'completed'
          ? `${e.student_name} has finished ${e.course_name}.`
          : `${e.course_name} is under way for ${e.student_name}.`,
      );
      enrolments.reload();
    } catch (err) {
      toast.error(messageOf(err));
    }
  };

  const removeEnrolment = async () => {
    if (!deletingEnrolment) return;
    setBusy(true);
    try {
      await api.del(`/courses/enrolments/${deletingEnrolment.id}`);
      toast.ok('Enrolment removed.');
      setDeletingEnrolment(null);
      enrolments.reload();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const takePayment = async () => {
    if (!paying) return;
    setBusy(true);
    try {
      const res = await api.post<{ data: { due: number } }>(
        `/courses/enrolments/${paying.id}/payment`,
        { amount: Number(amount) },
      );
      toast.ok(
        res.data.due > 0
          ? `Received ${money(amount)}. ${money(res.data.due)} still due.`
          : `Received ${money(amount)}. Fees settled in full.`,
      );
      setPaying(null);
      setAmount('');
      enrolments.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const due = (e: Enrolment) => Number(e.final_fee) - Number(e.fee_paid);
  const courses = catalogue.data?.data ?? [];
  const rows = enrolments.data?.data ?? [];

  return (
    <>
      <Tabs
        value={tab}
        onChange={(_, v) => go({ tab: v, page: 1, status: null })}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="catalogue" label="Courses" />
        <Tab value="enrolments" label="Enrolments" />
      </Tabs>

      {tab === 'catalogue' ? (
        <>
          {form && (
            <FormPanel
              title={form.id ? `Edit ${form.name}` : 'Add a course'}
              onClose={() => setForm(null)}
              onSubmit={saveCourse}
              busy={busy}
            >
              <TextField
                label="Course name"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                required
              />
              <TextField label="Code" value={form.code} onChange={(e) => set('code', e.target.value)} />
              <TextField
                label="Duration"
                value={form.duration}
                onChange={(e) => set('duration', e.target.value)}
                helperText='As the prospectus states it — "6 months".'
              />
              <TextField
                label="Course fee"
                type="number"
                value={form.fee}
                onChange={(e) => set('fee', e.target.value)}
                slotProps={{ htmlInput: { min: 0 } }}
                helperText="Copied onto an enrolment; changing it here does not re-bill anybody."
              />
              <TextField
                select
                label="Offered"
                value={form.is_active ? '1' : '0'}
                onChange={(e) => set('is_active', e.target.value === '1')}
              >
                <MenuItem value="1">Yes</MenuItem>
                <MenuItem value="0">Retired</MenuItem>
              </TextField>
              <TextField
                label="Description"
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                multiline
                minRows={2}
                sx={{ gridColumn: '1 / -1' }}
              />
            </FormPanel>
          )}

          <Panel
            title="Courses"
            count={catalogue.data ? `${catalogue.data.meta.total} courses` : 'Loading…'}
            footer={<Pager meta={catalogue.data?.meta} onPage={(n) => go({ page: n })} />}
            actions={
              <>
                <SearchField
                  placeholder="Name or code…"
                  value={search}
                  onChange={(v) => {
                    setSearch(v);
                    go({ page: 1 });
                  }}
                />
                <IconAction
                  label="Add a course"
                  icon={AddIcon}
                  onClick={() => setForm({ ...BLANK_COURSE })}
                />
              </>
            }
          >
            <TableFrame
              loading={catalogue.loading}
              error={catalogue.error}
              empty={courses.length === 0}
            >
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Course</TableCell>
                    <TableCell>Code</TableCell>
                    <TableCell>Duration</TableCell>
                    <TableCell align="right">Fee</TableCell>
                    <TableCell>Offered</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {courses.map((c) => (
                    <TableRow key={c.id} hover>
                      <TableCell sx={{ whiteSpace: 'normal', minWidth: 180 }}>{c.name}</TableCell>
                      <TableCell className="mono">{c.code ?? '—'}</TableCell>
                      <TableCell>{c.duration ?? '—'}</TableCell>
                      <TableCell align="right" className="tabular">
                        {money(c.fee)}
                      </TableCell>
                      <TableCell>
                        <YesNo on={c.is_active} />
                      </TableCell>
                      <TableCell>
                        <RowActions>
                          <IconAction
                            label="Edit course"
                            icon={EditIcon}
                            onClick={() =>
                              setForm({
                                id: c.id,
                                name: c.name,
                                code: c.code ?? '',
                                duration: c.duration ?? '',
                                fee: String(c.fee),
                                description: c.description ?? '',
                                is_active: Boolean(c.is_active),
                              })
                            }
                          />
                          <IconAction
                            label="Delete course"
                            icon={DeleteIcon}
                            danger
                            onClick={() => setDeletingCourse(c)}
                          />
                        </RowActions>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableFrame>
          </Panel>
        </>
      ) : (
        <Panel
          title="Enrolments"
          count={enrolments.data ? `${enrolments.data.meta.total} enrolments` : 'Loading…'}
          footer={<Pager meta={enrolments.data?.meta} onPage={(n) => go({ page: n })} />}
          actions={
            <>
              <TextField
                select
                label="Status"
                value={status ?? ''}
                onChange={(e) => go({ status: e.target.value || null, page: 1 })}
                sx={{ minWidth: 150 }}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="upcoming">Upcoming</MenuItem>
                <MenuItem value="ongoing">Ongoing</MenuItem>
                <MenuItem value="completed">Completed</MenuItem>
              </TextField>
              <SearchField
                placeholder="Student, course, batch…"
                value={search}
                onChange={(v) => {
                  setSearch(v);
                  go({ page: 1 });
                }}
              />
            </>
          }
        >
          <TableFrame
            loading={enrolments.loading}
            error={enrolments.error}
            empty={rows.length === 0}
          >
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Student</TableCell>
                  <TableCell>Course</TableCell>
                  <TableCell>Batch</TableCell>
                  <TableCell>Runs</TableCell>
                  <TableCell align="right">Fee</TableCell>
                  <TableCell align="right">Discount</TableCell>
                  <TableCell align="right">Due</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((e) => (
                  <TableRow key={e.id} hover>
                    <TableCell sx={{ whiteSpace: 'normal', minWidth: 150 }}>
                      {e.student_name}
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {e.registration_no}
                      </Typography>
                    </TableCell>
                    <TableCell>{e.course_name}</TableCell>
                    <TableCell>{e.batch ?? '—'}</TableCell>
                    <TableCell>
                      {e.start_date?.slice(0, 10) ?? '—'} → {e.end_date?.slice(0, 10) ?? '—'}
                    </TableCell>
                    <TableCell align="right" className="tabular">
                      {money(e.final_fee)}
                    </TableCell>
                    <TableCell align="right" className="tabular">
                      {Number(e.discount_amount) > 0 ? (
                        <>
                          − {money(e.discount_amount)}
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: 'block' }}
                          >
                            {e.discount_reason ?? 'of ' + money(e.fee)}
                          </Typography>
                        </>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell align="right" className="tabular">
                      {due(e) > 0 ? money(due(e)) : '—'}
                    </TableCell>
                    <TableCell>
                      <StateChip {...(STATE[e.status] ?? { tone: 'plain', label: e.status })} />
                    </TableCell>
                    <TableCell>
                      <RowActions>
                        {e.status !== 'completed' && (
                          <IconAction
                            label={e.status === 'upcoming' ? 'Start the course' : 'Mark completed'}
                            icon={e.status === 'upcoming' ? StartIcon : DoneIcon}
                            onClick={() =>
                              moveEnrolment(e, e.status === 'upcoming' ? 'ongoing' : 'completed')
                            }
                          />
                        )}
                        <IconAction
                          label={
                            Number(e.discount_amount) > 0 ? 'Change the discount' : 'Discount or coupon'
                          }
                          icon={DiscountIcon}
                          onClick={() => openDiscount(e)}
                        />
                        {Number(e.discount_amount) > 0 && (
                          <IconAction
                            label="Remove discount"
                            icon={ClearIcon}
                            danger
                            onClick={() => clearDiscount(e)}
                          />
                        )}
                        <IconAction
                          label="Take a fee payment"
                          icon={PaymentIcon}
                          disabled={due(e) <= 0}
                          onClick={() => {
                            setPaying(e);
                            setAmount(String(due(e)));
                          }}
                        />
                        <IconAction
                          label="Remove enrolment"
                          icon={DeleteIcon}
                          danger
                          onClick={() => setDeletingEnrolment(e)}
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

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        {tab === 'catalogue'
          ? 'A course cannot be deleted while anybody is enrolled on it — retire it instead, and it stops appearing in the enrolment form.'
          : 'The fee shown is after any discount. A discount — typed, or decided by a coupon — is applied on the enrolment itself, which is where the fee lives.'}
      </Typography>

      {discounting && (
        <Dialog
          title={`Discount — ${discounting.student_name}`}
          onClose={closeDiscount}
          onSubmit={applyDiscount}
          submitLabel="Apply discount"
          busy={cutBusy || !cut.value}
        >
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              {discounting.course_name} · course fee {money(discounting.fee)}
              {Number(discounting.fee_paid) > 0
                ? ` · ${money(discounting.fee_paid)} already paid, and a discount cannot take the fee below that`
                : ''}
            </Typography>

            <TextField
              select
              label="Discount type"
              value={cut.type}
              onChange={(e) => setCut((f) => ({ ...f, type: e.target.value }))}
            >
              <MenuItem value="percent">Percentage</MenuItem>
              <MenuItem value="fixed">Fixed amount</MenuItem>
            </TextField>
            <TextField
              label={cut.type === 'percent' ? 'Discount %' : 'Discount amount'}
              type="number"
              value={cut.value}
              onChange={(e) => setCut((f) => ({ ...f, value: e.target.value }))}
              slotProps={{
                htmlInput: { min: 0, max: cut.type === 'percent' ? 100 : Number(discounting.fee) },
              }}
              autoFocus
            />
            <TextField
              label="Reason"
              value={cut.reason}
              onChange={(e) => setCut((f) => ({ ...f, reason: e.target.value }))}
              helperText="Why this student, so the concession can be explained later."
            />

            {/*
              Or a coupon, which decides the figure instead of somebody typing
              one. Check first, apply second: the check names the refusal —
              expired, wrong course, already used by this student — where
              applying would only fail.
            */}
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: 'flex-start', borderTop: 1, borderColor: 'divider', pt: 2 }}
            >
              <TextField
                label="Coupon code"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setChecked(null);
                }}
                helperText={
                  checked
                    ? `${money(checked.discount)} off — the student would pay ${money(checked.final_fee)}.`
                    : 'A code takes the place of the figure above.'
                }
                sx={{ flex: 1 }}
              />
              <Button
                onClick={checked ? redeemCoupon : checkCoupon}
                disabled={cutBusy || !code.trim()}
                variant={checked ? 'contained' : 'outlined'}
                sx={{ mt: 1, whiteSpace: 'nowrap' }}
              >
                {cutBusy ? 'Checking…' : checked ? 'Apply coupon' : 'Check'}
              </Button>
            </Stack>
          </Stack>
        </Dialog>
      )}

      {paying && (
        <Dialog
          title={`Fee payment — ${paying.student_name}`}
          onClose={() => setPaying(null)}
          onSubmit={takePayment}
          submitLabel="Take payment"
          busy={busy}
        >
          <TextField
            label="Amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            slotProps={{ htmlInput: { min: 0, max: due(paying) } }}
            helperText={`${money(due(paying))} still due of ${money(paying.final_fee)}.`}
            fullWidth
            autoFocus
          />
        </Dialog>
      )}

      <ConfirmDialog
        open={Boolean(deletingCourse)}
        title="Delete Course"
        message={<>Are you sure you want to delete <strong>{deletingCourse?.name}</strong>?</>}
        warning="This action cannot be undone."
        onClose={() => setDeletingCourse(null)}
        onConfirm={removeCourse}
        confirmLabel="Delete"
        confirmIcon={DeleteIcon}
        busy={busy}
      />

      <ConfirmDialog
        open={Boolean(deletingEnrolment)}
        title="Remove Enrolment"
        message={
          <>
            Remove <strong>{deletingEnrolment?.student_name}</strong> from{' '}
            <strong>{deletingEnrolment?.course_name}</strong>?
          </>
        }
        warning="This action cannot be undone."
        onClose={() => setDeletingEnrolment(null)}
        onConfirm={removeEnrolment}
        confirmLabel="Remove"
        confirmIcon={DeleteIcon}
        busy={busy}
      />
    </>
  );
}
