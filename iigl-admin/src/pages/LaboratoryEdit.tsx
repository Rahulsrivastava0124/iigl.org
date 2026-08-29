import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Button, CircularProgress, Grid, Stack, TextField } from '@mui/material';
import { useToast } from '../components/Toast';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { Panel } from '../components/ui';
import FileField from '../components/FileField';
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
  empid: string;
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
  country: '',
  gst_no: '',
  pan_number: '',
  bank_name: '',
  ifsc_code: '',
  account_no: '',
  commision: '',
  empid: '',
  signature: '',
  documentation: '',
};

interface LabData {
  id: number;
  fullname: string | null;
  owner_name: string | null;
  mobile: string | null;
  alt_mobile: string | null;
  email: string | null;
  fax: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string | null;
  gst_no: string | null;
  bank_name: string | null;
  ifsc_code: string | null;
  account_no: string | null;
  commision: number | null;
  empid: string | null;
  signature: string | null;
  documentation: string | null;
}

export default function LaboratoryEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState<Form>(BLANK);
  const [labName, setLabName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get<{ data: LabData }>(`/users/${id}`);
        const d = res.data;
        setLabName(d.fullname ?? '');
        setForm({
          fullname: d.fullname ?? '',
          owner_name: d.owner_name ?? '',
          mobile: d.mobile ?? '',
          alt_mobile: d.alt_mobile ?? '',
          email: d.email ?? '',
          fax: d.fax ?? '',
          address: d.address ?? '',
          city: d.city ?? '',
          state: d.state ?? '',
          pincode: d.pincode ?? '',
          country: d.country ?? '',
          gst_no: d.gst_no ?? '',
          pan_number: '',
          bank_name: d.bank_name ?? '',
          ifsc_code: d.ifsc_code ?? '',
          account_no: d.account_no ?? '',
          commision: d.commision != null ? String(d.commision) : '',
          empid: d.empid ?? '',
          signature: d.signature ?? '',
          documentation: d.documentation ?? '',
        });
      } catch (e) {
        toast.error(messageOf(e));
        navigate('/laboratories');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, navigate, toast]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch(`/users/${id}`, {
        fullname: form.fullname,
        owner_name: form.owner_name || null,
        mobile: form.mobile,
        alt_mobile: form.alt_mobile || null,
        email: form.email || null,
        fax: form.fax || null,
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        pincode: form.pincode || null,
        country: form.country || null,
        gst_no: form.gst_no || null,
        bank_name: form.bank_name || null,
        ifsc_code: form.ifsc_code || null,
        account_no: form.account_no || null,
        commision: form.commision ? Number(form.commision) : null,
        empid: form.empid || null,
        signature: form.signature || null,
        documentation: form.documentation || null,
      });

      toast.ok(`Laboratory "${form.fullname}" updated.`);
      navigate('/laboratories');
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Panel title="Edit Laboratory">
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      </Panel>
    );
  }

  return (
    <Panel
      title={`Edit — ${labName}`}
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
              label="Employee ID"
              placeholder="Eg. LAB0001"
              value={form.empid}
              onChange={(e) => set('empid', e.target.value)}
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
              label="Country"
              value={form.country}
              onChange={(e) => set('country', e.target.value)}
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
            {busy ? 'Saving…' : 'Save Changes'}
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
