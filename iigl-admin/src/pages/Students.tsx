import { useState, type ReactNode } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Avatar,
  Box,
  Button,
  Grid,
  Link,
  Stack,
  MenuItem,
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
import ViewIcon from '@mui/icons-material/VisibilityOutlined';
import CertificateIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import EnrolIcon from '@mui/icons-material/SchoolOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { useDebounced, useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { useToast } from '../components/Toast';
import {
  ConfirmDialog,
  DateField,
  Dialog,
  IconAction,
  DEFAULT_PER_PAGE, Pager,
  Panel,
  RowActions,
  SearchField,
  StateChip,
  TableFrame,
  money,
} from '../components/ui';
import type { Tone } from '../components/ui';
import type { Paged } from '../lib/api';
import { fileUrl } from '../lib/config';

type Status = 'pending' | 'registered' | 'active';

/** Stage two: an enquiry that has been converted is a registration. */
const TABS: Array<{ id: Status | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'registered', label: 'Registered' },
  { id: 'active', label: 'Active' },
];

const STATE: Record<Status, { tone: Tone; label: string }> = {
  pending: { tone: 'waiting', label: 'Pending' },
  registered: { tone: 'plain', label: 'Registered' },
  active: { tone: 'settled', label: 'Active' },
};

interface Student {
  id: number;
  registration_no: string;
  name: string;
  father_name: string | null;
  dob: string | null;
  gender: string | null;
  mobile: string;
  alt_mobile: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  photo: string | null;
  id_proof: string | null;
  qualification_doc: string | null;
  registration_date: string | null;
  course_id: number | null;
  status: Status;
  remark: string | null;
}

interface Course {
  id: number;
  name: string;
  fee: string;
}

