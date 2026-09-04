import { useCallback, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { Box, CircularProgress, Grid, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/CloudUploadOutlined';
import PdfIcon from '@mui/icons-material/PictureAsPdfOutlined';
import FileIcon from '@mui/icons-material/DescriptionOutlined';
import MissingIcon from '@mui/icons-material/BrokenImageOutlined';
import ClearIcon from '@mui/icons-material/CloseOutlined';
import { fileUrl } from '../lib/config';
import { messageOf } from '../lib/auth';
import { uploadFiles } from '../lib/upload';
import { isPdf } from './FilePreview';
import { BRAND } from '../lib/theme';
import { FRAME_CELL, Notice, toneColour } from './ui';

/**
 * The documents a laboratory has sent in.
 *
 * `FileField` holds one path, which is right for a photograph and wrong for
 * paperwork: a franchise arrives with a rent agreement, a shop licence, a
 * cancelled cheque and a partnership deed, and a single field means keeping
 * the last one uploaded. This holds the set, each with a title somebody can
 * read six months later.
 *
 * Shown the way the photograph is: an upright frame with the document in it,
 * on the same grid as the other attachments. A row of filenames tells nobody
 * which scan is the licence — `38f96aa7-b7ef…` is a storage key, not a
 * document — whereas a picture of the page is recognised at a glance. PDFs,
 * which cannot be shown as a picture, keep their mark on the same frame.
 *
 * The list is stored as JSON on the account, so it travels with the record and
 * needs no join to read. Files are uploaded as they are dropped — the account
 * still saves separately, so abandoning the form leaves the file on disk and
 * no record of it, which is the cheaper way round.
 *
 * A title defaults to the file's own name. It is a starting point, not a
 * decision: "scan_0043.pdf" tells the next person nothing, and the field is
 * there to be typed over.
 */

export interface LabDocument {
  title: string;
  path: string;
  added_at?: string;
}

/** 8 MB — the ceiling `upload.service.ts` gives multer. */
const MAX_BYTES = 8 * 1024 * 1024;

/** At most 25 entries, which is what the API accepts. */
const MAX_DOCUMENTS = 25;

const nameOf = (file: string) => file.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();

/** The frame every attachment on this form uses: upright, 3:4. */
const frame = {
  position: 'relative' as const,
  width: '100%',
  aspectRatio: '3 / 4',
  border: 1,
  borderColor: 'divider',
  borderRadius: 1,
  overflow: 'hidden',
  bgcolor: 'action.hover',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

function Document({
  doc,
  onTitle,
  onRemove,
}: {
  doc: LabDocument;
  onTitle: (title: string) => void;
  onRemove: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const href = fileUrl(doc.path);
  const pdf = isPdf(doc.path);
  const open = () => href && window.open(href, '_blank');

  return (
    <Stack spacing={0.75}>
      <Box sx={frame}>
        {pdf || broken || !href ? (
          <Stack spacing={0.5} sx={{ alignItems: 'center', color: 'text.disabled', px: 1 }}>
            {pdf ? <PdfIcon sx={{ fontSize: 34 }} /> : broken ? <MissingIcon sx={{ fontSize: 34 }} /> : <FileIcon sx={{ fontSize: 34 }} />}
            <Typography sx={{ fontSize: 11, textAlign: 'center' }}>
              {pdf ? 'PDF' : broken ? 'File missing' : 'Document'}
            </Typography>
          </Stack>
        ) : (
          <Box
            component="img"
            src={href}
            alt={doc.title}
            onError={() => setBroken(true)}
            sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}

        {/* Opens the file itself. A frame somebody cannot open is a thumbnail
            they have to trust. */}
        {href && (
          <Box
            onClick={open}
            sx={{
              position: 'absolute',
              inset: 0,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'flex-end',
              '& > span': { opacity: 0 },
              '&:hover > span': { opacity: 1 },
            }}
          >
            <Box
              component="span"
              sx={{
                width: '100%',
                bgcolor: 'rgba(0,0,0,.62)',
                color: '#fff',
                fontSize: 11,
                textAlign: 'center',
                py: 0.5,
                transition: 'opacity .15s',
              }}
            >
              Click to open
            </Box>
          </Box>
        )}

        <Tooltip title="Remove">
          <IconButton
            size="small"
            onClick={onRemove}
            sx={{
              position: 'absolute',
              top: 4,
              right: 4,
              bgcolor: 'background.paper',
              color: `${toneColour('refused')}.main`,
              '&:hover': { bgcolor: 'background.paper' },
            }}
          >
            <ClearIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <TextField
        label="Title"
        value={doc.title}
        onChange={(e) => onTitle(e.target.value)}
        size="small"
        slotProps={{ htmlInput: { maxLength: 191 } }}
      />
    </Stack>
  );
}

export default function DocumentAssets({
  value,
  onChange,
}: {
  value: LabDocument[];
  onChange: (documents: LabDocument[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  /* How far the upload has got, or null when the browser cannot say. */
  const [percent, setPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (files: File[]) => {
      setBusy(true);
      setPercent(0);
      setError(null);
      try {
        // Several at once: paperwork arrives as a folder of scans, and four
        // round trips for four files is three more than the API needs.
        const stored = await uploadFiles('documentation', files, setPercent);

        const added: LabDocument[] = stored.map((f, i) => ({
          title: nameOf(files[i]?.name ?? '') || 'Untitled',
          path: f.path,
          added_at: new Date().toISOString(),
        }));
        onChange([...value, ...added].slice(0, MAX_DOCUMENTS));
      } catch (e) {
        setError(messageOf(e));
      } finally {
        setPercent(null);
        setBusy(false);
      }
    },
    [onChange, value],
  );

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      if (rejected.length) {
        const first = rejected[0].errors[0];
        setError(
          first?.code === 'file-too-large'
            ? 'That file is larger than 8 MB.'
            : (first?.message ?? 'That file was not accepted.'),
        );
        return;
      }
      const room = MAX_DOCUMENTS - value.length;
      if (room <= 0) {
        setError(`A laboratory can hold ${MAX_DOCUMENTS} documents.`);
        return;
      }
      if (accepted.length) void send(accepted.slice(0, room));
    },
    [send, value.length],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    maxSize: MAX_BYTES,
    disabled: busy,
  });

  return (
    <Stack spacing={1}>
      <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>
        Documents{value.length > 0 ? ` (${value.length})` : ''}
      </Typography>

      <Grid container spacing={2} sx={{ alignItems: 'flex-start' }}>
        {value.map((doc, i) => (
          <Grid size={FRAME_CELL} key={`${doc.path}-${i}`}>
            <Document
              doc={doc}
              onTitle={(title) => onChange(value.map((d, at) => (at === i ? { ...d, title } : d)))}
              onRemove={() => onChange(value.filter((_, at) => at !== i))}
            />
          </Grid>
        ))}

        {/* The place to add another, the same size and shape as the ones
            already there, so the row stays a row. */}
        <Grid size={FRAME_CELL}>
          <Box
            {...getRootProps()}
            sx={{
              ...frame,
              border: '1px dashed',
              borderColor: isDragActive ? 'primary.main' : 'divider',
              bgcolor: isDragActive ? BRAND.navyWash : 'transparent',
              cursor: busy ? 'default' : 'pointer',
              '&:hover': { borderColor: 'primary.main' },
            }}
          >
            <input {...getInputProps()} />
            <Stack spacing={0.75} sx={{ alignItems: 'center', px: 1.5 }}>
              {busy ? (
                <CircularProgress
                  size={22}
                  variant={percent === null ? 'indeterminate' : 'determinate'}
                  value={percent ?? undefined}
                />
              ) : (
                <AddIcon sx={{ fontSize: 30, color: 'text.disabled' }} />
              )}
              <Typography sx={{ fontSize: 11.5, textAlign: 'center' }} color="text.secondary">
                {busy
                  ? percent === null || percent >= 100
                    ? 'Uploading…'
                    : `Uploading… ${percent}%`
                  : 'Drop documents here, or click to choose'}
              </Typography>
            </Stack>
          </Box>
        </Grid>
      </Grid>

      {error && <Notice kind="error">{error}</Notice>}
    </Stack>
  );
}
