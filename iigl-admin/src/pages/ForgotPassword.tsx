import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Link, Stack, TextField, Typography } from '@mui/material';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { hint, Notice } from '../components/ui';
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
/**
 * How long before the link can be asked for again.
 *
 * Long enough for mail to arrive — a reset that has not landed after a minute
 * is usually in a spam folder rather than still in flight — and short enough
 * that somebody who genuinely got nothing is not stuck. The server allows five
 * an hour, so this is a courtesy in front of that limit rather than the limit
 * itself: pressing Resend the moment it unlocks, five times over, still ends in
 * the server's refusal, which says so.
 */
const RESEND_AFTER_S = 60;

/** Seconds as `0:45`. */
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function ForgotPassword() {
  const toast = useToast();
  // A mobile number or an email address. People sign in with the number, so
  // that is what they are sure of at the one moment they are locked out.
  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [left, setLeft] = useState(0);

  // One second at a time while there is time left, and nothing running once
  // there is not — an interval left ticking on a settled page is the usual way
  // this leaks.
  useEffect(() => {
    if (left <= 0) return;
    const t = setInterval(() => setLeft((n) => n - 1), 1000);
    return () => clearInterval(t);
  }, [left]);

  const send = async () => {
    setBusy(true);
    try {
      const { message } = await api.post<{ message: string }>('/auth/forgot-password', {
        identifier: identifier.trim(),
      });
      setSaid(message);
      // Started only once one has actually gone out. Counting from the attempt
      // would lock the button for a minute over a refusal.
      setLeft(RESEND_AFTER_S);
    } catch (err) {
      toast.error(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void send();
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

        <Stack spacing={1.5} sx={{ mt: 3, alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            Nothing in your inbox? Look in spam before asking for another.
          </Typography>
          <Button
            variant="outlined"
            size="small"
            // Disabled rather than hidden, so the wait is visible and the
            // button does not appear out of nowhere once it ends.
            disabled={busy || left > 0}
            onClick={() => void send()}
          >
            {busy ? 'Sending…' : left > 0 ? `Resend in ${clock(left)}` : 'Resend the link'}
          </Button>
          <Box sx={{ pt: 1 }}>{backToSignIn}</Box>
        </Stack>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Forgotten your password?"
      subtitle="Enter your mobile number or the email on your account, and we will send a link to choose a new one."
      onSubmit={submit}
      footer="No email on your account? Ask an administrator to set a new password for you."
    >
      <Stack spacing={2.5} sx={{ textAlign: 'left' }}>
        <TextField
          label="Mobile number or email"
          name="identifier"
          // Not `type="email"`: the browser would refuse a mobile number as
          // malformed before it ever reached the server.
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          autoComplete="username"
          size="medium"
          autoFocus
          required
          slotProps={hint('The link goes to the email address on the account.')}
        />
        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={busy || !identifier.trim()}
          sx={{ py: 1.4 }}
        >
          {busy ? 'Sending…' : 'Send reset link'}
        </Button>
        <Box sx={{ textAlign: 'center' }}>{backToSignIn}</Box>
      </Stack>
    </AuthCard>
  );
}
