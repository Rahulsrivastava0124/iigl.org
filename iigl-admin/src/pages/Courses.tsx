import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  IconButton,
  InputAdornment,
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
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/AddOutlined';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlineOutlined';
import StartIcon from '@mui/icons-material/PlayCircleOutlined';
import DoneIcon from '@mui/icons-material/CheckCircleOutlined';
import PaymentIcon from '@mui/icons-material/PaymentsOutlined';
import BackIcon from '@mui/icons-material/UndoOutlined';
import CloseIcon from '@mui/icons-material/CloseOutlined';
import PrintIcon from '@mui/icons-material/PrintOutlined';
import CertificateIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import { useDebounced, useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { apiUrl, fileUrl } from '../lib/config';
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
  ToneAction,
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
  /** The certificate issued against this enrolment, if one has been. */
  certificate_id: number | null;
  certificate_no: string | null;
  /** `public/uploads/…` — the signed certificate, when one has been attached. */
  certificate_file: string | null;
  certificate_issued_on: string | null;
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
  const [cut, setCut] = useState({ type: 'percent', value: '', reason: '' });
  const [code, setCode] = useState('');
  const [checked, setChecked] = useState<{ discount: number; final_fee: number } | null>(null);
  const [cutBusy, setCutBusy] = useState(false);

  /**
   * Open the fee dialog on one enrolment.
   *
   * One dialog, not two. Taking money and taking money off are the same
   * conversation at the counter — "that will be 30,000", "there is a coupon" —
   * and splitting them across two row actions meant applying a discount, then
   * finding the payment button, then reading the new figure off the row.
   */
  const openFee = (e: Enrolment) => {
    setCut({
      type: e.discount_type ?? 'percent',
      value: Number(e.discount_amount) > 0 ? String(Number(e.discount_value)) : '',
      reason: '',
    });
    // Seeded with the coupon already on the enrolment, so the field shows what
    // was spent and can cancel it.
    setCode(couponOn(e) ?? '');
    setChecked(null);
    // The amount is left empty on purpose. Filling it with the whole balance
    // makes a part payment an act of deleting a number somebody else typed,
    // and one Enter too many takes the full amount.
    setAmount('');
    setPaying(e);
  };

  /**
   * The coupon code an enrolment already carries, if a coupon set its discount.
   *
   * `discount_reason` is where a coupon writes itself — `Coupon NEWYEAR25` —
   * because the reduction has to live on the enrolment whichever door it came
   * through. Reading it back is what lets the field show the code and cancel
   * it.
   */
  const couponOn = (e: Enrolment): string | null => {
    const match = /^Coupon (.+)$/.exec(e.discount_reason ?? '');
    return match ? match[1] : null;
  };

  /**
   * The fee statement for one enrolment, as a PDF.
   *
   * Rendered by the API rather than here, on the same headless browser the
   * certificates and the order paperwork go through: one letterhead, one place
   * it is maintained, and a file that can be saved or attached rather than a
   * print dialog that has to be caught.
   *
   * A statement of the fee as it stands, not a numbered receipt: nothing in
   * the schema issues fee receipt numbers, so the enrolment id is the
   * reference.
   */
  const printReceipt = (e: Enrolment) => {
    window.open(apiUrl(`/courses/enrolments/${e.id}/statement`), '_blank', 'noopener');
  };

  /**
   * The signed certificate, as attached on the Certificates screen. Served
   * from the uploads mount, so it opens in a tab like the statement does.
   */
  const openCertificate = (e: Enrolment) => {
    const url = fileUrl(e.certificate_file);
    if (url) window.open(url, '_blank', 'noopener');
  };

  const closeFee = () => {
    setPaying(null);
    setCut({ type: 'percent', value: '', reason: '' });
    setCode('');
    setChecked(null);
  };


  /**
   * Enter applies the discount, from either of its fields.
   *
   * There is no Apply button. The catch is that this sits inside the payment
   * form, so an un-caught Enter submits the payment instead — which is a
   * different act on the same money. Hence `preventDefault` before anything
   * else, and no apply-on-blur: leaving a field to reach for Cancel should not
   * charge anybody a discount.
   */
  const applyOnEnter = (event: React.KeyboardEvent) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (!cutBusy && cut.value) applyDiscount();
  };

  const applyDiscount = async () => {
    if (!paying) return;
    setCutBusy(true);
    try {
      const res = await api.patch<{ data: { discount: number; final_fee: number } }>(
        `/courses/enrolments/${paying.id}/discount`,
        { type: cut.type, value: Number(cut.value) || 0, reason: cut.reason },
      );
      toast.ok(
        `${money(res.data.discount)} off — ${paying.student_name} now pays ${money(res.data.final_fee)}.`,
      );
      // The dialog stays open on the new figures: what is left to pay has just
      // changed, and the person is still deciding what to take.
      enrolments.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setCutBusy(false);
    }
  };

  /**
   * Take the coupon back off the enrolment.
   *
   * The same call as clearing a typed discount — a coupon *is* the discount on
   * the enrolment once it is spent, so there is one thing to undo. What it does
   * not do is give the coupon back: `used_count` and the redemption stay,
   * because the record of a code having been spent on this student is what a
   * usage limit counts, and rubbing it out would let one code be spent twice.
   */
  const cancelCoupon = async () => {
    if (!open) return;
    setCutBusy(true);
    try {
      await api.patch(`/courses/enrolments/${open.id}/discount`, { type: null, value: 0 });
      toast.ok(`${code || 'Coupon'} taken off. ${open.student_name} pays the full ${money(open.fee)}.`);
      setCode('');
      setChecked(null);
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
      // The field emptied too, or it still shows the figure that is no longer
      // on the enrolment.
      setCut((f) => ({ ...f, value: '', reason: '' }));
      enrolments.reload();
    } catch (err) {
      toast.error(messageOf(err));
    }
  };

  /** Ask what a coupon would take off, before committing to it. */
  const checkCoupon = async () => {
    if (!paying || !code.trim()) return;
    setCutBusy(true);
    setChecked(null);
    try {
      const res = await api.post<{ data: { discount: number; final_fee: number } }>(
        '/coupons/validate',
        { code: code.trim(), enrolment_id: paying.id },
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
    if (!paying || !code.trim()) return;
    setCutBusy(true);
    try {
      const res = await api.post<{ data: { discount: number; final_fee: number } }>(
        '/coupons/redeem',
        { code: code.trim(), enrolment_id: paying.id },
      );
      toast.ok(
        `${code.trim().toUpperCase()} applied — ${money(res.data.discount)} off, ${paying.student_name} now pays ${money(res.data.final_fee)}.`,
      );
      setChecked(null);
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

  /**
   * Nothing has been paid on a fee that is not zero.
   *
   * What stops a course being started: the money comes first. A fee of zero —
   * a scholarship, a fully discounted place — is not unpaid, so it does not
   * hold the course up.
   */
  const unpaid = (e: Enrolment) => Number(e.final_fee) > 0 && Number(e.fee_paid) <= 0;
  const courses = catalogue.data?.data ?? [];
  const rows = enrolments.data?.data ?? [];

  /**
   * The row the fee dialog is open on, re-read from the list.
   *
   * A discount applied inside the dialog changes the very figures it is
   * showing, so it reads the reloaded row rather than the copy it was opened
   * with — otherwise the totals go stale the moment they matter most.
   */
  const open = paying ? (rows.find((r) => r.id === paying.id) ?? paying) : null;

  /** The coupon already spent on the open enrolment, if there is one. */
  const spent = open ? couponOn(open) : null;

  /**
   * A discount is settled before the money starts moving.
   *
   * Once a payment has been taken, the fee is what the student was told and
   * part-paid: changing it rewrites the sum a statement was printed from, and
   * removing it can put the payable below what has already been handed over.
   * The API refuses it either way — this is the screen saying so first, rather
   * than letting somebody type a figure and then be told no.
   */
  const settled = Boolean(open && Number(open.fee_paid) > 0);

  /** A typed discount already on the enrolment — a coupon's is cancelled on the code. */
  const applied = Boolean(open && Number(open.discount_amount) > 0 && !spent);

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
                <Button
                  variant="contained"
                  startIcon={<AddIcon />}
                  onClick={() => setForm({ ...BLANK_COURSE })}
                >
                  Add course
                </Button>
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
                  <TableCell>Registration no.</TableCell>
                  <TableCell>Course</TableCell>
                  <TableCell>Batch</TableCell>
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
                    </TableCell>
                    <TableCell className="mono">{e.registration_no ?? '—'}</TableCell>
                    <TableCell>{e.course_name}</TableCell>
                    <TableCell>{e.batch ?? '—'}</TableCell>
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
                      {/*
                        A finished enrolment with nothing left to pay has no
                        usual next step — the certificate, the undo and the
                        statement are all occasional — so they go behind the
                        overflow rather than sitting as four equal glyphs.

                        Anything still in flight keeps its controls in the open:
                        there the next step is obvious and worth one click.
                      */}
                      {e.status === 'completed' && due(e) <= 0 ? (
                        <RowActions>
                          {/*
                            The certificate and the statement are what anybody
                            opens on a finished enrolment, so they stay on the
                            row. The undo and the delete are marked to move
                            behind the overflow, which `RowActions` does.
                          */}
                          <IconAction
                            label={
                              e.certificate_file
                                ? `Download certificate ${e.certificate_no ?? ''}`.trim()
                                : e.certificate_id
                                  ? 'Issued, but no file was attached to it'
                                  : 'No certificate has been issued for this enrolment yet'
                            }
                            icon={CertificateIcon}
                            disabled={!e.certificate_file}
                            onClick={() => openCertificate(e)}
                          />
                          <IconAction
                            label="Print fee statement"
                            icon={PrintIcon}
                            onClick={() => printReceipt(e)}
                          />
                          <IconAction
                            label="Undo — back to ongoing"
                            icon={BackIcon}
                            overflow
                            onClick={() => moveEnrolment(e, 'ongoing')}
                          />
                          <IconAction
                            label="Remove enrolment"
                            icon={DeleteIcon}
                            danger
                            onClick={() => setDeletingEnrolment(e)}
                          />
                        </RowActions>
                      ) : (
                      <RowActions>
                        {/*
                          A course starts once it has been paid for. The button
                          is drawn either way rather than hidden, because "why
                          can I not start this" is answered by the tooltip and
                          not by a control that is not there.
                        */}
                        {e.status !== 'completed' && (
                          // Worded, not an icon: starting a course and closing
                          // one are the two decisions on this row, and an
                          // unlabelled play button beside three other glyphs
                          // says nothing about which. The tone is the state it
                          // produces — amber for ongoing, green for completed —
                          // matching the chip the row will then carry.
                          <ToneAction
                            label={e.status === 'ongoing' ? 'Complete' : 'Start course'}
                            icon={e.status === 'upcoming' ? StartIcon : DoneIcon}
                            tone={e.status === 'upcoming' ? 'waiting' : 'settled'}
                            size="small"
                            disabled={e.status === 'upcoming' && unpaid(e)}
                            hint={
                              e.status === 'upcoming' && unpaid(e)
                                ? `Take a payment first — ${money(due(e))} due`
                                : undefined
                            }
                            onClick={() =>
                              moveEnrolment(e, e.status === 'upcoming' ? 'ongoing' : 'completed')
                            }
                          />
                        )}
                        {/*
                          And back again. A course marked completed by mistake,
                          or started before the money arrived, needed a database
                          edit to undo — the status only ever moved forwards.
                        */}
                        {e.status !== 'upcoming' && (
                          <IconAction
                            label={
                              e.status === 'completed'
                                ? 'Undo — back to ongoing'
                                : 'Undo — back to upcoming'
                            }
                            icon={BackIcon}
                            overflow
                            onClick={() =>
                              moveEnrolment(e, e.status === 'completed' ? 'ongoing' : 'upcoming')
                            }
                          />
                        )}
                        {/*
                          Once the fee is settled the money dialog has nothing
                          left to do — the balance is nil and the API refuses a
                          discount after the first payment — so the slot carries
                          the statement instead, which is what is actually
                          wanted at that point.
                        */}
                        {due(e) > 0 ? (
                          <IconAction
                            label="Fee, discount and payment"
                            icon={PaymentIcon}
                            onClick={() => openFee(e)}
                          />
                        ) : (
                          <IconAction
                            label="Print fee statement"
                            icon={PrintIcon}
                            onClick={() => printReceipt(e)}
                          />
                        )}
                        <IconAction
                          label="Remove enrolment"
                          icon={DeleteIcon}
                          danger
                          onClick={() => setDeletingEnrolment(e)}
                        />
                      </RowActions>
                      )}
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

      {open && (
        <Dialog
          title={`Fee — ${open.student_name}`}
          actions={
            <Button variant="outlined" startIcon={<PrintIcon />} onClick={() => printReceipt(open)}>
              Print statement
            </Button>
          }
          onClose={closeFee}
          onSubmit={takePayment}
          submitLabel="Take payment"
          busy={busy}
          disabled={!amount || Number(amount) <= 0 || due(open) <= 0}
        >
          <Stack spacing={1.5}>
            {/* What is owed, before anything is typed. */}
            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
              {[
                ['Course fee', money(open.fee)],
                ...(Number(open.discount_amount) > 0
                  ? ([
                      [open.discount_reason ?? 'Discount', `− ${money(open.discount_amount)}`],
                    ] as [string, string][])
                  : []),
                ['Payable', money(open.final_fee)],
                ['Paid', money(open.fee_paid)],
              ].map(([label, value]) => (
                <Stack
                  key={label}
                  direction="row"
                  sx={{ justifyContent: 'space-between', py: 0.25 }}
                >
                  <Typography variant="body2" color="text.secondary">
                    {label}
                  </Typography>
                  <Typography variant="body2" className="tabular">
                    {value}
                  </Typography>
                </Stack>
              ))}
              <Stack
                direction="row"
                sx={{
                  justifyContent: 'space-between',
                  pt: 0.75,
                  mt: 0.75,
                  borderTop: 1,
                  borderColor: 'divider',
                }}
              >
                <Typography sx={{ fontWeight: 600 }}>Still due</Typography>
                <Typography className="tabular" sx={{ fontWeight: 600 }}>
                  {money(due(open))}
                </Typography>
              </Stack>
            </Box>

            <TextField
              label="Amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              slotProps={{ htmlInput: { min: 0, max: due(open) } }}
              helperText={
                due(open) > 0
                  ? `${money(due(open))} still due.`
                  : 'This enrolment is paid in full.'
              }
              fullWidth
              autoFocus
            />

            {/*
              The discount lives in this dialog rather than behind a row action
              of its own: taking money and taking money off are one conversation
              at the counter, and the figures above answer both.

              It is gone once anything has been paid, rather than greyed out. A
              discount is settled before the money moves — the API refuses it
              after — and a row of dead fields is a block of screen explaining
              something that is no longer a choice. What was already taken off
              still shows in the summary above, which is where it belongs.
            */}
            {!settled && (
            <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 1.5 }}>
              <Typography variant="overline" color="text.secondary">
                Discount
              </Typography>
              {/*
                A grid, not a row of three. In a row the select took the width
                it wanted and the amount field was squeezed to a sliver between
                it and the button — two equal columns cannot do that, whatever
                the dialog width.
              */}
              <Box
                sx={{
                  mt: 0.5,
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                  gap: 1.5,
                }}
              >
                <TextField
                  select
                  label="Type"
                  value={cut.type}
                  onChange={(e) => setCut((f) => ({ ...f, type: e.target.value }))}
                  disabled={Boolean(spent)}
                  fullWidth
                >
                  <MenuItem value="percent">Percent</MenuItem>
                  <MenuItem value="fixed">Amount</MenuItem>
                </TextField>
                <TextField
                  label={cut.type === 'percent' ? 'Off %' : 'Off ₹'}
                  type="number"
                  value={cut.value}
                  onChange={(e) => setCut((f) => ({ ...f, value: e.target.value }))}
                  onKeyDown={applyOnEnter}
                  disabled={Boolean(spent)}
                  slotProps={{
                    htmlInput: { min: 0, max: cut.type === 'percent' ? 100 : Number(open.fee) },
                    input: {
                      // Removing a discount happens on the figure itself, the
                      // same way a coupon is cancelled on its code. A button
                      // under the block was a second place to look for one act.
                      endAdornment: (cut.value || applied) && (
                        <InputAdornment position="end">
                          <Tooltip title={applied ? 'Remove this discount' : 'Clear'}>
                            <span>
                              <IconButton
                                size="small"
                                edge="end"
                                aria-label={applied ? 'Remove discount' : 'Clear discount'}
                                disabled={cutBusy}
                                onClick={() => {
                                  if (applied) clearDiscount(open);
                                  else setCut((f) => ({ ...f, value: '' }));
                                }}
                              >
                                <CloseIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </InputAdornment>
                      ),
                    },
                  }}
                  fullWidth
                />
              </Box>

              <TextField
                label="Reason"
                value={cut.reason}
                onChange={(e) => setCut((f) => ({ ...f, reason: e.target.value }))}
                onKeyDown={applyOnEnter}
                disabled={Boolean(spent)}
                helperText="Why this student, so the concession can be explained later. Press Enter to apply."
                fullWidth
                sx={{ mt: 1.5 }}
              />

              {/*
                Or a coupon, which decides the figure instead of somebody typing
                one. Check first, apply second: the check names the refusal —
                expired, wrong course, already used by this student — where
                applying would only fail.
              */}
              <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'flex-start' }}>
                <TextField
                  label="Coupon code"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setChecked(null);
                  }}
                  disabled={Boolean(spent)}
                  helperText={
                    spent
                      ? `${spent} is on this enrolment. Cancel it to change the discount.`
                      : checked
                        ? `${money(checked.discount)} off — the student would pay ${money(checked.final_fee)}.`
                        : 'A code takes the place of the figure above.'
                  }
                  slotProps={{
                    input: {
                      // Cancel sits inside the box, on the code it undoes.
                      endAdornment: (code || spent) && (
                        <InputAdornment position="end">
                          <Tooltip title={spent ? `Take ${spent} off this fee` : 'Clear'}>
                            <span>
                              <IconButton
                                size="small"
                                edge="end"
                                aria-label={spent ? 'Cancel coupon' : 'Clear code'}
                                disabled={cutBusy}
                                onClick={() => {
                                  if (spent) cancelCoupon();
                                  else {
                                    setCode('');
                                    setChecked(null);
                                  }
                                }}
                              >
                                <CloseIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </InputAdornment>
                      ),
                    },
                  }}
                  // `minWidth: 0` as well as `flex: 1`: a flex item will not
                  // shrink below its content width without it, which is how the
                  // field beside a button ends up a sliver.
                  sx={{ flex: 1, minWidth: 0 }}
                />
                <Button
                  onClick={checked ? redeemCoupon : checkCoupon}
                  disabled={cutBusy || !code.trim() || Boolean(spent)}
                  variant={checked ? 'contained' : 'outlined'}
                  sx={{ mt: 1, whiteSpace: 'nowrap' }}
                >
                  {cutBusy ? 'Checking…' : checked ? 'Apply coupon' : 'Check'}
                </Button>
              </Stack>
            </Box>
            )}
          </Stack>
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
