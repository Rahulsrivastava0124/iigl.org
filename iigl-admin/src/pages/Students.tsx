import { useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import {
  Button,
  Grid,
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
  Pager,
  Panel,
  RowActions,
  SearchField,
  StateChip,
  TableFrame,
  money,
} from '../components/ui';
import type { Tone } from '../components/ui';
import type { Paged } from '../lib/api';

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

  const [search, setSearch] = useState('');
  const term = useDebounced(search);

  const query = new URLSearchParams({ page: String(page), per_page: '25' });
  if (status !== 'all') query.set('status', status);
  if (term.trim()) query.set('q', term.trim());

  const source = useFetch<Paged<Student>>(`/students?${query}`);
  const courses = useFetch<Paged<Course>>('/courses?active=1&per_page=100');
  const rows = source.data?.data ?? [];
  const courseList = courses.data?.data ?? [];

  const [enrolling, setEnrolling] = useState<Student | null>(null);
  const [enrol, setEnrol] = useState({ course_id: '', batch: '', start_date: '', end_date: '' });
  const [deleting, setDeleting] = useState<Student | null>(null);
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
        footer={<Pager meta={source.data?.meta} onPage={(n) => go({ page: n })} />}
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
                        label="Edit registration"
                        icon={EditIcon}
                        to={`/students/${s.id}/edit`}
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
