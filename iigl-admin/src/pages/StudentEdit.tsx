import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Button,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBackOutlined';
import { useToast } from '../components/Toast';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { Panel, Notice } from '../components/ui';
import FileField from '../components/FileField';

interface Course {
  id: number;
  name: string;
}

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
  status: string;
  remark: string | null;
}

type Status = 'pending' | 'registered' | 'active';

const STATUSES: Array<{ id: Status; label: string }> = [
  { id: 'pending', label: 'Pending' },
  { id: 'registered', label: 'Registered' },
  { id: 'active', label: 'Active' },
];

export default function StudentEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const student = useFetch<{ data: Student }>(id ? `/students/${id}` : null);
  const courses = useFetch<{ data: Course[] }>('/courses?active=1&per_page=100');
  const courseList = courses.data?.data ?? [];

  const [form, setForm] = useState({
    name: '',
    father_name: '',
    dob: '',
    gender: '',
    mobile: '',
    alt_mobile: '',
    email: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    registration_date: '',
    course_id: '',
    status: 'pending' as Status,
    remark: '',
  });

  const [docs, setDocs] = useState({
    photo: null as string | null,
    id_proof: null as string | null,
    qualification_doc: null as string | null,
  });

  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load student data into form
  useEffect(() => {
    if (student.data?.data && !loaded) {
      const s = student.data.data;
      setForm({
        name: s.name,
        father_name: s.father_name ?? '',
        dob: s.dob?.slice(0, 10) ?? '',
        gender: s.gender ?? '',
        mobile: s.mobile,
        alt_mobile: s.alt_mobile ?? '',
        email: s.email ?? '',
        address: s.address ?? '',
        city: s.city ?? '',
        state: s.state ?? '',
        pincode: s.pincode ?? '',
        registration_date: s.registration_date?.slice(0, 10) ?? '',
        course_id: s.course_id ? String(s.course_id) : '',
        status: (s.status as Status) ?? 'pending',
        remark: s.remark ?? '',
      });
      setDocs({
        photo: s.photo,
        id_proof: s.id_proof,
        qualification_doc: s.qualification_doc,
      });
      setLoaded(true);
    }
  }, [student.data, loaded]);

  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        ...form,
        course_id: form.course_id ? Number(form.course_id) : null,
        ...docs,
      };
      await api.patch(`/students/${id}`, body);
      toast.ok(`${form.name} updated.`);
      navigate('/students');
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  if (student.loading) {
    return <Typography>Loading…</Typography>;
  }

  if (student.error || !student.data?.data) {
    return <Notice kind="error">Student not found.</Notice>;
  }

  const s = student.data.data;

  return (
    <Panel
      title={`Edit ${s.name}`}
      actions={
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            {s.registration_no}
          </Typography>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/students')}
          >
            Back
          </Button>
        </Stack>
      }
    >
      <Box component="form" onSubmit={save} sx={{ p: 2 }}>
        <Grid container spacing={2}>
          {/* Personal Information */}
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="Student Name"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="Father / Guardian"
              value={form.father_name}
              onChange={(e) => set('father_name', e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="Date of Birth"
              type="date"
              value={form.dob}
              onChange={(e) => set('dob', e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              select
              label="Gender"
              value={form.gender}
              onChange={(e) => set('gender', e.target.value)}
            >
              <MenuItem value="">Not stated</MenuItem>
              <MenuItem value="female">Female</MenuItem>
              <MenuItem value="male">Male</MenuItem>
              <MenuItem value="other">Other</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="Mobile Number"
              value={form.mobile}
              onChange={(e) => set('mobile', e.target.value)}
              required
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="Alternate Number"
              value={form.alt_mobile}
              onChange={(e) => set('alt_mobile', e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="City"
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="State"
              value={form.state}
              onChange={(e) => set('state', e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="Pincode"
              value={form.pincode}
              onChange={(e) => set('pincode', e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 8 }}>
            <TextField
              label="Address"
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              multiline
              minRows={2}
            />
          </Grid>

          {/* Registration Details */}
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="Registration Date"
              type="date"
              value={form.registration_date}
              onChange={(e) => set('registration_date', e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              select
              label="Selected Course"
              value={form.course_id}
              onChange={(e) => set('course_id', e.target.value)}
            >
              <MenuItem value="">Not chosen yet</MenuItem>
              {courseList.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              select
              label="Registration Status"
              value={form.status}
              onChange={(e) => set('status', e.target.value)}
            >
              {STATUSES.map((st) => (
                <MenuItem key={st.id} value={st.id}>
                  {st.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          {/*
            The three documents sit in one row of their own rather than in
            three columns of the form grid. A column is a third of the page and
            these frames are 150px wide, so a column each left them stranded
            with a hand's width of nothing between them. `useFlexGap` because
            the spacing has to survive the wrap on a narrow screen.
          */}
          <Grid size={{ xs: 12 }}>
            <Stack direction="row" spacing={2} useFlexGap sx={{ flexWrap: 'wrap' }}>
              <FileField
                label="Photograph"
                bucket="employee"
                value={docs.photo}
                onChange={(path) => setDocs((d) => ({ ...d, photo: path }))}
                ratio="3 / 4"
              />
              <FileField
                label="ID Proof"
                bucket="documentation"
                value={docs.id_proof}
                onChange={(path) => setDocs((d) => ({ ...d, id_proof: path }))}
                ratio="3 / 4"
              />
              <FileField
                label="Qualification"
                bucket="documentation"
                value={docs.qualification_doc}
                onChange={(path) => setDocs((d) => ({ ...d, qualification_doc: path }))}
                ratio="3 / 4"
              />
            </Stack>
          </Grid>

          {/* Remark */}
          <Grid size={{ xs: 12 }}>
            <TextField
              label="Remark"
              value={form.remark}
              onChange={(e) => set('remark', e.target.value)}
              multiline
              minRows={2}
            />
          </Grid>
        </Grid>

        <Stack
          direction="row"
          spacing={2}
          sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider', justifyContent: 'flex-end' }}
        >
          <Button variant="outlined" onClick={() => navigate('/students')}>
            Cancel
          </Button>
          <Button variant="contained" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save Changes'}
          </Button>
        </Stack>
      </Box>
    </Panel>
  );
}
