import { useState } from 'react';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { useAuth, messageOf } from '../lib/auth';
import { PORTALS } from '../lib/portal';

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
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3 }}>
      <Paper
        variant="outlined"
        component="form"
        onSubmit={submit}
        sx={{ width: '100%', maxWidth: 480, p: 5, borderTop: 3, borderTopColor: 'primary.main' }}
      >
        <Typography variant="h1" sx={{ mb: 0.5 }}>
          {config.title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
          {config.subtitle}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Stack spacing={2.5}>
          <TextField
            label="Mobile number"
            name="mobile"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            autoComplete="username"
            slotProps={{ htmlInput: { inputMode: 'numeric' } }}
            autoFocus
            required
          />
          <TextField
            label="Password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <Button type="submit" variant="contained" size="large" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </Stack>

        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 2, textAlign: 'center' }}
        >
          {portal === 'team'
            ? 'Administrators sign in at the admin address.'
            : 'Laboratories and staff sign in at the team address.'}
        </Typography>
      </Paper>
    </Box>
  );
}
