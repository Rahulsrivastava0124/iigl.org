import { useEffect, useState } from 'react';
import { Button, Grid, Stack, TextField, Typography } from '@mui/material';
import { useToast } from '../components/Toast';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf, useAuth } from '../lib/auth';
import { Panel, PasswordField } from '../components/ui';
import FileField from '../components/FileField';
import { ROLE_NAMES } from '../lib/portal';

interface Account {
  id: number;
  empid: string | null;
  fullname: string;
  owner_name: string | null;
  mobile: string;
  alt_mobile: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  pincode: string | null;
  gst_no: string | null;
  profile_photo: string | null;
  company_logo: string | null;
  signature: string | null;
  commision: number | null;
  role_id: number;
}

const TEXT_FIELDS = [
  ['fullname', 'Name'],
  ['owner_name', 'Owner name'],
  ['alt_mobile', 'Alternate mobile'],
  ['email', 'Email'],
  ['address', 'Address'],
  ['city', 'City'],
  ['state', 'State'],
  ['pincode', 'Pincode'],
  ['gst_no', 'GST number'],
  ['bank_name', 'Bank'],
  ['ifsc_code', 'IFSC'],
  ['account_no', 'Account number'],
] as const;

export default function Profile() {
  const toast = useToast();
  const { user } = useAuth();
  const account = useFetch<{ data: Account }>('/users/me');

  const [form, setForm] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);

  // Seed the form once the record arrives; after that the form is the truth
  // until it is saved.
  useEffect(() => {
    const a = account.data?.data;
    if (!a) return;
    const seed: Record<string, string> = {};
    for (const [key] of TEXT_FIELDS) seed[key] = (a as any)[key] ?? '';
    setForm(seed);
    setPhoto(a.profile_photo);
    setLogo(a.company_logo);
    setSignature(a.signature);
  }, [account.data]);

  const save = async () => {
    setBusy(true);
    try {
      await api.patch('/users/me', {
        ...form,
        profile_photo: photo,
        company_logo: logo,
        signature,
      });
      toast.ok('Profile saved.');
      account.reload();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);

  const changePassword = async () => {
    if (passwords.new_password !== passwords.confirm) {
      toast.error('The two new passwords do not match.');
      return;
    }
    setPwBusy(true);
    try {
      await api.post('/auth/change-password', {
        current_password: passwords.current_password,
        new_password: passwords.new_password,
      });
      toast.ok('Password changed.');
      setPasswords({ current_password: '', new_password: '', confirm: '' });
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setPwBusy(false);
    }
  };

  const a = account.data?.data;
  const isLab = user?.roleId === 2;

  return (
    <>

      <Panel
        title="Details"
        // Which account this is: the breadcrumb says "Your profile" but not
        // whose role or number, and that is the part worth having on screen.
        subtitle={
          a
            ? `${ROLE_NAMES[a.role_id] ?? 'Account'} · ${a.mobile}${a.empid ? ` · ${a.empid}` : ''}`
            : 'Loading…'
        }
        actions={
          <Button variant="contained" disabled={busy || !a} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        }
      >
        <Grid container spacing={2} sx={{ p: 2 }}>
          {TEXT_FIELDS.map(([key, label]) => (
            <Grid key={key} size={{ xs: 12, sm: 6, md: 4 }}>
              <TextField
                label={label}
                value={form[key] ?? ''}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                required={key === 'fullname'}
              />
            </Grid>
          ))}
        </Grid>

        <Grid container spacing={3} sx={{ px: 2, pb: 2.5 }}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <FileField label="Profile photo" bucket="employee" value={photo} onChange={setPhoto} />
          </Grid>
          {isLab && (
            <>
              <Grid size={{ xs: 12, sm: 4 }}>
                <FileField label="Company logo" bucket="icon" value={logo} onChange={setLogo} />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <FileField
                  label="Signature"
                  bucket="signature"
                  value={signature}
                  onChange={setSignature}
                  helperText="Printed on every certificate this laboratory issues."
                />
              </Grid>
            </>
          )}
        </Grid>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 2, pb: 2 }}>
          Your mobile number is how you sign in and cannot be changed here. Ask an administrator.
          {isLab && a?.commision != null && ` Your commission rate is ${a.commision}%.`}
        </Typography>
      </Panel>

      <Typography variant="h2" sx={{ mt: 4, mb: 1.5 }}>
        Password
      </Typography>

      <Panel>
        <Stack spacing={2} sx={{ p: 2, maxWidth: 380 }}>
          <PasswordField
            label="Current password"
            autoComplete="current-password"
            value={passwords.current_password}
            onChange={(e) => setPasswords({ ...passwords, current_password: e.target.value })}
          />
          <PasswordField
            label="New password"
            autoComplete="new-password"
            helperText="Eight characters or more."
            value={passwords.new_password}
            onChange={(e) => setPasswords({ ...passwords, new_password: e.target.value })}
          />
          <PasswordField
            label="Repeat new password"
            autoComplete="new-password"
            value={passwords.confirm}
            onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
          />
          <Button
            variant="contained"
            disabled={
              pwBusy ||
              !passwords.current_password ||
              passwords.new_password.length < 8 ||
              !passwords.confirm
            }
            onClick={changePassword}
            sx={{ alignSelf: 'flex-start' }}
          >
            {pwBusy ? 'Changing…' : 'Change password'}
          </Button>
          <Typography variant="caption" color="text.secondary">
            Changing your password does not sign out other devices. Sessions last eight hours.
          </Typography>
        </Stack>
      </Panel>
    </>
  );
}
