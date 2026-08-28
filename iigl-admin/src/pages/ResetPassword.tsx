import { useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { Box, Button, Link, Stack } from '@mui/material';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { Notice, PasswordField } from '../components/ui';
import AuthCard from '../components/AuthCard';

/**
 * The page a password reset link opens.
 *
 * Reachable without a session — it is for people who cannot sign in — so it
 * lives outside the Shell and outside every permission check. The address and
 * token come from the query string the mail carried; neither is asked for
 * again, because retyping a 64-character token is not a thing anyone does.
 */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const email = params.get('email') ?? '';
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Checked here as well as on the API: the mismatch is the common mistake, and
  // a person should not have to wait for a request to be told they mistyped.
  const mismatch = confirm.length > 0 && password !== confirm;
  const tooShort = password.length > 0 && password.length < 8;
  const ready = password.length >= 8 && password === confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/reset-password', { email, token, new_password: password });
      setDone(true);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const signIn = (
    <Link component={RouterLink} to="/" variant="body2" underline="hover">
      Go to sign in
    </Link>
  );

  if (done) {
    return (
      <AuthCard title="Password changed">
        <Notice kind="ok" sx={{ textAlign: 'left' }}>
          Your password has been changed. Sign in with the new one.
        </Notice>
        <Box sx={{ mt: 3 }}>{signIn}</Box>
      </AuthCard>
    );
  }

  if (!email || !token) {
    return (
      <AuthCard title="This link is incomplete">
        <Notice kind="error" sx={{ textAlign: 'left' }}>
          Open the most recent link from your email, or ask for a new one.
        </Notice>
        <Box sx={{ mt: 3 }}>
          <Link component={RouterLink} to="/forgot-password" variant="body2" underline="hover">
            Ask for a new link
          </Link>
        </Box>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Choose a new password"
      subtitle={<>For {email}</>}
      onSubmit={submit}
      footer="The link stops working an hour after it was sent, and once it has been used."
    >
      {error && (
        <Notice kind="error" sx={{ mb: 3, textAlign: 'left' }}>
          {error}
        </Notice>
      )}

      <Stack spacing={2.5} sx={{ textAlign: 'left' }}>
        <PasswordField
          label="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          size="medium"
          error={tooShort}
          helperText="Eight characters or more."
          required
        />
        <PasswordField
          label="Repeat new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          size="medium"
          error={mismatch}
          helperText={mismatch ? 'These do not match.' : ' '}
          required
        />
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={busy || !ready}
          sx={{ py: 1.4 }}
        >
          {busy ? 'Saving…' : 'Set password'}
        </Button>
        <Box sx={{ textAlign: 'center' }}>{signIn}</Box>
      </Stack>
    </AuthCard>
  );
}
