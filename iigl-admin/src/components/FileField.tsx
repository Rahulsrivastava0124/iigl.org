import { useCallback, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { Box, CircularProgress, LinearProgress, Stack, Typography } from '@mui/material';
import UploadIcon from '@mui/icons-material/CloudUploadOutlined';
import ClearIcon from '@mui/icons-material/CloseOutlined';
import { apiUrl } from '../lib/config';
import { messageOf } from '../lib/auth';
import { BRAND } from '../lib/theme';
import { IconAction, toneColour } from './ui';

type Bucket =
  | 'report' | 'order' | 'signature' | 'employee'
  | 'banner' | 'icon' | 'website' | 'documentation' | 'screenshot';

/**
 * 8 MB — the same ceiling `upload.service.ts` gives multer. Checked here as
 * well so an oversized file fails instantly instead of after the upload.
 */
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Uploads a file and hands back the stored path.
 *
 * A drop zone rather than a file button, on react-dropzone: the files being
 * attached here are photographs and scans that somebody is already looking at
 * in a folder, and dragging one in is fewer steps than a file dialog. Clicking
 * still opens the dialog, and the input keeps its keyboard behaviour, so
 * nothing is lost for anyone who cannot drag.
 *
 * Uploading and attaching stay separate on the API, so this holds only the path
 * — the form it sits in decides when to save. An abandoned form therefore
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
  /** An `accept` string, as the file input takes it. */
  accept?: string;
  helperText?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (file: File) => {
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
      }
    },
    [bucket, onChange],
  );

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      // One field, one file: the form field holds a single path, and silently
      // taking the first of five dropped files would be a guess.
      if (rejected.length) {
        const first = rejected[0].errors[0];
        setError(
          first?.code === 'file-too-large'
            ? 'That file is larger than 8 MB.'
            : first?.code === 'file-invalid-type'
              ? 'That kind of file is not accepted here.'
              : (first?.message ?? 'That file was not accepted.'),
        );
        return;
      }
      if (accepted[0]) void send(accepted[0]);
    },
    [send],
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    multiple: false,
    maxSize: MAX_BYTES,
    accept: accept === 'image/*' ? { 'image/*': [] } : undefined,
    disabled: busy,
    // The zone itself is the button; a nested one would swallow the click.
    noClick: false,
    noKeyboard: false,
  });

  const border = isDragReject
    ? `${toneColour('refused')}.main`
    : isDragActive
      ? 'primary.main'
      : 'divider';

  return (
    <Box>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>

      <Box
        {...getRootProps()}
        sx={{
          mt: 0.5,
          px: 2,
          py: value ? 1.5 : 2.5,
          border: '1px dashed',
          borderColor: border,
          borderRadius: 1,
          bgcolor: isDragActive ? `${BRAND.navy}0a` : 'transparent',
          cursor: busy ? 'progress' : 'pointer',
          transition: 'border-color .15s, background-color .15s',
          '&:hover': { borderColor: busy ? border : 'primary.main' },
          outline: 'none',
          '&:focus-visible': { borderColor: 'primary.main', boxShadow: `0 0 0 3px ${BRAND.navy}22` },
        }}
      >
        <input {...getInputProps()} />

        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          {busy ? (
            <CircularProgress size={20} />
          ) : (
            <UploadIcon sx={{ color: isDragActive ? 'primary.main' : 'text.disabled' }} />
          )}

          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{ fontSize: 13.5 }}>
              {busy
                ? 'Uploading…'
                : isDragActive
                  ? isDragReject
                    ? 'Not that kind of file'
                    : 'Drop it here'
                  : value
                    ? 'Drop a replacement, or click to choose'
                    : 'Drop a file here, or click to choose'}
            </Typography>

            {value && !busy && (
              <Typography
                variant="caption"
                color="text.secondary"
                className="mono"
                sx={{ display: 'block', wordBreak: 'break-all' }}
              >
                {value}
              </Typography>
            )}
          </Box>

          {value && !busy && (
            // Stops the click reaching the zone, which would open the dialog
            // behind the removal the person just asked for.
            <Box onClick={(e) => e.stopPropagation()}>
              <IconAction
                label="Remove file"
                icon={ClearIcon}
                danger
                onClick={() => {
                  setError(null);
                  onChange(null);
                }}
              />
            </Box>
          )}
        </Stack>

        {busy && <LinearProgress sx={{ mt: 1.5, borderRadius: 1 }} />}
      </Box>

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
