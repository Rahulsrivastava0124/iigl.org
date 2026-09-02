import { useCallback, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { Box, CircularProgress, LinearProgress, Stack, Typography } from '@mui/material';
import UploadIcon from '@mui/icons-material/CloudUploadOutlined';
import ClearIcon from '@mui/icons-material/CloseOutlined';
import PdfIcon from '@mui/icons-material/PictureAsPdfOutlined';
import { apiUrl, fileUrl } from '../lib/config';
import FilePreview, { isPdf } from './FilePreview';
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

/** How tall a shaped drop zone is. The width follows from the ratio. */
const FRAME_HEIGHT = 200;

/**
 * Uploads a file and hands back the stored path.
 *
 * A drop zone rather than a file button, on react-dropzone: the files being
 * attached here are photographs and scans that somebody is already looking at
 * in a folder, and dragging one in is fewer steps than a file dialog. Clicking
 * still opens the dialog, and the input keeps its keyboard behaviour, so
 * nothing is lost for anyone who cannot drag.
 *
 * Two shapes, chosen by whether the field knows what shape its pictures are.
 * A `ratio` makes the zone a frame of that shape and the picture fills it, so
 * a passport photograph is dropped into a slot the size and shape of a
 * passport photograph. Without one the zone is the wide row, which is right
 * for a field that might be handed a banner, an icon or a scan.
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
  ratio,
}: {
  label: string;
  bucket: Bucket;
  value: string | null;
  onChange: (path: string | null) => void;
  /** An `accept` string, as the file input takes it. */
  accept?: string;
  helperText?: string;
  /**
   * The shape the field's pictures are, as a CSS `aspect-ratio` — `'3 / 4'`
   * for a portrait photograph. The drop zone takes that shape, the picture
   * fills it, and the preview is framed to match.
   */
  ratio?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  // Sized in pixels rather than left to `aspect-ratio` with an automatic
  // width: the zone sits in a form column, where an automatic width is a
  // stretchable one and the frame stops being the shape it is meant to show.
  const [rw, rh] = (ratio ?? '').split('/').map((n) => Number(n.trim()));
  const shaped = Boolean(ratio) && rw > 0 && rh > 0;
  const frame = { width: Math.round(FRAME_HEIGHT * (rw / rh)), height: FRAME_HEIGHT };

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

  /** Shared between the two shapes: border, hover, focus ring, cursor. */
  const zone = {
    border: '1px dashed',
    borderColor: border,
    borderRadius: 1,
    bgcolor: isDragActive ? `${BRAND.navy}0a` : 'transparent',
    cursor: busy ? 'progress' : 'pointer',
    transition: 'border-color .15s, background-color .15s',
    '&:hover': { borderColor: busy ? border : 'primary.main' },
    outline: 'none',
    '&:focus-visible': { borderColor: 'primary.main', boxShadow: `0 0 0 3px ${BRAND.navy}22` },
  };

  const prompt = busy
    ? 'Uploading…'
    : isDragActive
      ? isDragReject
        ? 'Not that kind of file'
        : 'Drop it here'
      : value
        ? 'Drop a replacement, or click to choose'
        : 'Drop a file here, or click to choose';

  // Stops the click reaching the zone, which would open the file dialog behind
  // whatever the person actually asked for.
  const remove = (
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
  );

  const image = value && !isPdf(value) ? fileUrl(value) : null;

  return (
    <Box>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>

      {shaped ? (
        <Box
          {...getRootProps()}
          sx={{
            ...zone,
            mt: 0.5,
            ...frame,
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <input {...getInputProps()} />

          {/*
            The picture is the field. It fills the frame rather than sitting in
            it, which is the point of giving the frame the picture's own shape:
            what is on screen is what the record will show.
          */}
          {image && !busy && (
            <Box
              component="img"
              src={image}
              alt=""
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                setPreviewing(true);
              }}
              sx={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                cursor: 'zoom-in',
              }}
            />
          )}

          {value && isPdf(value) && !busy && (
            <PdfIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
          )}

          {busy && <CircularProgress size={24} />}

          {!value && !busy && (
            <Stack spacing={0.75} sx={{ alignItems: 'center', px: 2, textAlign: 'center' }}>
              <UploadIcon sx={{ color: isDragActive ? 'primary.main' : 'text.disabled' }} />
              <Typography sx={{ fontSize: 12.5 }}>{prompt}</Typography>
            </Stack>
          )}

          {/*
            Over the picture, not beside it: the frame is the size of the
            photograph, and a control outside it would make the field wider
            than the shape it is advertising.
          */}
          {value && !busy && (
            <Box
              sx={{
                position: 'absolute',
                top: 2,
                right: 2,
                borderRadius: '50%',
                bgcolor: 'background.paper',
                boxShadow: 1,
              }}
            >
              {remove}
            </Box>
          )}

          {value && !busy && (
            <Typography
              sx={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                px: 1,
                py: 0.5,
                fontSize: 11,
                textAlign: 'center',
                color: 'common.white',
                bgcolor: 'rgba(0,0,0,.45)',
              }}
            >
              {isDragActive ? prompt : 'Click to replace'}
            </Typography>
          )}

          {busy && <LinearProgress sx={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} />}
        </Box>
      ) : (
        <Box {...getRootProps()} sx={{ ...zone, mt: 0.5, px: 2, py: value ? 1.5 : 2.5 }}>
          <input {...getInputProps()} />

          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            {busy ? (
              <CircularProgress size={20} />
            ) : (
              <UploadIcon sx={{ color: isDragActive ? 'primary.main' : 'text.disabled' }} />
            )}

            {/*
              The thumbnail is the confirmation that the right file went up: the
              path alone is a UUID, which tells nobody whether they picked the
              stone or the invoice. `contain` because this shape of the field
              takes anything — cropping to the square would cut an end off a
              banner. Clicking opens the file at size.
            */}
            {value && !busy && (
              <Box
                onClick={(e) => e.stopPropagation()}
                sx={{
                  width: 44,
                  height: 44,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  bgcolor: 'action.hover',
                  overflow: 'hidden',
                  cursor: 'zoom-in',
                }}
              >
                {image ? (
                  <Box
                    component="img"
                    src={image}
                    alt=""
                    onClick={() => setPreviewing(true)}
                    sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <PdfIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                )}
              </Box>
            )}

            {/*
              No stored path under the prompt. It is a UUID under a directory
              nobody types or checks, it wrapped onto three lines in a form
              column, and the thumbnail beside it already answers the only
              question the path was answering — which file is attached.
            */}
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ fontSize: 13.5 }}>{prompt}</Typography>
            </Box>

            {value && !busy && remove}
          </Stack>

          {busy && <LinearProgress sx={{ mt: 1.5, borderRadius: 1 }} />}
        </Box>
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

      {previewing && value && (
        <FilePreview
          stored={value}
          title={label}
          ratio={ratio}
          onClose={() => setPreviewing(false)}
        />
      )}
    </Box>
  );
}
