import { useRef, useState } from 'react';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import UploadIcon from '@mui/icons-material/UploadFileOutlined';
import ClearIcon from '@mui/icons-material/CloseOutlined';
import { apiUrl } from '../lib/config';
import { messageOf } from '../lib/auth';
import { toneColour } from './ui';

type Bucket =
  | 'report' | 'order' | 'signature' | 'employee'
  | 'banner' | 'icon' | 'website' | 'documentation' | 'screenshot';

/**
 * Uploads a file and hands back the stored path.
 *
 * Uploading and attaching are separate on the API, so this holds only the path
 * — the form it sits in decides when to save. That means an abandoned form
 * leaves a file on disk and no record, which is the right way round: an
 * orphaned file costs disk, a half-written record costs a reissue.
 */
export default function FileField({
  label,
  bucket,
  value,
  onChange,
  accept = 'image/*',
  helperText,
}: {
  label: string;
  bucket: Bucket;
  value: string | null;
  onChange: (path: string | null) => void;
  accept?: string;
  helperText?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('files', file);

      const res = await fetch(apiUrl(`/uploads/${bucket}`), {
        method: 'POST',
        credentials: 'include',
        body: form,
      });

      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? `Upload failed (${res.status})`);

      onChange(body.data[0].path);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
      // Cleared so choosing the same file twice still fires a change.
      if (input.current) input.current.value = '';
    }
  };

  return (
    <Box>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>

      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={busy ? <CircularProgress size={14} /> : <UploadIcon />}
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          {busy ? 'Uploading…' : value ? 'Replace' : 'Choose file'}
        </Button>

        {value && (
          <Button size="small" color="inherit" startIcon={<ClearIcon />} onClick={() => onChange(null)}>
            Remove
          </Button>
        )}

        <input
          ref={input}
          type="file"
          accept={accept}
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void send(file);
          }}
        />
      </Stack>

      {value && (
        <Typography
          variant="caption"
          color="text.secondary"
          className="mono"
          sx={{ display: 'block', mt: 0.5, wordBreak: 'break-all' }}
        >
          {value}
        </Typography>
      )}

      {error && (
        <Typography
          variant="caption"
          sx={{ display: 'block', mt: 0.5, color: `${toneColour('refused')}.main` }}
        >
          {error}
        </Typography>
      )}

      {helperText && !error && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
          {helperText}
        </Typography>
      )}
    </Box>
  );
}
