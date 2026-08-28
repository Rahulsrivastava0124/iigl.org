import type { ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog as MuiDialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  TableContainer,
  Typography,
} from '@mui/material';
import type { PageMeta } from '../lib/api';

export function Notice({ kind, children }: { kind: 'error' | 'ok'; children: ReactNode }) {
  return (
    <Alert severity={kind === 'error' ? 'error' : 'success'} sx={{ mb: 2 }}>
      {children}
    </Alert>
  );
}

export function PageHead({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Stack
      direction="row"
     
     
     
      spacing={2}
      sx={{ alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', mb: 2.5 }}
    >
      <Box>
        <Typography variant="h1">{title}</Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {action}
    </Stack>
  );
}

export function Panel({
  title,
  actions,
  children,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      {(title || actions) && (
        <Stack
          direction="row"
         
         
         
          spacing={1.5}
          sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', px: 2, py: 1.25, borderBottom: 1, borderColor: 'divider' }}
        >
          {title ? <Typography variant="h2">{title}</Typography> : <span />}
          {actions && (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              {actions}
            </Stack>
          )}
        </Stack>
      )}
      {children}
    </Paper>
  );
}

/** Loading, error and empty states for a table, so no screen reinvents them. */
export function TableFrame({
  loading,
  error,
  empty,
  children,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  children: ReactNode;
}) {
  if (loading) {
    return (
      <Box sx={{ py: 5, display: 'grid', placeItems: 'center' }}>
        <CircularProgress size={26} />
      </Box>
    );
  }
  if (error) {
    return (
      <Typography sx={{ py: 5, textAlign: 'center' }} color="error" variant="body2">
        {error}
      </Typography>
    );
  }
  if (empty) {
    return (
      <Typography sx={{ py: 5, textAlign: 'center' }} color="text.secondary" variant="body2">
        Nothing here yet.
      </Typography>
    );
  }
  return <TableContainer>{children}</TableContainer>;
}

export function Pager({ meta, onPage }: { meta: PageMeta | undefined; onPage: (page: number) => void }) {
  if (!meta || meta.total_pages <= 1) return null;
  return (
    <Stack
      direction="row"
     
      spacing={1.5}
      sx={{ alignItems: 'center', px: 2, py: 1.25, borderTop: 1, borderColor: 'divider' }}
    >
      <Typography variant="body2" color="text.secondary" className="tabular">
        {meta.total.toLocaleString()} rows · page {meta.page} of {meta.total_pages}
      </Typography>
      <Box sx={{ flex: 1 }} />
      <Button size="small" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
        Previous
      </Button>
      <Button
        size="small"
        disabled={meta.page >= meta.total_pages}
        onClick={() => onPage(meta.page + 1)}
      >
        Next
      </Button>
    </Stack>
  );
}

/** transactions.status: 0 pending, 1 approved, 2 declined. */
export function StatusChip({ status }: { status: number }) {
  if (status === 1) return <Chip size="small" color="success" variant="outlined" label="Approved" />;
  if (status === 2) return <Chip size="small" color="error" variant="outlined" label="Declined" />;
  return <Chip size="small" color="warning" variant="outlined" label="Pending" />;
}

export function OrderChip({ status }: { status: string }) {
  if (status === 'delivered')
    return <Chip size="small" color="success" variant="outlined" label="Delivered" />;
  if (status === 'preparing')
    return <Chip size="small" color="warning" variant="outlined" label="In progress" />;
  return <Chip size="small" variant="outlined" label={status || 'unknown'} />;
}

export function YesNo({ on }: { on: boolean | number }) {
  return on ? (
    <Chip size="small" color="success" variant="outlined" label="Yes" />
  ) : (
    <Chip size="small" variant="outlined" label="No" />
  );
}

export function Dialog({
  title,
  onClose,
  onSubmit,
  submitLabel = 'Save',
  busy,
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <MuiDialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontSize: '1rem', fontWeight: 600 }}>{title}</DialogTitle>
      <Box
        component="form"
        onSubmit={(e: React.FormEvent) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <DialogContent dividers>{children}</DialogContent>
        <DialogActions>
          <Button onClick={onClose} color="inherit">
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={busy}>
            {busy ? 'Saving…' : submitLabel}
          </Button>
        </DialogActions>
      </Box>
    </MuiDialog>
  );
}

export const money = (v: string | number | null | undefined) =>
  v == null || v === '' ? '—' : Number(v).toLocaleString('en-IN');
