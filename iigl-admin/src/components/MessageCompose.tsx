import { useState } from 'react';
import { Grid, MenuItem, TextField, Typography } from '@mui/material';
import { api } from '../lib/api';
import { messageOf } from '../lib/auth';
import { useFetch } from '../lib/useFetch';
import { DateField, Dialog } from './ui';
import { useToast } from './Toast';

/**
 * Writing to your employer.
 *
 * No recipient field: staff have exactly one employer, and a box for it would
 * be a box to get wrong. The dialog says who it is going to instead, which is
 * the only thing anybody would have wanted to check.
 *
 * A request expects something to happen — a correction, a day off. A message
 * does not. The difference is what the reader's list is sorted and coloured by,
 * so it is asked rather than guessed from the words.
 */
export default function MessageCompose({ onClose, onSent }: { onClose: () => void; onSent?: () => void }) {
  const toast = useToast();
  const employer = useFetch<{ data: { id: number; fullname: string } | null }>('/messages/employer');
  const to = employer.data?.data;

  const [kind, setKind] = useState<'request' | 'message'>('request');
  const [body, setBody] = useState('');
  const [about, setAbout] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      await api.post('/messages', {
        kind,
        body: body.trim(),
        about_date: about || null,
      });
      toast.ok('Sent.');
      onSent?.();
      onClose();
    } catch (e) {
      toast.error(messageOf(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={to ? `Write to ${to.fullname}` : 'Write to your employer'}
      onClose={onClose}
      onSubmit={send}
      submitLabel="Send"
      busy={busy}
      disabled={body.trim() === '' || !to}
    >
      {!employer.loading && !to ? (
        <Typography variant="body2" color="text.secondary">
          Nobody employs this account, so there is nobody to write to.
        </Typography>
      ) : (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              select
              label="Kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as 'request' | 'message')}
            >
              <MenuItem value="request">Request — something to be done</MenuItem>
              <MenuItem value="message">Message — just to tell them</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            {/* The day it is about, when it is about one — a missed punch-out,
                a day off. It lets the reader open that day rather than hunt. */}
            <DateField label="About which day" value={about} onChange={setAbout} />
          </Grid>
          <Grid size={12}>
            <TextField
              label="What you want to say"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              multiline
              minRows={4}
              placeholder="I forgot to punch out on Tuesday — I left at 18:30."
              slotProps={{ htmlInput: { maxLength: 2000 } }}
            />
          </Grid>
        </Grid>
      )}
    </Dialog>
  );
}
