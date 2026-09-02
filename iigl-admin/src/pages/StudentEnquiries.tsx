import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Button,
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
import FollowIcon from '@mui/icons-material/PhoneInTalkOutlined';
import ConvertIcon from '@mui/icons-material/HowToRegOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { useDebounced, useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { useToast } from '../components/Toast';
import { EnquiryViewDialog, FollowupDialog } from '../components/EnquiryFollowups';
import {
  ConfirmDialog,
  DateField,
  FormPanel,
  IconAction,
  Pager,
  Panel,
  RowActions,
  SearchField,
  StateChip,
  TableFrame,
  ToneAction,
  today,
} from '../components/ui';
import type { Tone } from '../components/ui';
import type { Paged } from '../lib/api';

type Status = 'new' | 'converted' | 'not_interested';

/** Stage one of the pipeline: enquiry → registration → course → certificate. */
const TABS: Array<{ id: Status | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'New' },
  { id: 'converted', label: 'Converted' },
  { id: 'not_interested', label: 'Not interested' },
];

/**
 * The ladder in colour: waiting while it needs somebody, settled once it has
 * become a registration, refused when the answer was no.
 */
const STATE: Record<Status, { tone: Tone; label: string }> = {
  new: { tone: 'waiting', label: 'New' },
  converted: { tone: 'settled', label: 'Converted' },
  not_interested: { tone: 'refused', label: 'Not interested' },
};

interface Enquiry {
  id: number;
  name: string;
  mobile: string;
  email: string | null;
  course_id: number | null;
  course_interested: string | null;
  enquiry_date: string | null;
  source: string | null;
  status: Status;
  remarks: string | null;
  follow_up_on: string | null;
  student_id: number | null;
  /** How many times somebody has tried, and when they last did. */
  followups: number;
  last_followup_at: string | null;
}

interface Course {
  id: number;
  name: string;
}

const BLANK = {
  id: undefined as number | undefined,
  name: '',
  mobile: '',
  email: '',
  course_id: '',
  course_interested: '',
  enquiry_date: '',
  source: '',
  status: 'new' as Status,
  follow_up_on: '',
  remarks: '',
};

