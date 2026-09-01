import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Grid,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBackOutlined';
import { useToast } from '../components/Toast';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { DateField, Panel } from '../components/ui';
import FileField from '../components/FileField';

interface Course {
  id: number;
  name: string;
}

type Status = 'pending' | 'registered' | 'active';

const STATUSES: Array<{ id: Status; label: string }> = [
  { id: 'pending', label: 'Pending' },
  { id: 'registered', label: 'Registered' },
  { id: 'active', label: 'Active' },
];

export default function StudentCreate() {
  const navigate = useNavigate();
  const toast = useToast();

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
    registration_date: new Date().toISOString().slice(0, 10),
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
      const res = await api.post<{ data: { registration_no: string } }>('/students', body);
      toast.ok(`${form.name} registered as ${res.data.registration_no}.`);
      navigate('/students');
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Register a Student"
      actions={
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/students')}
        >
          Back
        </Button>
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
            <DateField
              label="Date of Birth"
              value={form.dob}
              onChange={(value) => set('dob', value)}
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
            <DateField
              label="Registration Date"
              value={form.registration_date}
              onChange={(value) => set('registration_date', value)}
              helperText="Registration number is issued on save."
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
              {STATUSES.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.label}
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
            {busy ? 'Registering…' : 'Register Student'}
          </Button>
        </Stack>
      </Box>
    </Panel>
  );
}
