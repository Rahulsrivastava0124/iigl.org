import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, Grid, Stack, TextField } from '@mui/material';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { Panel, PasswordField } from '../components/ui';
import FileField from '../components/FileField';
import { ROLE } from '../lib/portal';
import SaveIcon from '@mui/icons-material/SaveOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBackOutlined';

interface Form {
  fullname: string;
  owner_name: string;
  mobile: string;
  alt_mobile: string;
  email: string;
  fax: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  gst_no: string;
  pan_number: string;
  bank_name: string;
  ifsc_code: string;
  account_no: string;
  commision: string;
  password: string;
  signature: string;
  documentation: string;
}

const BLANK: Form = {
  fullname: '',
  owner_name: '',
  mobile: '',
  alt_mobile: '',
  email: '',
  fax: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
  gst_no: '',
  pan_number: '',
  bank_name: '',
  ifsc_code: '',
  account_no: '',
  commision: '',
  password: '',
  signature: '',
  documentation: '',
};

export default function LaboratoryCreate() {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState<Form>(BLANK);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post<{ data: { id: number } }>('/users', {
        fullname: form.fullname,
        mobile: form.mobile,
        password: form.password,
        role_id: ROLE.LAB,
      });

      const id = res.data.id;

      const patch: Record<string, string | number | null> = {};
      if (form.owner_name) patch.owner_name = form.owner_name;
      if (form.email) patch.email = form.email;
      if (form.alt_mobile) patch.alt_mobile = form.alt_mobile;
      if (form.fax) patch.fax = form.fax;
      if (form.address) patch.address = form.address;
      if (form.city) patch.city = form.city;
      if (form.state) patch.state = form.state;
      if (form.pincode) patch.pincode = form.pincode;
      if (form.country) patch.country = form.country;
      if (form.gst_no) patch.gst_no = form.gst_no;
      if (form.bank_name) patch.bank_name = form.bank_name;
      if (form.ifsc_code) patch.ifsc_code = form.ifsc_code;
      if (form.account_no) patch.account_no = form.account_no;
      if (form.commision) patch.commision = Number(form.commision);
      if (form.signature) patch.signature = form.signature;
      if (form.documentation) patch.documentation = form.documentation;

      if (Object.keys(patch).length > 0) {
        await api.patch(`/users/${id}`, patch);
      }

      toast.ok(`Laboratory "${form.fullname}" created.`);
      navigate('/laboratories');
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Add New Laboratory"
      actions={
        <Button
          variant="text"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/laboratories')}
        >
          Back to list
        </Button>
      }
    >
      <Box component="form" onSubmit={submit} sx={{ p: 2 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="Laboratory Name"
              placeholder="Eg. Sri Jewelery & Lab"
              value={form.fullname}
              onChange={(e) => set('fullname', e.target.value)}
              required
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="Owner Name"
              placeholder="Eg. Ramesh Mishra"
              value={form.owner_name}
              onChange={(e) => set('owner_name', e.target.value)}
              required
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="Mobile"
              placeholder="Eg. 9875642310"
              value={form.mobile}
              onChange={(e) => set('mobile', e.target.value)}
              required
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="Alt Mobile"
              placeholder="Eg. 9875642310"
              value={form.alt_mobile}
              onChange={(e) => set('alt_mobile', e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="Official Email"
              type="email"
              placeholder="Eg. lab@example.com"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="FAX No"
              placeholder="Eg. 9879854465"
              value={form.fax}
              onChange={(e) => set('fax', e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="Office Address"
              placeholder="Full address"
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="City / District"
              placeholder="Eg. Patna"
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="State"
              placeholder="Eg. Bihar"
              value={form.state}
              onChange={(e) => set('state', e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="Pincode"
              placeholder="Eg. 800020"
              value={form.pincode}
              onChange={(e) => set('pincode', e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="Country"
              value={form.country}
              onChange={(e) => set('country', e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="GST No"
              placeholder="Eg. 22XXXXXXXXXXXXXXX"
              value={form.gst_no}
              onChange={(e) => set('gst_no', e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="PAN Number"
              placeholder="Eg. ABCDE1234F"
              value={form.pan_number}
              onChange={(e) => set('pan_number', e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="Bank Name"
              placeholder="Eg. State Bank of India"
              value={form.bank_name}
              onChange={(e) => set('bank_name', e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="Account No"
              placeholder="Eg. 12345678901234"
              value={form.account_no}
              onChange={(e) => set('account_no', e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="IFSC Code"
              placeholder="Eg. SBIN0001234"
              value={form.ifsc_code}
              onChange={(e) => set('ifsc_code', e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="Commission (%)"
              type="number"
              placeholder="Eg. 10"
              value={form.commision}
              onChange={(e) => set('commision', e.target.value)}
              slotProps={{ htmlInput: { min: 0, max: 100, step: 0.01 } }}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <PasswordField
              label="Password"
              placeholder="Min 8 characters"
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              slotProps={{ htmlInput: { minLength: 8 } }}
              required
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <FileField
              label="Signature"
              bucket="signature"
              value={form.signature}
              onChange={(url) => set('signature', url ?? '')}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <FileField
              label="Documentation"
              bucket="documentation"
              value={form.documentation}
              onChange={(url) => set('documentation', url ?? '')}
            />
          </Grid>
        </Grid>

        <Stack direction="row" spacing={2} sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            type="submit"
            disabled={busy}
            startIcon={<SaveIcon />}
          >
            {busy ? 'Creating…' : 'Create Laboratory'}
          </Button>
          <Button
            variant="outlined"
            onClick={() => navigate('/laboratories')}
          >
            Cancel
          </Button>
        </Stack>
      </Box>
    </Panel>
  );
}