export default function StudentEnquiries() {
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as Status | null) ?? 'all';
  const page = Number(params.get('page') ?? 1);

  const [search, setSearch] = useState('');
  const term = useDebounced(search);

  const query = new URLSearchParams({ page: String(page), per_page: '25' });
  if (status !== 'all') query.set('status', status);
  if (term.trim()) query.set('q', term.trim());

  const source = useFetch<Paged<Enquiry>>(`/students/enquiries?${query}`);
  const courses = useFetch<Paged<Course>>('/courses?active=1&per_page=100');
  const rows = source.data?.data ?? [];
  const courseList = courses.data?.data ?? [];

  const [form, setForm] = useState<typeof BLANK | null>(null);
  const [converting, setConverting] = useState<Enquiry | null>(null);
  const [following, setFollowing] = useState<Enquiry | null>(null);
  const [viewing, setViewing] = useState<Enquiry | null>(null);
  const [deleting, setDeleting] = useState<Enquiry | null>(null);
  const [busy, setBusy] = useState(false);

  const go = (next: { status?: string; page?: number }) => {
    const q: Record<string, string> = {};
    const s = next.status ?? (status === 'all' ? '' : status);
    if (s) q.status = s;
    if (next.page && next.page > 1) q.page = String(next.page);
    setParams(q);
  };

  const set = (key: keyof typeof BLANK, v: string) => setForm((f) => (f ? { ...f, [key]: v } : f));

  const save = async () => {
    if (!form) return;
    setBusy(true);
    try {
      const body = {
        name: form.name,
        mobile: form.mobile,
        email: form.email,
        course_id: form.course_id ? Number(form.course_id) : null,
        course_interested: form.course_interested,
        enquiry_date: form.enquiry_date,
        source: form.source,
        status: form.status,
        follow_up_on: form.follow_up_on,
        remarks: form.remarks,
      };
      if (form.id) {
        await api.patch(`/students/enquiries/${form.id}`, body);
        toast.ok('Enquiry updated.');
      } else {
        await api.post('/students/enquiries', body);
        toast.ok(`Enquiry from ${form.name} recorded.`);
      }
      setForm(null);
      source.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  /** Convert: the enquiry becomes a registration, and we land on it. */
  const convert = async () => {
    if (!converting) return;
    setBusy(true);
    try {
      const res = await api.post<{ data: { id: number; registration_no: string } }>(
        `/students/enquiries/${converting.id}/convert`,
        {},
      );
      toast.ok(`${converting.name} registered as ${res.data.registration_no}.`);
      setConverting(null);
      navigate('/students');
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
      await api.del(`/students/enquiries/${deleting.id}`);
      toast.ok('Enquiry deleted.');
      setDeleting(null);
      source.reload();
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const courseName = (e: Enquiry) =>
    courseList.find((c) => c.id === e.course_id)?.name ?? e.course_interested ?? '—';

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

      {form && (
        <FormPanel
          title={form.id ? `Edit enquiry — ${form.name}` : 'New enquiry'}
          onClose={() => setForm(null)}
          onSubmit={save}
          busy={busy}
        >
          <TextField
            label="Student name"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
          />
          <TextField
            label="Mobile number"
            value={form.mobile}
            onChange={(e) => set('mobile', e.target.value)}
            required
          />
          <TextField label="Email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          <TextField
            select
            label="Course interested"
            value={form.course_id}
            onChange={(e) => set('course_id', e.target.value)}
            helperText="Leave blank and type it below if we do not run it yet."
          >
            <MenuItem value="">Not on the list</MenuItem>
            {courseList.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Other course"
            value={form.course_interested}
            onChange={(e) => set('course_interested', e.target.value)}
          />
          <DateField
            label="Enquiry date"
            value={form.enquiry_date}
            onChange={(value) => set('enquiry_date', value)}
          />
          <TextField
            label="Enquiry source"
            value={form.source}
            onChange={(e) => set('source', e.target.value)}
            helperText="Website, phone, walk-in, referral."
          />
          <TextField
            select
            label="Status"
            value={form.status}
            onChange={(e) => set('status', e.target.value)}
          >
            {/*
              Converted is not something you choose — it happens when an enquiry
              becomes a registration — so it is not offered. It is still listed
              while the form is open on an enquiry that already holds it, or the
              select would show a blank where the status is.
            */}
            {TABS.filter(
              (t) => t.id !== 'all' && (t.id !== 'converted' || form.status === 'converted'),
            ).map((t) => (
              <MenuItem key={t.id} value={t.id} disabled={t.id === 'converted'}>
                {t.label}
              </MenuItem>
            ))}
          </TextField>
          <DateField
            label="Follow up on"
            value={form.follow_up_on}
            onChange={(value) => set('follow_up_on', value)}
          />
          <TextField
            label="Follow-up / remarks"
            value={form.remarks}
            onChange={(e) => set('remarks', e.target.value)}
            multiline
            minRows={2}
            sx={{ gridColumn: '1 / -1' }}
          />
        </FormPanel>
      )}

      <Panel
        title="Course enquiries"
        count={source.data ? `${source.data.meta.total.toLocaleString()} enquiries` : 'Loading…'}
        footer={<Pager meta={source.data?.meta} onPage={(n) => go({ page: n })} />}
        actions={
          <>
            <SearchField
              placeholder="Name, mobile, course…"
              value={search}
              onChange={(v) => {
                setSearch(v);
                go({ page: 1 });
              }}
            />
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              // Dated today unless somebody says otherwise: an enquiry is
              // recorded when it comes in, so today is right nearly every time
              // and typing it is a step that adds nothing.
              onClick={() => setForm({ ...BLANK, enquiry_date: today() })}
            >
              New enquiry
            </Button>
          </>
        }
      >
        <TableFrame loading={source.loading} error={source.error} empty={rows.length === 0}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell>SN.</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Mobile</TableCell>
                <TableCell>Course</TableCell>
                <TableCell>Source</TableCell>
                <TableCell>Enquired</TableCell>
                <TableCell>Follow up</TableCell>
                <TableCell>Status</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((e, index) => (
                <TableRow key={e.id} hover>
                  <TableCell className="mono">{index + 1}</TableCell>
                  <TableCell sx={{ whiteSpace: 'normal', minWidth: 150 }}>{e.name}</TableCell>
                  <TableCell className="mono">{e.mobile}</TableCell>
                  <TableCell>{courseName(e)}</TableCell>
                  <TableCell>{e.source ?? '—'}</TableCell>
                  <TableCell>{e.enquiry_date?.slice(0, 10) ?? '—'}</TableCell>
                  <TableCell sx={{ whiteSpace: 'normal', minWidth: 130 }}>
                    {e.follow_up_on?.slice(0, 10) ?? '—'}
                    {e.followups > 0 && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {e.followups} {e.followups === 1 ? 'attempt' : 'attempts'}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <StateChip {...(STATE[e.status] ?? { tone: 'plain', label: e.status })} />
                  </TableCell>
                  <TableCell>
                    <RowActions>
                      <IconAction
                        label="View enquiry and its history"
                        icon={ViewIcon}
                        onClick={() => setViewing(e)}
                      />
                      {/* Following up is the work this screen exists for, so it
                          is the one control that keeps its word. */}
                      {!e.student_id && (
                        <ToneAction
                          label="Follow"
                          icon={FollowIcon}
                          tone="waiting"
                          size="small"
                          onClick={() => setFollowing(e)}
                        />
                      )}
                      {!e.student_id && (
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<ConvertIcon fontSize="small" />}
                          onClick={() => setConverting(e)}
                          sx={{ fontSize: 12, py: 0.5, px: 1, minWidth: 'auto' }}
                        >
                          Convert
                        </Button>
                      )}
                      <IconAction
                        label="Edit enquiry"
                        overflow
                        icon={EditIcon}
                        onClick={() =>
                          setForm({
                            id: e.id,
                            name: e.name,
                            mobile: e.mobile,
                            email: e.email ?? '',
                            course_id: e.course_id ? String(e.course_id) : '',
                            course_interested: e.course_interested ?? '',
                            enquiry_date: e.enquiry_date?.slice(0, 10) ?? '',
                            source: e.source ?? '',
                            // Converted is kept rather than swapped for
                            // something else: it is a real state, and the
                            // select below offers it while the form holds it.
                            // ('interested' was not one of this screen's
                            // statuses at all, and did not compile.)
                            status: e.status,
                            follow_up_on: e.follow_up_on?.slice(0, 10) ?? '',
                            remarks: e.remarks ?? '',
                          })
                        }
                      />
                      <IconAction
                        label="Delete enquiry"
                        icon={DeleteIcon}
                        danger
                        onClick={() => setDeleting(e)}
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
        Converted is not a status you set by hand: converting creates the registration and the
        status follows, so an enquiry marked converted always has a student behind it.
      </Typography>

      {following && (
        <FollowupDialog
          book="student"
          enquiry={following}
          onClose={() => setFollowing(null)}
          onSaved={() => source.reload()}
        />
      )}

      {viewing && (
        <EnquiryViewDialog
          book="student"
          enquiry={{
            ...viewing,
            // The course book has no `kind`, `subject` or `message`: what was
            // asked about is the course, and the notes are the remarks.
            kind: 'Course enquiry',
            subject: courseName(viewing),
            message: null,
            remark: viewing.remarks,
            created_at: viewing.enquiry_date,
          }}
          onClose={() => setViewing(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(converting)}
        title="Convert to Registration"
        message={<>Convert <strong>{converting?.name}</strong> to a student registration?</>}
        warning="This creates a registration, issues a registration number, and marks the enquiry converted."
        onClose={() => setConverting(null)}
        onConfirm={convert}
        confirmLabel="Convert"
        confirmIcon={ConvertIcon}
        danger={false}
        busy={busy}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete Enquiry"
        message={<>Are you sure you want to delete the enquiry from <strong>{deleting?.name}</strong>?</>}
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
