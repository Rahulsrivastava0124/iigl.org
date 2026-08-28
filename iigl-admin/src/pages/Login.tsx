import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Link, Stack, TextField } from '@mui/material';
import { useAuth, messageOf } from '../lib/auth';
import { PORTALS } from '../lib/portal';
import { Notice, PasswordField } from '../components/ui';
import AuthCard from '../components/AuthCard';

export default function Login() {
  const { signIn, portal } = useAuth();
  const config = PORTALS[portal];

  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(mobile.trim(), password);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthCard
      title={config.title}
      subtitle={config.subtitle}
      onSubmit={submit}
      footer={
        portal === 'team'
          ? 'Administrators sign in at the admin address.'
          : 'Laboratories and staff sign in at the team address.'
      }
    >
      {error && (
        <Notice kind="error" sx={{ mb: 3, textAlign: 'left' }}>
          {error}
        </Notice>
      )}

      <Stack spacing={2.5} sx={{ textAlign: 'left' }}>
        <TextField
          label="Mobile number"
          name="mobile"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          autoComplete="username"
          slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          size="medium"
          autoFocus
          required
        />
        <PasswordField
          label="Password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          size="medium"
          required
        />

        {/* Above the button, not below it: someone who cannot get in is looking
            at the password box, and this is the next thing they need. */}
        <Box sx={{ textAlign: 'right', mt: -1 }}>
          <Link
            component={RouterLink}
            to="/forgot-password"
            variant="body2"
            underline="hover"
          >
            Forgotten your password?
          </Link>
        </Box>

        <Button type="submit" variant="contained" size="large" disabled={busy} sx={{ py: 1.4 }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </Stack>
    </AuthCard>
  );
}