export default function Students() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as Status | null) ?? 'all';
  const page = Number(params.get('page') ?? 1);
  /** Rows per page. Component state, not a URL parameter: it is how somebody
   * likes to read a list, not which list they are looking at. */
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);

  const [search, setSearch] = useState('');
  const term = useDebounced(search);

  const query = new URLSearchParams({ page: String(page), per_page: String(perPage) });
  if (status !== 'all') query.set('status', status);
  if (term.trim()) query.set('q', term.trim());

  const source = useFetch<Paged<Student>>(`/students?${query}`);
  const courses = useFetch<Paged<Course>>('/courses?active=1&per_page=100');
  const rows = source.data?.data ?? [];
  const courseList = courses.data?.data ?? [];

  const [enrolling, setEnrolling] = useState<Student | null>(null);
  const [enrol, setEnrol] = useState({ course_id: '', batch: '', start_date: '', end_date: '' });
  const [deleting, setDeleting] = useState<Student | null>(null);
  /** The registration open in the read-only view. */
  const [viewing, setViewing] = useState<Student | null>(null);
  const [busy, setBusy] = useState(false);

  const go = (next: { status?: string; page?: number }) => {
    const q: Record<string, string> = {};
    const s = next.status ?? (status === 'all' ? '' : status);
    if (s) q.status = s;
    if (next.page && next.page > 1) q.page = String(next.page);
    setParams(q);
  };

  const saveEnrolment = async () => {
    if (!enrolling) return;
    setBusy(true);
    try {
      await api.post('/courses/enrolments', {
        student_id: enrolling.id,
        course_id: Number(enrol.course_id),
        batch: enrol.batch,
        start_date: enrol.start_date,
        end_date: enrol.end_date,
      });
      toast.ok(`${enrolling.name} enrolled.`);
      setEnrolling(null);
      setEnrol({ course_id: '', batch: '', start_date: '', end_date: '' });
      source.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.del(`/students/${deleting.id}`);
      toast.ok(`${deleting.registration_no} removed.`);
      setDeleting(null);
      source.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const courseName = (id: number | null) => courseList.find((c) => c.id === id)?.name ?? '—';
  const chosen = courseList.find((c) => String(c.id) === enrol.course_id);

  return (
    <>
      <Tabs
        value={status}
        onChange={(_, v) => go({ status: v === 'all' ? '' : v, page: 1 })}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {TABS.map((t) => (
          <Tab key={t.id} value={t.id} label={t.label} />
        ))}
      </Tabs>

      <Panel
        title="Registrations"
        count={source.data ? `${source.data.meta.total.toLocaleString()} students` : 'Loading…'}
        footer={<Pager meta={source.data?.meta} onPage={(n) => go({ page: n })} onPerPage={(n) => {
            setPerPage(n);
            go({ page: 1 });
          }} />}
        actions={
          <>
            <SearchField
              placeholder="Name, mobile, registration no…"
              value={search}
              onChange={(v) => {
                setSearch(v);
                go({ page: 1 });
              }}
            />
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              component={RouterLink}
              to="/students/create"
            >
              Register a student
            </Button>
          </>
        }
      >
        <TableFrame loading={source.loading} error={source.error} empty={rows.length === 0}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>Registration no</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Mobile</TableCell>
                <TableCell>Course</TableCell>
                <TableCell>Registered</TableCell>
                <TableCell>Status</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id} hover>
                  <TableCell className="mono">{s.registration_no}</TableCell>
                  <TableCell sx={{ whiteSpace: 'normal', minWidth: 150 }}>{s.name}</TableCell>
                  <TableCell className="mono">{s.mobile}</TableCell>
                  <TableCell>{courseName(s.course_id)}</TableCell>
                  <TableCell>{s.registration_date?.slice(0, 10) ?? '—'}</TableCell>
                  <TableCell>
                    <StateChip {...(STATE[s.status] ?? { tone: 'plain', label: s.status })} />
                  </TableCell>
                  <TableCell>
                    <RowActions>
                      {s.status !== 'active' && (
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<EnrolIcon fontSize="small" />}
                          onClick={() => {
                            setEnrolling(s);
                            setEnrol({
                              course_id: s.course_id ? String(s.course_id) : '',
                              batch: '',
                              start_date: '',
                              end_date: '',
                            });
                          }}
                          sx={{ fontSize: 12, py: 0.5, px: 1, minWidth: 'auto' }}
                        >
                          Enrol
                        </Button>
                      )}
                      <IconAction
                        label="View registration"
                        icon={ViewIcon}
                        onClick={() => setViewing(s)}
                      />
                      <IconAction
                        label="Edit registration"
                        icon={EditIcon}
                        to={`/students/${s.id}/edit`}
                      />
                      {/* Their certificates, and any finished course still
                          waiting for one — the screen they are issued from. */}
                      <IconAction
                        label="Certificates"
                        icon={CertificateIcon}
                        to={`/student-certificates?student_id=${s.id}`}
                      />
                      <IconAction
                        label="Delete registration"
                        icon={DeleteIcon}
                        danger
                        onClick={() => setDeleting(s)}
                      />
                    </RowActions>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      </Panel>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        The registration number is issued on save and cannot be edited afterwards — it is printed on
        the paperwork the student is holding. Enrolling somebody makes their registration active.
      </Typography>

      {enrolling && (
        <Dialog
          title={`Enrol ${enrolling.name}`}
          onClose={() => setEnrolling(null)}
          onSubmit={saveEnrolment}
          submitLabel="Enrol"
          busy={busy}
          disabled={!enrol.course_id || !enrol.batch || !enrol.start_date || !enrol.end_date}
        >
          <Grid container spacing={2}>
            <Grid size={{ xs: 12 }}>
              <TextField
                select
                label="Course"
                value={enrol.course_id}
                onChange={(e) => setEnrol((s) => ({ ...s, course_id: e.target.value }))}
                required
                helperText={chosen ? `Fee ${money(chosen.fee)}, copied onto the enrolment.` : undefined}
              >
                {courseList.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Batch"
                value={enrol.batch}
                onChange={(e) => setEnrol((s) => ({ ...s, batch: e.target.value }))}
                required
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <DateField
                label="Start date"
                value={enrol.start_date}
                onChange={(value) => setEnrol((s) => ({ ...s, start_date: value }))}
                required
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <DateField
                label="End date"
                value={enrol.end_date}
                onChange={(value) => setEnrol((s) => ({ ...s, end_date: value }))}
                required
              />
            </Grid>
          </Grid>
        </Dialog>
      )}

      {viewing && (
        <RegistrationView
          student={viewing}
          course={courseName(viewing.course_id)}
          onClose={() => setViewing(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Registration"
        message={
          <>
            Are you sure you want to delete <strong>{deleting?.name}</strong> ({deleting?.registration_no})?
          </>
        }
        warning="This action cannot be undone."
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        confirmLabel="Delete"
        confirmIcon={DeleteIcon}
        busy={busy}
      />
    </>
  );
}

interface Enrolment {
  id: number;
  course_name: string | null;
  batch: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  fee: string | number | null;
  final_fee: string | number | null;
  fee_paid: string | number | null;
  certificate_id: number | null;
}

interface IssuedCertificate {
  id: number;
  certificate_no: string;
  course_name: string | null;
  grade: string | null;
  issued_on: string | null;
}

/**
 * One registration, read rather than edited: who they are, the papers they
 * brought, every course they have been enrolled on and every certificate they
 * have been issued. Edit and Certificates are one press away in the footer, so
 * whoever opened this to check something can go straight on to fixing it.
 */
function RegistrationView({
  student: s,
  course,
  onClose,
}: {
  student: Student;
  course: string;
  onClose: () => void;
}) {
  const enrolments = useFetch<Paged<Enrolment>>(`/courses/enrolments?student_id=${s.id}&per_page=50`);
  const certificates = useFetch<Paged<IssuedCertificate>>(
    `/student-certificates?student_id=${s.id}&per_page=50`,
  );
  const enrolRows = enrolments.data?.data ?? [];
  const certRows = certificates.data?.data ?? [];

  const fact = (label: string, value: ReactNode) => (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: 13.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {value || '—'}
      </Typography>
    </Box>
  );

  const place = [s.address, s.city, s.state, s.pincode].filter(Boolean).join(', ');
  const documents = [
    { label: 'Photo', path: s.photo },
    { label: 'ID proof', path: s.id_proof },
    { label: 'Qualification', path: s.qualification_doc },
  ].filter((d) => d.path);

  return (
    <Dialog
      title={`${s.name} · ${s.registration_no}`}
      onClose={onClose}
      onSubmit={onClose}
      submitLabel="Done"
      maxWidth="md"
      /* In the title bar: they act on the record rather than closing the
         dialog, so they sit with its name, away from Cancel and Done. */
      actions={
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<EditIcon fontSize="small" />}
            component={RouterLink}
            to={`/students/${s.id}/edit`}
          >
            Edit
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<CertificateIcon fontSize="small" />}
            component={RouterLink}
            to={`/student-certificates?student_id=${s.id}`}
          >
            Certificates
          </Button>
        </Stack>
      }
    >
      <Stack spacing={2.5}>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
          <Avatar src={fileUrl(s.photo) ?? undefined} sx={{ width: 64, height: 64, bgcolor: 'primary.main' }}>
            {s.name.charAt(0).toUpperCase()}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600, fontSize: 16 }}>{s.name}</Typography>
            <Typography variant="body2" color="text.secondary" className="mono">
              {s.registration_no}
            </Typography>
          </Box>
          <Box sx={{ ml: 'auto' }}>
            <StateChip {...(STATE[s.status] ?? { tone: 'plain', label: s.status })} />
          </Box>
        </Stack>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
            gap: 2,
          }}
        >
          {fact("Father's name", s.father_name)}
          {fact('Date of birth', s.dob?.slice(0, 10))}
          {fact('Gender', s.gender)}
          {fact('Mobile', s.mobile)}
          {fact('Alternate mobile', s.alt_mobile)}
          {fact('Email', s.email)}
          {fact('Course', course)}
          {fact('Registered', s.registration_date?.slice(0, 10))}
          {fact('Address', place)}
        </Box>

        {s.remark && fact('Remark', s.remark)}

        {documents.length > 0 && (
          <Box>
            <Typography sx={{ fontSize: 13.5, fontWeight: 600, mb: 0.5 }}>Documents</Typography>
            <Stack direction="row" spacing={2}>
              {documents.map((d) => (
                <Link key={d.label} href={fileUrl(d.path) ?? undefined} target="_blank" rel="noopener">
                  {d.label}
                </Link>
              ))}
            </Stack>
          </Box>
        )}

        <Box>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600, mb: 0.5 }}>Enrolments</Typography>
          <TableFrame
            loading={enrolments.loading}
            error={enrolments.error}
            empty={enrolRows.length === 0}
            emptyText="Not enrolled on a course yet."
          >
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Course</TableCell>
                  <TableCell>Dates</TableCell>
                  <TableCell>Fee</TableCell>
                  <TableCell>Paid</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Certificate</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {enrolRows.map((e) => (
                  <TableRow key={e.id} hover>
                    <TableCell sx={{ whiteSpace: 'normal', minWidth: 140 }}>
                      {e.course_name ?? '—'}
                      {e.batch && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {e.batch}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {e.start_date?.slice(0, 10) ?? '—'} – {e.end_date?.slice(0, 10) ?? '—'}
                    </TableCell>
                    <TableCell>{money(Number(e.final_fee ?? e.fee ?? 0))}</TableCell>
                    <TableCell>{money(Number(e.fee_paid ?? 0))}</TableCell>
                    <TableCell sx={{ textTransform: 'capitalize' }}>{e.status}</TableCell>
                    <TableCell>{e.certificate_id ? 'Issued' : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        </Box>

        <Box>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600, mb: 0.5 }}>Certificates</Typography>
          <TableFrame
            loading={certificates.loading}
            error={certificates.error}
            empty={certRows.length === 0}
            emptyText="No certificate issued yet. One is issued when an enrolment is completed."
          >
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Certificate no</TableCell>
                  <TableCell>Course</TableCell>
                  <TableCell>Grade</TableCell>
                  <TableCell>Issued</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {certRows.map((c) => (
                  <TableRow key={c.id} hover>
                    <TableCell className="mono">{c.certificate_no}</TableCell>
                    <TableCell>{c.course_name ?? '—'}</TableCell>
                    <TableCell>{c.grade ?? '—'}</TableCell>
                    <TableCell>{c.issued_on?.slice(0, 10) ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableFrame>
        </Box>
      </Stack>
    </Dialog>
  );
}
