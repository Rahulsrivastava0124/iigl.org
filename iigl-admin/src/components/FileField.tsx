import { useCallback, useEffect, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { Box, CircularProgress, LinearProgress, Stack, Tooltip, Typography } from '@mui/material';
import UploadIcon from '@mui/icons-material/CloudUploadOutlined';
import ClearIcon from '@mui/icons-material/CloseOutlined';
import PdfIcon from '@mui/icons-material/PictureAsPdfOutlined';
import MissingIcon from '@mui/icons-material/BrokenImageOutlined';
import HintIcon from '@mui/icons-material/InfoOutlined';
import { fileUrl } from '../lib/config';
import FilePreview, { isPdf } from './FilePreview';
import { messageOf } from '../lib/auth';
import { uploadFiles } from '../lib/upload';
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
  fill,
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
  /**
   * Let the frame fill the width it is given instead of being capped at its
   * natural size. For a caller that has already sized the column — a row of
   * attachments in a grid — where the cap would leave a gap beside every
   * frame.
   */
  fill?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  /*
    How far the upload has got, or null while that is unknown.

    A round trip to object storage is the better part of a second before any
    bytes move, and on a large photograph the wait is several. An indeterminate
    spinner for that long reads as a hang, and somebody clicks again.
  */
  const [percent, setPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  /*
    The frame keeps its shape and stays inside its column.

    `FRAME_HEIGHT` is the height it would like and the width follows from the
    ratio — but a wide shape, a 3:1 signature, wants 600px, which is far more
    than a form column has. So the width is capped at the cell and
    `aspectRatio` takes over: the frame shrinks and its height comes down with
    it, instead of overflowing into the field beside it.
  */
  const [rw, rh] = (ratio ?? '').split('/').map((n) => Number(n.trim()));
  const shaped = Boolean(ratio) && rw > 0 && rh > 0;
  const frame = {
    width: '100%',
    maxWidth: fill ? '100%' : Math.round(FRAME_HEIGHT * (rw / rh)),
    aspectRatio: shaped ? `${rw} / ${rh}` : undefined,
  };

  const send = useCallback(
    async (file: File) => {
      setBusy(true);
      setPercent(0);
      setError(null);
      try {
        const [stored] = await uploadFiles(bucket, [file], setPercent);
        onChange(stored.path);
      } catch (e) {
        setError(messageOf(e));
      } finally {
        setPercent(null);
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
    ? percent === null || percent >= 100
      ? 'Uploading…'
      : `Uploading… ${percent}%`
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

  /*
    A file whose bytes are gone.

    Every image path in the database was written by the Laravel application and
    some of those files no longer exist, so `<img>` fails and leaves an empty
    box that reads as "nothing attached" — when in fact something is attached
    and cannot be shown. Caught here so the field can say which it is.
  */
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [value]);

  return (
    <Box>
      {/*
        The label, with its note as the mark beside it.

        A field with no box to put the mark in still gets one: it goes next to
        the label, so a note here reads the same way as a note on a text field
        instead of adding a line under the frame.
      */}
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
        <Typography variant="overline" color="text.secondary">
          {label}
        </Typography>
        {helperText && !error && (
          <Tooltip title={helperText} enterTouchDelay={0}>
            <HintIcon
              tabIndex={0}
              aria-label={helperText}
              sx={{
                fontSize: 15,
                color: 'text.disabled',
                cursor: 'help',
                outline: 'none',
                '&:hover, &:focus-visible': { color: 'primary.main' },
              }}
            />
          </Tooltip>
        )}
      </Stack>

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
          {image && !broken && !busy && (
            <Box
              component="img"
              src={image}
              alt=""
              onError={() => setBroken(true)}
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

          {/*
            A PDF shows its first page, the way a photograph shows itself. The
            browser has a viewer of its own and needs no library to do it; the
            chrome is turned off so the frame holds a page rather than a
            scrollbar and a toolbar.

            It does not take the pointer: the click belongs to the frame, which
            is how a file is replaced, and the transparent target over it opens
            the full preview exactly as clicking a photograph does. The icon
            stays behind it as the fallback for a browser that will not render
            one inline.
          */}
          {value && !busy && isPdf(value) && (
            <>
              <Stack spacing={0.5} sx={{ alignItems: 'center', px: 2, textAlign: 'center' }}>
                <PdfIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
                <Typography variant="caption" color="text.secondary">
                  PDF attached
                </Typography>
              </Stack>
              <Box
                component="iframe"
                src={`${fileUrl(value)}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                title="PDF preview"
                sx={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  border: 0,
                  pointerEvents: 'none',
                  bgcolor: 'common.white',
                }}
              />
              <Box
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  setPreviewing(true);
                }}
                sx={{ position: 'absolute', inset: 0, cursor: 'zoom-in' }}
              />
            </>
          )}

          {value && !busy && broken && !isPdf(value) && (
            <Stack spacing={0.5} sx={{ alignItems: 'center', px: 2, textAlign: 'center' }}>
              <MissingIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
              <Typography variant="caption" color="text.secondary">
                File missing
              </Typography>
            </Stack>
          )}

          {/*
            The figure while there is one, the spinner while there is not:
            some proxies do not report a body length, and a bar that invents a
            number is worse than none.
          */}
          {busy &&
            (percent === null ? (
              <CircularProgress size={24} />
            ) : (
              <Stack spacing={0.75} sx={{ alignItems: 'center', width: '72%' }}>
                <CircularProgress size={24} variant="determinate" value={percent} />
                <Typography sx={{ fontSize: 11.5 }} color="text.secondary">
                  {percent}%
                </Typography>
              </Stack>
            ))}

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

          {/*
            Only over a picture. The strip is dark so white text reads on a
            photograph; with nothing behind it — a PDF, or a file whose bytes
            are gone — it is a grey slab across an empty frame, and the icon in
            the middle has already said what the field holds.
          */}
          {image && !broken && !busy && (
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
                {image && !broken ? (
                  <Box
                    component="img"
                    src={image}
                    alt=""
                    onError={() => setBroken(true)}
                    onClick={() => setPreviewing(true)}
                    sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  />
                ) : isPdf(value ?? '') ? (
                  <PdfIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                ) : (
                  // Not an empty square: something is attached and cannot be
                  // shown, which is a different thing from nothing attached.
                  <MissingIcon fontSize="small" sx={{ color: 'text.disabled' }} />
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
