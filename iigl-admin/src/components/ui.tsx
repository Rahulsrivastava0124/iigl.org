import type { ComponentType, ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';
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
  IconButton,
  Paper,
  Stack,
  TableContainer,
  Tooltip,
  Typography,
} from '@mui/material';
import type { SvgIconProps } from '@mui/material';
import type { PageMeta } from '../lib/api';

/**
 * A message about a state, coloured by what the state is.
 *
 * `kind` is kept because every screen already writes it; both spellings resolve
 * to the same four tones, so there is still one decision behind the colour.
 */
/**
 * State to colour, in one place.
 *
 * Three chips used to decide their own colours, which was fine at three and
 * would have become a fourth mapping at the fourth status column. Settled,
 * unfinished, refused, plain — every state in the panel is one of those four,
 * whatever the column is called.
 */
export type Tone = 'settled' | 'waiting' | 'refused' | 'plain';

const TONE_COLOUR = {
  settled: 'success',
  waiting: 'warning',
  refused: 'error',
  plain: 'default',
} as const satisfies Record<Tone, 'success' | 'warning' | 'error' | 'default'>;

/** The same four tones, as Material UI names them on an Alert. */
const TONE_SEVERITY: Record<Tone, 'success' | 'warning' | 'error' | 'info'> = {
  settled: 'success',
  waiting: 'warning',
  refused: 'error',
  plain: 'info',
};

/** For the rare control that needs the colour rather than a component. */
export const toneColour = (tone: Tone) => TONE_COLOUR[tone];

/** attendance: a day is either closed or still open. */
export function attendanceState(closed: boolean): { tone: Tone; label: string } {
  return closed ? { tone: 'settled', label: 'Closed' } : { tone: 'waiting', label: 'Open' };
}

/** How many certificates on an order item are still to be written. */
export function remainingState(left: number): { tone: Tone; label: string } {
  return left > 0
    ? { tone: 'waiting', label: String(left) }
    : { tone: 'settled', label: 'none' };
}

/** One chip. Every status column in the panel renders through this. */
export function StateChip({ tone, label }: { tone: Tone; label: string }) {
  return <Chip size="small" variant="outlined" color={TONE_COLOUR[tone]} label={label} />;
}

/** transactions.status: 0 pending, 1 approved, 2 declined. */
export function transactionState(status: number): { tone: Tone; label: string } {
  if (status === 1) return { tone: 'settled', label: 'Approved' };
  if (status === 2) return { tone: 'refused', label: 'Declined' };
  return { tone: 'waiting', label: 'Pending' };
}

/** orders.status, a free-text column: only two values are in use. */
export function orderState(status: string): { tone: Tone; label: string } {
  if (status === 'delivered') return { tone: 'settled', label: 'Delivered' };
  if (status === 'preparing') return { tone: 'waiting', label: 'In progress' };
  return { tone: 'plain', label: status || 'unknown' };
}

export function flagState(on: boolean | number): { tone: Tone; label: string } {
  return on ? { tone: 'settled', label: 'Yes' } : { tone: 'plain', label: 'No' };
}

export function Notice({
  kind = 'plain',
  tone,
  children,
  sx,
}: {
  kind?: 'error' | 'ok' | 'warn' | 'info' | 'plain';
  tone?: Tone;
  children: ReactNode;
  sx?: object;
}) {
  const resolved: Tone =
    tone ??
    (kind === 'error'
      ? 'refused'
      : kind === 'ok'
        ? 'settled'
        : kind === 'warn'
          ? 'waiting'
          : 'plain');

  return (
    <Alert severity={TONE_SEVERITY[resolved]} sx={{ mb: 2, ...sx }}>
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

/**
 * A figure on a card. One implementation: the dashboard and the order totals
 * were drifting apart on padding and type size.
 */
export function Tile({
  label,
  value,
  note,
  accent,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  /** Draws the figure in the brand navy, for the one that matters most. */
  accent?: boolean;
  /** Draws the figure in the colour of the state it reports. */
  tone?: Tone;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Typography
        className="tabular"
        sx={{
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: '-0.02em',
          color: tone && tone !== 'plain'
            ? `${TONE_COLOUR[tone]}.main`
            : accent
              ? 'primary.main'
              : 'text.primary',
        }}
      >
        {value}
        {note && (
          <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.75 }}>
            {note}
          </Typography>
        )}
      </Typography>
    </Paper>
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

export function StatusChip({ status }: { status: number }) {
  return <StateChip {...transactionState(status)} />;
}

export function OrderChip({ status }: { status: string }) {
  return <StateChip {...orderState(status)} />;
}

export function YesNo({ on }: { on: boolean | number }) {
  return <StateChip {...flagState(on)} />;
}

/**
 * Row actions.
 *
 * A table row's controls are icons, not words: at seven rows the words repeat
 * seven times and the eye reads the same three labels over and over, while the
 * data they belong to gets the narrower column. The label does not disappear —
 * it is the tooltip and the accessible name, so the control still announces
 * itself to a screen reader and to anyone who hovers.
 *
 * Page-level actions stay as labelled buttons. "Add band" is a sentence about
 * what the page does; "Edit" beside a row is a verb the row already implies.
 */
export function RowActions({ children }: { children: ReactNode }) {
  return (
    <Stack direction="row" spacing={0.25} sx={{ justifyContent: 'flex-end' }}>
      {children}
    </Stack>
  );
}

export function IconAction({
  label,
  icon: Icon,
  onClick,
  to,
  disabled,
  danger,
}: {
  /** What the control does. Becomes the tooltip and the accessible name. */
  label: string;
  icon: ComponentType<SvgIconProps>;
  onClick?: () => void;
  /** For an action that is really a link, so it opens in a new tab too. */
  to?: string;
  disabled?: boolean;
  /** Removes, retires or refuses something. Takes the refused tone. */
  danger?: boolean;
}) {
  const button = (
    <IconButton
      size="small"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      {...(to ? { component: RouterLink, to } : {})}
      sx={{
        color: danger ? `${TONE_COLOUR.refused}.main` : 'primary.main',
        '&:hover': {
          bgcolor: danger ? 'error.main' : 'primary.main',
          color: 'common.white',
        },
      }}
    >
      <Icon fontSize="small" />
    </IconButton>
  );

  // A disabled button fires no events, so the tooltip needs a wrapper to hang
  // on to — otherwise the one control a person is unsure about is the one that
  // cannot explain itself.
  return (
    <Tooltip title={label}>
      {disabled ? <span style={{ display: 'inline-flex' }}>{button}</span> : button}
    </Tooltip>
  );
}

/**
 * A row action that keeps its words.
 *
 * Most row controls are icons — see `IconAction`. A decision that commits money
 * or closes a record is not most controls: approving a transaction is worth the
 * two words and the colour of the state it produces, so nobody clicks it while
 * meaning to click the one beside it.
 *
 * The colour comes from the tone the action results in, which is the same tone
 * the status chip on that row will carry afterwards: approve is `settled`,
 * decline is `refused`.
 */
export function ToneAction({
  label,
  icon: Icon,
  tone,
  onClick,
  disabled,
}: {
  label: string;
  icon: ComponentType<SvgIconProps>;
  tone: Tone;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      size="small"
      variant="outlined"
      color={TONE_COLOUR[tone]}
      startIcon={<Icon fontSize="small" />}
      disabled={disabled}
      onClick={onClick}
      sx={{ whiteSpace: 'nowrap' }}
    >
      {label}
    </Button>
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
