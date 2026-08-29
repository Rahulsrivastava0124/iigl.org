import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Link, Stack, TextField } from '@mui/material';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { Notice } from '../components/ui';
import { useToast } from '../components/Toast';
import AuthCard from '../components/AuthCard';

/**
 * Asks for a password reset link.
 *
 * Signed out by definition, so it sits outside the Shell alongside sign-in and
 * the reset page itself.
 *
 * It never says whether the address is on an account. The API answers
 * identically either way, and repeating that answer here is what stops the
 * page being a way to test which addresses are registered — so the confirmation
 * below is deliberately "if that address is on an account", not "sent".
 */
export default function ForgotPassword() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { message } = await api.post<{ message: string }>('/auth/forgot-password', {
        email: email.trim(),
      });
      setSaid(message);
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const backToSignIn = (
    <Link component={RouterLink} to="/" variant="body2" underline="hover">
      Back to sign in
    </Link>
  );

  if (said) {
    return (
      <AuthCard title="Check your email">
        <Notice kind="ok" sx={{ textAlign: 'left' }}>
          {said}
        </Notice>
        <Box sx={{ mt: 3 }}>{backToSignIn}</Box>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Forgotten your password?"
      subtitle="Enter the email address on your account and we will send a link to choose a new one."
      onSubmit={submit}
      footer="No email on your account? Ask an administrator to set a new password for you."
    >
      <Stack spacing={2.5} sx={{ textAlign: 'left' }}>
        <TextField
          label="Email address"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          size="medium"
          autoFocus
          required
        />
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={busy || !email.trim()}
          sx={{ py: 1.4 }}
        >
          {busy ? 'Sending…' : 'Send reset link'}
        </Button>
        <Box sx={{ textAlign: 'center' }}>{backToSignIn}</Box>
      </Stack>
    </AuthCard>
  );
}
