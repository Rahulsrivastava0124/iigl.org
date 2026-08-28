import { useState } from 'react';
import { Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { useAuth, messageOf } from '../lib/auth';
import { PORTALS } from '../lib/portal';
import { Notice } from '../components/ui';

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
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        p: 3,
        bgcolor: 'background.default',
      }}
    >
      <Paper
        variant="outlined"
        component="form"
        onSubmit={submit}
        sx={{
          width: '100%',
          maxWidth: 420,
          // Generous vertical padding: the card is the only thing on the page,
          // so it should feel like a destination rather than a widget.
          px: { xs: 4, sm: 6 },
          py: 6,
          textAlign: 'center',
          borderTop: 4,
          borderTopColor: 'primary.main',
        }}
      >
        <Box
          component="img"
          src="/logo.png"
          alt="IIGL"
          sx={{ height: 84, width: 'auto', mx: 'auto', mb: 3, display: 'block' }}
        />

        <Typography variant="h1" sx={{ mb: 1 }}>
          {config.title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          {config.subtitle}
        </Typography>

        {error && (
          <Notice kind="error" sx={{ mb: 3, textAlign: 'left' }}>
            {error}
          </Notice>
        )}

        {/* Fields read left-aligned even inside a centred card: a label above a
            box belongs over its left edge, and centred input text is hard to
            scan while typing a number. */}
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
          <TextField
            label="Password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            size="medium"
            required
          />
          <Button type="submit" variant="contained" size="large" disabled={busy} sx={{ py: 1.4 }}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </Stack>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 4 }}>
          {portal === 'team'
            ? 'Administrators sign in at the admin address.'
            : 'Laboratories and staff sign in at the team address.'}
        </Typography>
      </Paper>
    </Box>
  );
}
