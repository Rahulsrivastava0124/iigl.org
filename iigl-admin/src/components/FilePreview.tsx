import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import OpenIcon from '@mui/icons-material/OpenInNewOutlined';
import { fileUrl } from '../lib/config';

/** A stored path ending in .pdf is the only non-image the buckets accept. */
export const isPdf = (stored: string | null | undefined) =>
  Boolean(stored && /\.pdf(\?|$)/i.test(stored.trim()));

/**
 * Shows an uploaded file at its own size.
 *
 * Files are read through `/api/files/…` rather than from the bucket's public
 * domain: the panel is already signed in there, the path stored on the record
 * is the same either way, and a file that predates R2 and still sits on the
 * legacy disk resolves through the same URL. Nothing here needs to know which
 * of the two holds the bytes.
 *
 * A PDF is not drawn inline. An <object> of a scanned document inside a dialog
 * is smaller and worse than the browser's own viewer, so that one opens in a
 * tab instead.
 */
export default function FilePreview({
  stored,
  title = 'Preview',
  ratio,
  onClose,
}: {
  stored: string;
  title?: string;
  /**
   * The shape the field's pictures are, as a CSS `aspect-ratio`. The image is
   * framed at that shape rather than stretched to it: a 3:4 photograph fills a
   * 3:4 frame exactly, and anything else is fitted whole inside it, so the
   * preview never lies about what was uploaded.
   */
  ratio?: string;
  onClose: () => void;
}) {
  const url = fileUrl(stored);
  const pdf = isPdf(stored);

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600 }}>{title}</DialogTitle>

      <DialogContent
        dividers
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: 'action.hover',
          minHeight: 240,
        }}
      >
        {!url ? (
          <Typography variant="body2" color="text.secondary">
            This record has no file.
          </Typography>
        ) : pdf ? (
          <Typography variant="body2" color="text.secondary">
            A PDF. Open it in a tab to read it.
          </Typography>
        ) : (
          <Box
            component="img"
            src={url}
            alt={title}
            sx={{
              display: 'block',
              maxWidth: '100%',
              maxHeight: '70vh',
              ...(ratio
                ? { height: '70vh', width: 'auto', aspectRatio: ratio, objectFit: 'contain' }
                : null),
            }}
          />
        )}
      </DialogContent>

      <DialogActions sx={{ justifyContent: 'space-between' }}>
        <Typography
          variant="caption"
          color="text.secondary"
          className="mono"
          sx={{ pl: 1, wordBreak: 'break-all' }}
        >
          {stored}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {url && (
            <Button
              size="small"
              startIcon={<OpenIcon />}
              href={url}
              target="_blank"
              rel="noreferrer"
              color="inherit"
            >
              Open in a tab
            </Button>
          )}
          <Button size="small" variant="contained" onClick={onClose}>
            Close
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
