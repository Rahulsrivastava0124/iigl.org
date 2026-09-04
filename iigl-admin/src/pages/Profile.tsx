import { useEffect, useState } from 'react';
import { Button, Grid, Stack, TextField, Typography } from '@mui/material';
import { useToast } from '../components/Toast';
import { useFetch } from '../lib/useFetch';
import { api } from '../lib/api';
import { messageOf, useAuth } from '../lib/auth';
import { hint, Panel, PasswordField } from '../components/ui';
import FileField from '../components/FileField';
import { isLab, isSuper, ROLE_NAMES } from '../lib/portal';

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
  /** The posting you hold. Null for a laboratory and for head office. */
  employment: {
    id: number;
    lab_empid: string;
    joining_date: string;
    salary: string;
    lab_id: number | null;
    lab_name: string | null;
    lab_mobile: string | null;
    employer_role_id: number | null;
  } | null;
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
  const { user, refresh } = useAuth();
  const account = useFetch<{ data: Account }>('/users/me');

  const [form, setForm] = useState<Record<string, string>>({});
  // Only head office may move its own sign-in number; for everyone else that
  // is an administrator's act, and they are shown the number rather than a box.
  const headOffice = isSuper(user);
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
      // The avatar in the bar reads the session's own photograph, which is
      // read from the row rather than carried in the cookie. Without this the
      // new picture only appears on the next full load.
      void refresh();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  /**
   * One field, by decision: the new password and nothing else.
   *
   * No current password — the session is the authority, so anybody who reaches
   * an open one can change it. No repeat field either, so a typo becomes a
   * password nobody knows; the eye toggle is what stands in for the second
   * field, and the sentence under the button says the rest.
   */
  const [newPassword, setNewPassword] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  const changePassword = async () => {
    setPwBusy(true);
    try {
      await api.post('/auth/change-password', { new_password: newPassword });
      toast.ok('Password changed.');
      setNewPassword('');
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setPwBusy(false);
    }
  };

  const a = account.data?.data;
  const lab = isLab(user);

  return (
    <>

      <Panel
        title="Details"
        // Which account this is: the breadcrumb says "Your profile" but not
        // whose role or number, and that is the part worth having on screen.
        // Which account this is, and — for anybody employed — who they work
        // under. A team member or a custom-role account is defined by their
        // employer as much as by their own number, and the screen said nothing
        // about it: `Team · 9507981943 · EMP0001` names nobody to ask.
        subtitle={
          a
            ? `${ROLE_NAMES[a.role_id] ?? 'Account'} · ${a.mobile}${a.empid ? ` · ${a.empid}` : ''}` +
              (a.employment?.lab_name
                ? ` · under ${a.employment.lab_name}${
                    a.employment.lab_mobile ? ` (${a.employment.lab_mobile})` : ''
                  }`
                : '')
            : 'Loading…'
        }
        actions={
          <Button variant="contained" disabled={busy || !a} onClick={save}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        }
      >
        <Grid container spacing={2} sx={{ p: 2 }}>
          {/*
            The number you sign in with, in the form rather than only in the
            line above it: it is the first thing anybody looks for on their own
            profile.

            Head office may change it; everybody else is shown it and told who
            can. Telling the one person who *is* head office to ask an
            administrator is telling them to ask themselves.
          */}
          <Grid size={{ xs: 12, sm: 6, md: 4 }}>
            <TextField
              label="Mobile number"
              value={form.mobile ?? a?.mobile ?? ''}
              onChange={(e) => setForm({ ...form, mobile: e.target.value })}
              disabled={!headOffice}
              required={headOffice}
              slotProps={hint(
                headOffice
                  ? 'How you sign in. Changing it changes how you get in.'
                  : 'How you sign in. Ask an administrator to change it.',
              )}
            />
          </Grid>

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
            <FileField
              label="Profile photo"
              bucket="employee"
              value={photo}
              onChange={setPhoto}
              ratio="1 / 1"
            />
          </Grid>
          {lab && (
            <>
              <Grid size={{ xs: 12, sm: 4 }}>
                <FileField label="Company logo" bucket="icon" value={logo} onChange={setLogo} />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <FileField
                  label="Signature"
                  bucket="signature"
                  ratio="3 / 1"
                  value={signature}
                  onChange={setSignature}
                  helperText="Printed on every certificate this laboratory issues."
                />
              </Grid>
            </>
          )}
        </Grid>

        {a?.employment && (
          // Read-only, and deliberately so: pay is agreed with an employer, not
          // typed by the person being paid. It is here because "what am I on"
          // is a question the profile should answer without asking anybody.
          <Grid container spacing={2} sx={{ px: 2, pb: 2 }}>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <TextField
                label="Salary"
                value={a.employment.salary ? `₹${Number(a.employment.salary).toLocaleString('en-IN')}` : '—'}
                disabled
                slotProps={hint('Set by your employer.')}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <TextField
                label="Joined"
                value={a.employment.joining_date || '—'}
                disabled
                helperText={
                  a.employment.lab_name ? `Working under ${a.employment.lab_name}.` : undefined
                }
              />
            </Grid>
          </Grid>
        )}

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 2, pb: 2 }}>
          Your mobile number is above, and how you sign in; an administrator changes it.
          {lab && a?.commision != null && ` Your commission rate is ${a.commision}%.`}
        </Typography>
      </Panel>

      <Typography variant="h2" sx={{ mt: 4, mb: 1.5 }}>
        Password
      </Typography>

      <Panel>
        <Stack spacing={1.5} sx={{ p: 2 }}>
          {/*
            Field and button on one line: this is one action with one input,
            and stacking them put the button a paragraph away from the box it
            acts on. `alignItems: flex-start` keeps the button level with the
            field rather than centred against the field plus its helper text.
          */}
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            sx={{ alignItems: { xs: 'stretch', sm: 'flex-start' } }}
          >
            <PasswordField
              label="New password"
              autoComplete="new-password"
              helperText="Eight characters or more. Check it with the eye before saving — it is not asked for twice."
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              sx={{ width: { xs: '100%', sm: 320 } }}
            />
            <Button
              variant="contained"
              disabled={pwBusy || newPassword.length < 8}
              onClick={changePassword}
              // Matches the field's own height, so the two read as one control
              // rather than a button that happens to sit beside a box.
              sx={{ whiteSpace: 'nowrap', height: 56 }}
            >
              {pwBusy ? 'Changing…' : 'Change password'}
            </Button>
          </Stack>

          <Typography variant="caption" color="text.secondary">
            This takes effect at once and does not sign out other devices. A sign-in lasts
            two days.
          </Typography>
        </Stack>
      </Panel>
    </>
  );
}
