import { Children, Fragment, isValidElement, useEffect, useState, createContext, useContext } from 'react';
import type { ComponentType, ReactElement, ReactNode } from 'react';
import { alpha } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { TimePicker } from '@mui/x-date-pickers/TimePicker';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

/** The format the API speaks, and the one every form's state holds. */
const ISO_DATE = 'YYYY-MM-DD';
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
  InputAdornment,
  Link,
  Menu as MuiMenu,
  MenuItem,
  Pagination,
  PaginationItem,
  Paper,
  Stack,
  TableContainer,
  Tooltip,
  Typography,
} from '@mui/material';
import type { SvgIconProps } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeftOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRightOutlined';
import TextField from '@mui/material/TextField';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import ClearIcon from '@mui/icons-material/CloseOutlined';
import MoreIcon from '@mui/icons-material/MoreVertOutlined';
import ShowIcon from '@mui/icons-material/VisibilityOutlined';
import HideIcon from '@mui/icons-material/VisibilityOffOutlined';
import HintIcon from '@mui/icons-material/InfoOutlined';
import type { TextFieldProps } from '@mui/material';
import type { PageMeta } from '../lib/api';
import { useAuth } from '../lib/auth';
import { isSuper } from '../lib/portal';
import { BRAND, BRAND_FILL, TONE } from '../lib/theme';
import type { ToneName } from '../lib/theme';

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
 * unfinished, refused, plain — every status in the panel is one of those four,
 * whatever the column is called, plus the two flag colours the Yes/No columns
 * carry over from the Laravel panel.
 */
export type Tone = ToneName;

const TONE_COLOUR = {
  settled: 'success',
  waiting: 'warning',
  refused: 'error',
  plain: 'default',
  // Material UI's warning is amber, which already means still open. A
  // holiday keeps its own yellow on the
  // calendar, where the tone is painted from TONE directly; anywhere a
  // Material component picks the colour it reads as the neutral it is.
  holiday: 'default',
  lead: 'warning',
  followup: 'default',
  yes: 'success',
  no: 'error',
} as const satisfies Record<Tone, 'success' | 'warning' | 'error' | 'default'>;

/** The same tones, as Material UI names them on an Alert. */
const TONE_SEVERITY: Record<Tone, 'success' | 'warning' | 'error' | 'info'> = {
  settled: 'success',
  waiting: 'warning',
  refused: 'error',
  plain: 'info',
  holiday: 'info',
  lead: 'warning',
  followup: 'info',
  yes: 'success',
  no: 'error',
};

/** For the rare control that needs the colour rather than a component. */
export const toneColour = (tone: Tone) => TONE_COLOUR[tone];

/**
 * Where somebody is today, for the Employee list.
 *
 * Three states and three colours, because the absence of a punch and a day off
 * are not the same news: green is they are here, solid red is they asked for
 * the day, and light red is absent — nobody has punched in. Light rather than
 * solid because at nine in the morning that means nothing yet and at four it
 * means something, and it should not read as loudly as a day asked off.
 *
 * Leave is only known where the request was written from the Leave template;
 * one typed from scratch is a request about a day and says nothing about which
 * kind, so it reads as grey rather than guessing.
 */
export function todayState(state: string | null | undefined): { tone: Tone; label: string; soft?: boolean } {
  if (state === 'present') return { tone: 'settled', label: 'Present' };
  if (state === 'leave') return { tone: 'refused', label: 'Leave' };
  return { tone: 'refused', label: 'Absent', soft: true };
}

/** How many certificates on an order item are still to be written. */
export function remainingState(left: number): { tone: Tone; label: string } {
  return left > 0
    ? { tone: 'waiting', label: String(left) }
    : { tone: 'settled', label: 'none' };
}

/**
 * One chip. Every status column in the panel renders through this.
 *
 * Filled rather than outlined: a status column is scanned down rather than
 * read across, and a solid badge holds its colour at a glance where a hairline
 * outline on white does not. The colours come from TONE — including `plain`,
 * which Material UI would otherwise render as its own undefined grey.
 *
 * `soft` paints the tone's light wash with its colour as the text, for a state
 * that should be seen without shouting.
 */
export function StateChip({ tone, label, soft = false }: { tone: Tone; label: string; soft?: boolean }) {
  const colour = TONE[tone];
  return (
    <Chip
      size="small"
      label={label}
      sx={{
        bgcolor: soft ? colour.soft : colour.main,
        color: soft ? colour.main : colour.on,
        fontWeight: 600,
        letterSpacing: '0.01em',
        borderRadius: 1,
      }}
    />
  );
}

/** transactions.status: 0 pending, 1 approved, 2 declined. */
export function transactionState(status: number): { tone: Tone; label: string } {
  if (status === 1) return { tone: 'settled', label: 'Approved' };
  if (status === 2) return { tone: 'refused', label: 'Declined' };
  return { tone: 'waiting', label: 'Pending' };
}

/** orders.status, a free-text column: only two values are in use. */
/**
 * An order's state, as the list shows it.
 *
 * `ready` is not a status the column holds — it is a preparing order whose
 * certificates are all written, which is a different thing to look at from one
 * still being worked on: nothing is left to do but hand it over and take the
 * money. The column keeps saying `preparing` until it is delivered, because
 * that is what it is; this is the reading, not the record.
 */
export function orderState(status: string, ready = false): { tone: Tone; label: string } {
  if (status === 'delivered') return { tone: 'settled', label: 'Delivered' };
  if (status === 'preparing') {
    return ready ? { tone: 'settled', label: 'Ready' } : { tone: 'waiting', label: 'In progress' };
  }
  return { tone: 'plain', label: status || 'unknown' };
}

export function flagState(on: boolean | number): { tone: Tone; label: string } {
  return on ? { tone: 'yes', label: 'Yes' } : { tone: 'no', label: 'No' };
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

/*
 * There is no PageHead.
 *
 * A screen used to open with its own title and description above the panel,
 * which said again what the breadcrumb in the top bar had already said, and
 * cost a block of height on every page to do it. The trail names the screen;
 * the panel header carries the filters and the one button that acts on the
 * whole list, and the record count sits under the table it counts.
 */

/**
 * A colour a tile can be filled with: the fill itself, and what is legible on
 * top of it. TONE's entries are already this shape.
 */
interface Fill {
  main: string;
  on: string;
  soft: string;
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
  fill,
  solid,
  icon: Icon,
  to,
}: {
  label: string;
  value: string;
  note?: string;
  /**
   * Where the figure came from. A tile that can be opened says so by lifting
   * on hover — a dashboard number is a summary, and the useful next question
   * is always which rows it is the sum of.
   */
  to?: string;
  /** Draws the figure in the brand navy, for the one that matters most. */
  accent?: boolean;
  /** Draws the figure in the colour of the state it reports. */
  tone?: Tone;
  /**
   * Tints the whole card instead of the figure. `brand` is the navy, used for
   * a figure that simply counts; a tone is used where the number itself is a
   * state — money owed, something waiting on a decision. Left unset the card
   * stays white, which is what the totals inside a page want.
   *
   * The tint is the pale end of the colour, not the full one: a dashboard is a
   * dozen of these at once, and a dozen saturated cards leaves nothing for the
   * figures themselves to stand out against. The colour carries on the number
   * and the icon, which is where the meaning is.
   */
  fill?: Tone | 'brand';
  /**
   * Fills the card with the whole colour rather than its pale end, sets the
   * label and figure to the colour that sits on it, and puts the icon in a
   * white disc.
   *
   * For a short group that has to be seen first — today's figures at the top
   * of the dashboard. It is deliberately not the default: a screen of solid
   * cards is a screen where nothing is emphasised.
   *
   * Has no effect without `fill`, which is what supplies the colour.
   */
  solid?: boolean;
  /** Says what the figure counts, so a group can be read without the labels. */
  icon?: ComponentType<SvgIconProps>;
}) {
  const tint: Fill | null = fill
    ? fill === 'brand'
      ? BRAND_FILL
      : TONE[fill]
    : null;
  const filled = Boolean(tint && solid);

  return (
    <Paper
      variant="outlined"
      {...(to ? { component: RouterLink, to } : {})}
      sx={{
        p: 2,
        height: '100%',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 1.5,
        ...(tint &&
          (filled
            ? { bgcolor: tint.main, borderColor: tint.main }
            : { bgcolor: tint.soft, borderColor: tint.soft })),
        ...(to && {
          textDecoration: 'none',
          transition: 'box-shadow 150ms, border-color 150ms',
          '&:hover': {
            borderColor: 'primary.main',
            boxShadow: '0 6px 18px rgba(6,25,72,0.10)',
          },
        }),
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="overline"
          sx={{
            display: 'block',
            // On a filled card the muted grey is unreadable; the tone's own
            // `on` colour at less than full strength keeps the label
            // subordinate to the figure without losing it.
            color: filled ? alpha(tint!.on, 0.75) : 'text.secondary',
          }}
        >
          {label}
        </Typography>
        <Typography
          className="tabular"
          sx={{
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            color: filled
              ? tint!.on
              : tint
                ? tint.main
                : tone && tone !== 'plain'
                ? `${TONE_COLOUR[tone]}.main`
                : accent
                  ? 'primary.main'
                  : 'text.primary',
          }}
        >
          {value}
          {note && (
            <Typography
              component="span"
              variant="body2"
              sx={{ ml: 0.75, color: filled ? alpha(tint!.on, 0.75) : 'text.secondary' }}
            >
              {note}
            </Typography>
          )}
        </Typography>
      </Box>
      {Icon && (
        filled ? (
          /*
            On a filled card the icon has no ground of its own — a white glyph
            on a saturated fill is the same weight as the figure beside it, and
            the two compete. The disc gives it one, and inverts the colours, so
            it reads as a mark on the card rather than as more text.
          */
          <Box
            sx={{
              width: 40,
              height: 40,
              flexShrink: 0,
              borderRadius: '50%',
              bgcolor: tint!.on,
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Icon aria-hidden sx={{ fontSize: 22, color: tint!.main }} />
          </Box>
        ) : (
          <Icon
            // Decoration, not information: the label already says what this is,
            // so the icon is hidden from a screen reader rather than read out.
            aria-hidden
            sx={{
              fontSize: 26,
              color: tint ? tint.main : 'primary.main',
              opacity: 0.65,
              flexShrink: 0,
            }}
          />
        )
      )}
    </Paper>
  );
}

/**
 * Set inside a Panel's `form` slot, so the FormPanel rendered there drops its
 * own card and sits in the list's panel between the header and the table.
 */
const InsidePanel = createContext(false);

export function Panel({
  title,
  subtitle,
  filters,
  count,
  footer,
  actions,
  form,
  children,
  sx,
}: {
  title?: string;
  /**
   * What this panel is about, beside the title — the account, the customer.
   * Not a row count: that is `count`, and it belongs under the table.
   */
  subtitle?: ReactNode;
  /**
   * How many records the table holds. It sits under the table, not beside the
   * title: it describes what you have just finished reading, and a table long
   * enough for the number to matter is one you are looking at the bottom of by
   * the time you want it.
   */
  count?: ReactNode;
  /**
   * The controls that choose what the table shows, on a row of their own under
   * the header. A wide set of them beside the title left no room for either:
   * the heading truncated to "Head…" and a control wrapped to a line of its
   * own. `actions` stays for what acts on the list — the one button that
   * downloads it, which belongs beside the title.
   */
  filters?: ReactNode;
  /**
   * The table's footer, beside the count — in practice a `Pager`. It belongs
   * on the same rule as the count rather than above it, which is two footers
   * stacked and reads as one of them having come loose.
   */
  footer?: ReactNode;
  actions?: ReactNode;
  /**
   * The create or edit form for this list — a `FormPanel`, or nothing while it
   * is closed. It opens under the header and over the table, so the title, the
   * filters and the New button stay at the top of the screen whether or not a
   * form is open, rather than being pushed below it.
   */
  form?: ReactNode;
  /**
   * Optional, for the panel that is only its header — a strip of state and the
   * controls that change it, with no table under it.
   */
  children?: ReactNode;
  /** Spacing around the panel. It carries none of its own. */
  sx?: object;
}) {
  return (
    <Paper variant="outlined" sx={{ overflow: 'hidden', ...sx }}>
      {(title || subtitle || actions) && (
        <Stack
          direction="row"
          spacing={1.5}
          // One row while both sides fit; the controls drop to a second row
          // when they do not. Held to one row, a wide set of filters squeezed
          // the heading to "Head…" — and a select squeezed to "St…" is not a
          // control any more, so neither side may be the one that gives way.
          sx={{
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            rowGap: 1,
            px: 2,
            py: 1.25,
            // The rule separates the header from what is under it. With
            // nothing under it there is nothing to separate, and the line
            // reads as a table that failed to load. A filters row under the
            // heading is part of the same header, so the rule moves to it.
            borderBottom: filters ? 0 : children ? 1 : 0,
            borderColor: 'divider',
          }}
        >
          {title || subtitle ? (
            <Stack
              direction="row"
              spacing={1.25}
              sx={{ alignItems: 'baseline', minWidth: 0, overflow: 'hidden' }}
            >
              {title && (
                <Typography variant="h2" sx={{ whiteSpace: 'nowrap' }}>
                  {title}
                </Typography>
              )}
              {subtitle && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {subtitle}
                </Typography>
              )}
            </Stack>
          ) : (
            <span />
          )}
          {actions && (
            <Stack
              direction="row"
              spacing={1}
              // The row gives way by wrapping, never by squeezing: a select
              // narrowed to "St…" is not a control any more. Each control
              // holds its width; what folds is the row.
              sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1, minWidth: 0 }}
            >
              {actions}
            </Stack>
          )}
        </Stack>
      )}
      {filters && (
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: 'center',
            flexWrap: 'wrap',
            rowGap: 1,
            px: 2,
            py: 1.25,
            borderBottom: children ? 1 : 0,
            borderColor: 'divider',
          }}
        >
          {filters}
        </Stack>
      )}
      <InsidePanel.Provider value>{form}</InsidePanel.Provider>
      {children}
      {(count || footer) && (
        <Stack
          direction="row"
          spacing={1.5}
          sx={{
            alignItems: 'center',
            // No pager (a short list): the count keeps the left edge rather
            // than drifting to the right on its own.
            justifyContent: footer ? 'space-between' : 'flex-start',
            px: 2,
            py: 1.25,
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          {/*
            Rows first, then what the list came to.

            The chooser is a control and belongs where controls are looked for,
            at the left edge under the table; the count is a statement about
            what is above it and reads perfectly well from the other end of the
            same rule.
          */}
          {footer}
          <Typography variant="body2" color="text.secondary" className="tabular">
            {count}
          </Typography>
        </Stack>
      )}
    </Paper>
  );
}

/**
 * A form that opens above the list it writes into, rather than over it.
 *
 * Shown on click, not permanently: a page whose list is pushed down by a form
 * nobody asked for is worse than a dialog. Once open it leaves the list
 * readable underneath, which is the reason to prefer it to one.
 *
 * Adding and editing are the same form — the only difference is what the two
 * buttons are called — so a screen holds one rather than an add form and an
 * edit form that drift apart.
 *
 * The props deliberately match `Dialog`, so a screen can move between the two
 * by changing the tag and nothing else.
 */
export function FormPanel({
  title,
  onClose,
  onSubmit,
  submitLabel = 'Save',
  busy,
  actions,
  children,
}: {
  title: string;
  /** Closes the form and empties it. The button says "Cancel". */
  onClose: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  busy?: boolean;
  /**
   * Anything this record can have done to it besides being saved — converting
   * an enquiry into a registration, undoing one. Kept at the far left of the
   * footer, away from Save and Cancel: it is a different kind of act, and a
   * row of three equal buttons invites the wrong one.
   */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const inside = useContext(InsidePanel);
  const body = (
        <Box
          component="form"
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            onSubmit();
          }}
          sx={{ p: 2 }}
        >
          {/*
            Fields lay out on a grid rather than in a row of fixed widths. A
            page-wide panel is far wider than any one field wants to be, so left
            to themselves they either stretch across the whole card or sit in a
            ragged line of hand-picked pixel widths that stops lining up the
            moment a field is added.

            Each direct child takes one cell. A field that needs the full width
            — anything multiline — asks for it with `gridColumn: '1 / -1'`.

            **The cell decides the width, not the field.** Every direct child is
            stretched to its column here rather than each one carrying a width
            of its own: a date that sized itself to `DD-MM-YYYY`, an
            Autocomplete that sized itself to its longest option and a text box
            that stretched all made the same row of three fields come out three
            different widths. One rule here beats a `sx` at every call site,
            and a field added tomorrow lines up without being told to.
          */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: '1fr',
                sm: 'repeat(2, minmax(0, 1fr))',
                lg: 'repeat(3, minmax(0, 1fr))',
              },
              gap: 2,
              alignItems: 'start',
              '& > *': { width: '100%' },
            }}
          >
            {children}
          </Box>
          <Stack
            direction="row"
            spacing={1}
            sx={{
              mt: 3,
              pt: 2,
              borderTop: 1,
              borderColor: 'divider',
              alignItems: 'center',
              justifyContent: actions ? 'space-between' : 'flex-end',
            }}
          >
            {actions}
            <Stack direction="row" spacing={1}>
              <Button type="button" color="inherit" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="contained" disabled={busy}>
                {busy ? 'Saving…' : submitLabel}
              </Button>
            </Stack>
          </Stack>
        </Box>
  );

  // In a list's panel: a titled band under its header, ruled off from the
  // table below, rather than a second card.
  if (inside) {
    return (
      <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'grey.50' }}>
        <Typography variant="h2" sx={{ px: 2, pt: 1.75, fontSize: 15 }}>
          {title}
        </Typography>
        {body}
      </Box>
    );
  }

  return (
    // Panel carries no margin of its own, and a list always follows this.
    <Box sx={{ mb: 2 }}>
      <Panel title={title}>{body}</Panel>
    </Box>
  );
}

/** Loading, error and empty states for a table, so no screen reinvents them. */
export function TableFrame({
  loading,
  error,
  empty,
  emptyText = 'Nothing here yet.',
  children,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyText?: string;
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
        {emptyText}
      </Typography>
    );
  }
  return <TableContainer>{children}</TableContainer>;
}

/**
 * How many rows a list asks for.
 *
 * 200 is the end of the list because it is the API's cap — readPage clamps
 * per_page there — so offering more would be offering something that silently
 * does not happen. 50 is the API's default, which is what every list here was
 * already getting.
 */
const PER_PAGE_CHOICES = [10, 50, 100, 200] as const;

/** The default every list starts at. The same number the API would have used. */
export const DEFAULT_PER_PAGE = 50;

/** The prev/next labels: a chevron and a word, as the reference draws them. */
const BackLabel = () => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, px: 0.25 }}>
    <ChevronLeftIcon fontSize="small" />
    Back
  </Box>
);
const NextLabel = () => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, px: 0.25 }}>
    Next
    <ChevronRightIcon fontSize="small" />
  </Box>
);

export function Pager({
  meta,
  onPage,
  onPerPage,
}: {
  meta: PageMeta | undefined;
  onPage: (page: number) => void;
  /**
   * Change how many rows are fetched. Optional: a list whose length is fixed by
   * what it is (a dialog showing one student's enrolments) has nothing to
   * choose, and giving it a chooser would suggest otherwise.
   *
   * A caller that supplies this must also put the page back to 1. Page 4 of 10
   * is nowhere at all once the rows per page becomes 200.
   */
  onPerPage?: (perPage: number) => void;
}) {
  // Nothing to show at all: one page, and no choice to make about it.
  if (!meta || (meta.total_pages <= 1 && !onPerPage)) return null;

  return (
    // Sits in the Panel's footer row, which supplies the padding and the rule.
    // Fills the row so the Rows selector keeps the left and the page controls
    // go to the right, beside the total the footer prints after it.
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flex: 1, minWidth: 0 }}>
      {onPerPage && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            Rows
          </Typography>
          {/*
            A select rather than a row of buttons: four numbers side by side
            read as pagination, which is the control immediately to their
            right, and the two would be mistaken for one another at a glance.
          */}
          <TextField
            select
            size="small"
            value={String(meta.per_page)}
            onChange={(e) => onPerPage(Number(e.target.value))}
            slotProps={{ htmlInput: { 'aria-label': 'Rows per page' } }}
            sx={{ width: 88, '& .MuiInputBase-input': { py: 0.75 } }}
          >
            {/*
              Whatever the list is actually on, even when it is not one of the
              four. A caller may fix its own size, and a select showing a value
              it does not hold is a control lying about the screen it is on.
            */}
            {[...new Set([...PER_PAGE_CHOICES, meta.per_page])]
              .sort((a, b) => a - b)
              .map((n) => (
                <MenuItem key={n} value={String(n)}>
                  {n}
                </MenuItem>
              ))}
          </TextField>
        </Stack>
      )}

      {/* Pushes the page controls to the right of the footer row. */}
      <Box sx={{ flex: 1 }} />

      {meta.total_pages > 1 && (
        <Pagination
          count={meta.total_pages}
          page={meta.page}
          onChange={(_, p) => onPage(p)}
          shape="rounded"
          color="primary"
          siblingCount={1}
          boundaryCount={1}
          sx={{
            flexShrink: 0,
            // Boxed pages the way the reference draws them: a border on each,
            // the current one filled in the brand navy.
            '& .MuiPaginationItem-root': {
              minWidth: 30,
              height: 30,
              border: '1px solid',
              borderColor: 'divider',
              m: '0 2px',
              fontWeight: 600,
            },
            '& .MuiPaginationItem-previousNext': { border: 0, fontWeight: 500 },
            '& .MuiPaginationItem-ellipsis': { border: 0, minWidth: 22 },
            '& .Mui-selected': {
              bgcolor: `${BRAND.navy} !important`,
              color: '#fff',
              borderColor: BRAND.navy,
            },
          }}
          renderItem={(item) => (
            <PaginationItem
              slots={{ previous: BackLabel, next: NextLabel }}
              {...item}
            />
          )}
        />
      )}
    </Stack>
  );
}

export function StatusChip({ status }: { status: number }) {
  return <StateChip {...transactionState(status)} />;
}

export function OrderChip({ status, ready }: { status: string; ready?: boolean }) {
  return <StateChip {...orderState(status, ready)} />;
}

export function YesNo({ on }: { on: boolean | number }) {
  return <StateChip {...flagState(on)} />;
}

/**
 * An order number, as a link to the order — except for head office.
 *
 * An order belongs to the laboratory that took it. Head office still sees the
 * lists, because the counts and the money on them are what the network is
 * measured by, but the number is text there rather than a way in: the order
 * itself is a counter's record, and role 1 has no counter.
 *
 * Written once here rather than four times at the call sites, because a rule
 * repeated is a rule that drifts — the certificate list and the wallet both
 * print an order number too, and a fix applied to one of the three is the kind
 * of thing nobody notices until somebody finds the way round.
 *
 * This is the panel's half. `GET /api/orders/:id` still answers head office, so
 * a typed URL still opens an order; closing that is a change to the API and to
 * `docs/ROLES.md:250`, which states the opposite as a deliberate rule.
 */
export function OrderRef({
  id,
  children,
}: {
  /** The order's id. Null when the row does not name one. */
  id: number | string | null | undefined;
  /** What to print — the order number, not the id. */
  children: ReactNode;
}) {
  const { user } = useAuth();

  if (id == null || isSuper(user)) return <>{children}</>;

  return (
    <Link component={RouterLink} to={`/orders/${id}`} underline="hover">
      {children}
    </Link>
  );
}

/**
 * Today, as `YYYY-MM-DD` — the format `DateField` and the API both speak.
 *
 * A function rather than a constant: a panel left open overnight would keep
 * offering yesterday, and the one form where that matters is the one somebody
 * fills in first thing in the morning.
 *
 * Local, not UTC. `toISOString` is a day behind for anybody west of Greenwich
 * for part of the day, and this is a date somebody is typing, not an instant.
 */
export const today = () => dayjs().format(ISO_DATE);

/**
 * A date field, with the Material UI calendar behind it.
 *
 * The panel stores and sends dates as `YYYY-MM-DD` strings — that is what the
 * API takes and what every form's state already holds — so this keeps that
 * contract and does the conversion itself. Swapping a `TextField type="date"`
 * for one of these is a change of tag, not of state.
 *
 * Shown as `DD-MM-YYYY`, which is how the Laravel panel printed dates and how
 * everybody here reads them; the value never changes format.
 *
 * An unparseable or cleared date yields `''` rather than a partial string: a
 * half-typed date reaching the API as a date is worse than one that never
 * leaves the field.
 */
export function DateField({
  label,
  value,
  onChange,
  required,
  disabled,
  minDate,
  maxDate,
  helperText,
  month = false,
  sx,
}: {
  label: string;
  /** `YYYY-MM-DD`, or empty — `YYYY-MM` when `month` is set. */
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  /** Both `YYYY-MM-DD`. */
  minDate?: string;
  maxDate?: string;
  helperText?: string;
  /**
   * A month rather than a day: the calendar opens on the twelve months with
   * the year above them, shows `Sep 2026`, and the value is `YYYY-MM`. The
   * short month because the box also carries the hint, clear and calendar
   * icons, and `September 2026` lost its year behind them.
   */
  month?: boolean;
  sx?: object;
}) {
  const valueFormat = month ? 'YYYY-MM' : ISO_DATE;
  const parsed = value ? dayjs(value, valueFormat, true) : null;

  return (
    <DatePicker
      label={label}
      format={month ? 'MMM YYYY' : 'DD-MM-YYYY'}
      views={month ? ['year', 'month'] : undefined}
      openTo={month ? 'month' : undefined}
      value={parsed?.isValid() ? parsed : null}
      onChange={(next) => onChange(next?.isValid() ? next.format(valueFormat) : '')}
      disabled={disabled}
      minDate={minDate ? dayjs(minDate, ISO_DATE, true) : undefined}
      maxDate={maxDate ? dayjs(maxDate, ISO_DATE, true) : undefined}
      slotProps={{
        textField: {
          required,
          /*
            The note is the mark, as it is on every other field. It sits at the
            head of the box rather than the tail: the tail already belongs to
            the calendar button, and two icons in one corner is a guess about
            which one opens the picker.
          */
          slotProps:
            helperText && helperText.trim() !== ''
              ? { input: { startAdornment: hintNode(helperText) } }
              : undefined,
          // Full width, like every other field: the form grid is what decides
          // how wide a column is, and a date that sized itself to its own ten
          // characters left a ragged gap in a row of three. A caller's `sx`
          // comes last and can still narrow one that genuinely needs it.
          sx,
          fullWidth: true,
          size: 'small',
        },
        // Nothing here is far from today; a picker that opens on the year is
        // two clicks from being useful.
        field: { clearable: !required },
      }}
    />
  );
}

/**
 * A time of day, with the Material UI clock behind it.
 *
 * The companion to `DateField`, and for the same reason: the browser's own
 * `type="time"` input draws its picker differently in every browser — in
 * Chrome it is three blue boxes hanging off the field — and matches nothing
 * else in the panel.
 *
 * Keeps the contract those inputs had, so swapping one is a change of tag:
 * the value is `HH:mm` on the 24-hour clock, or empty, exactly what the API
 * stores. It is shown on the 12-hour clock with AM and PM, which is how
 * everybody here reads a shift.
 */
export function TimeField({
  label,
  value,
  onChange,
  required,
  disabled,
  helperText,
  sx,
}: {
  label: string;
  /** `HH:mm`, or empty. */
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  helperText?: string;
  sx?: object;
}) {
  const parsed = value ? dayjs(value, 'HH:mm', true) : null;

  return (
    <TimePicker
      label={label}
      format="hh:mm A"
      ampm
      value={parsed?.isValid() ? parsed : null}
      onChange={(next) => onChange(next?.isValid() ? next.format('HH:mm') : '')}
      disabled={disabled}
      slotProps={{
        textField: {
          required,
          helperText,
          sx,
          fullWidth: true,
          size: 'small',
        },
        field: { clearable: !required },
      }}
    />
  );
}

/**
 * The search box that sits in a list's header.
 *
 * One component so that every list searches the same way and looks the same
 * doing it. Whether the term filters rows already loaded or is sent to the API
 * is the page's business — this only collects it.
 *
 * The clear button matters more than it looks: a list narrowed by a term left
 * in the box reads as an empty list, and the fastest way out of that has to be
 * visible.
 */
export function SearchField({
  placeholder = 'Search…',
  value,
  onChange,
  width = 240,
}: {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  width?: number;
}) {
  return (
    <TextField
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      sx={{ width }}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
          endAdornment: value ? (
            <InputAdornment position="end">
              <IconButton size="small" aria-label="Clear search" onClick={() => onChange('')}>
                <ClearIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : null,
        },
      }}
    />
  );
}

/**
 * A password box with a control to read what has been typed.
 *
 * Typing a password blind is where sign-in failures actually come from — a
 * held shift key, a keyboard on the wrong layout, a character dropped by a
 * phone keyboard — and the person cannot tell which. Showing it is their
 * choice and stays off until they make it.
 *
 * It reverts to hidden whenever the field is emptied, so a value revealed on
 * one account is not still on screen for the next.
 *
 * Every other TextField prop passes through, so a caller still sets its own
 * label, `autoComplete` and validation.
 */
export function PasswordField({ value, ...props }: TextFieldProps) {
  /*
    A static note becomes the mark in the box; an error stays underneath it.
    "Eight characters or more" is advice somebody reads once, and it cost a
    line of height on every form that gave it. "These do not match" is not
    advice — it has to be on screen without being asked for.
  */
  const [shown, setShown] = useState(false);
  const empty = !value;

  useEffect(() => {
    if (empty) setShown(false);
  }, [empty]);

  return (
    <TextField
      {...props}
      helperText={props.error ? props.helperText : undefined}
      value={value}
      type={shown ? 'text' : 'password'}
      slotProps={{
        ...props.slotProps,
        input: {
          ...(props.slotProps?.input as object),
          endAdornment: (
            <InputAdornment position="end">
              {/* The note, if there is one, then the toggle. */}
              {/* A blank string is a caller holding the line open, not a
                  note: it gets no mark. */}
              {typeof props.helperText === 'string' &&
              props.helperText.trim() !== '' &&
              !props.error
                ? hintNode(props.helperText)
                : null}
              <IconButton
                size="small"
                edge="end"
                onClick={() => setShown((s) => !s)}
                aria-label={shown ? 'Hide password' : 'Show password'}
                // Keeps the toggle out of the tab order between the field and
                // the submit button: tabbing off a password should sign you in,
                // not land on a control you did not ask for.
                tabIndex={-1}
              >
                {shown ? <HideIcon fontSize="small" /> : <ShowIcon fontSize="small" />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}

/**
 * How wide a figure card is, everywhere in the panel: a quarter of the row on a
 * wide screen, and a half on a tablet or a phone — two to a row rather than one
 * stacked full-width column, so the figures read as a grid on a small screen.
 *
 * One width rather than a width per screen. The dashboard set four to a row and
 * the pages built after it settled on three, so the same three figures — billed,
 * paid, outstanding — came out one size on an order and another on a laboratory,
 * and a person moving between them read two different layouts of the same thing.
 * A row of three quarter-width cards leaves a quarter empty, which is what the
 * dashboard's own rows do wherever a group is not a multiple of four.
 */
export const TILE_CELL = { xs: 6, sm: 6, md: 3 } as const;

/**
 * The columns an attachment frame sits in.
 *
 * Narrower than a form field, because that is what an upright frame is: at a
 * third of the page a 3:4 frame stands 150px wide in a 380px column and the
 * rest of the column is nothing. `WIDE_FRAME_CELL` is double, for a signature
 * strip — so a photograph, a signature and three proof copies fill one line
 * exactly, and the documents below them line up on the same grid.
 */
export const FRAME_CELL = { xs: 6, sm: 4, md: 2 } as const;
export const WIDE_FRAME_CELL = { xs: 12, sm: 8, md: 4 } as const;

/**
 * A note about a field, on the field.
 *
 * Helper text under an input costs a line of height on every field that has
 * one, and in a three-column form that line is charged to the whole row —
 * twelve fields carrying a note push the form a screen longer for advice most
 * people need once. So the note becomes a small mark inside the field and
 * appears when somebody asks for it.
 *
 * It is a tooltip, not a title attribute: it opens on focus as well as hover,
 * so it is reachable from the keyboard, and it is the field's description for
 * a screen reader rather than decoration.
 *
 * Spread into `slotProps`. On a `select` the mark sits left of the dropdown
 * arrow — the arrow is positioned against the right edge and would otherwise
 * be drawn on top of it.
 *
 *     <TextField label="Mobile" slotProps={hint('Ten digits.')} />
 *     <TextField select label="ID Proof" slotProps={hint('Ticked on the form.', true)} />
 */
export function hintNode(text: string, forSelect = false) {
  return (
    <InputAdornment position="end" sx={{ mr: forSelect ? 2.5 : 0 }}>
      <Tooltip title={text} enterTouchDelay={0}>
        <HintIcon
          tabIndex={0}
          aria-label={text}
          sx={{
            fontSize: 17,
            color: 'text.disabled',
            cursor: 'help',
            outline: 'none',
            '&:hover, &:focus-visible': { color: 'primary.main' },
          }}
        />
      </Tooltip>
    </InputAdornment>
  );
}

export function hint(text: string, forSelect = false) {
  return { input: { endAdornment: hintNode(text, forSelect) } };
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
/**
 * A row's controls.
 *
 * Anything destructive — and anything marked `overflow`, which is where undos
 * and reversals belong — is moved behind the ⋯ menu as soon as the row has two
 * or more controls. A delete sitting a few pixels from the thing you actually
 * meant to press is the panel's own foot-gun, and a line of four identical
 * glyphs says all four are equally the next step when none of them is.
 *
 * A row with a single control keeps it in the open whatever it is: there is
 * nothing to mistake it for, and hiding the only action behind a menu costs a
 * click for no protection.
 *
 * The split is done here rather than at each of the thirteen call sites, so a
 * screen cannot opt out of it by accident.
 */
/**
 * The actions in a row, with any fragments opened up.
 *
 * `Children.toArray` does not look inside a fragment, so a group written as
 * `{mayEdit && (<>...</>)}` arrived here as a single child with no props — and
 * every `danger` or `overflow` action inside it was drawn on the row instead of
 * in the menu, whatever it was marked. Delete sat a mis-click from Edit on the
 * staff list for exactly that reason.
 */
function actionsOf(children: ReactNode): ReactElement<IconActionProps>[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement(child)) return [];
    if (child.type === Fragment) {
      return actionsOf((child.props as { children?: ReactNode }).children);
    }
    return [child as ReactElement<IconActionProps>];
  });
}

export function RowActions({ children }: { children: ReactNode }) {
  const all = actionsOf(children);
  const hidden = all.filter((c) => c.props?.danger || c.props?.overflow);
  const split = all.length >= 2 && hidden.length > 0;

  const inline = split ? all.filter((c) => !hidden.includes(c)) : all;

  return (
    <Stack direction="row" spacing={0.25} sx={{ justifyContent: 'flex-end', alignItems: 'center' }}>
      {inline}
      {split && (
        <MoreActions
          items={hidden.map((c) => ({
            label: c.props.label,
            icon: c.props.icon,
            onClick: c.props.onClick ?? (() => {}),
            to: c.props.to,
            disabled: c.props.disabled,
            hint: c.props.hint,
            danger: c.props.danger,
          }))}
        />
      )}
    </Stack>
  );
}

export interface IconActionProps {
  /** What the control does. Becomes the tooltip and the accessible name. */
  label: string;
  icon: ComponentType<SvgIconProps>;
  onClick?: () => void;
  /** For an action that is really a link, so it opens in a new tab too. */
  to?: string;
  disabled?: boolean;
  /** Why it is unavailable, when it is. Falls back to the label. */
  hint?: string;
  /** Removes, retires or refuses something. Takes the refused tone. */
  danger?: boolean;
  /**
   * Belongs behind the overflow rather than on the row — an undo, a reversal,
   * anything occasional. `danger` implies this; use it for the ones that are
   * merely secondary.
   */
  overflow?: boolean;
}

export function IconAction({ label, icon: Icon, onClick, to, disabled, danger }: IconActionProps) {
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
/**
 * A row's extra actions, behind one control.
 *
 * A row that has finished — course completed, fee settled — still carries
 * several things worth doing, and four glyphs in a line reads as four
 * decisions of equal weight when in truth none of them is the usual next step.
 * They go behind the overflow, where the labels can be words.
 *
 * Items with `danger` are drawn in the refused tone and separated from the
 * rest, so a delete is never adjacent to the thing above it in the list.
 */
export function MoreActions({
  label = 'More actions',
  items,
}: {
  label?: string;
  items: {
    label: string;
    icon: ComponentType<SvgIconProps>;
    onClick?: () => void;
    /** For an item that is really a link. */
    to?: string;
    disabled?: boolean;
    /** Why it is unavailable, when it is. */
    hint?: string;
    danger?: boolean;
  }[];
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const shown = items.filter(Boolean);
  if (shown.length === 0) return null;

  const close = () => setAnchor(null);

  return (
    <>
      <Tooltip title={label} arrow>
        <IconButton size="small" aria-label={label} onClick={(e) => setAnchor(e.currentTarget)}>
          <MoreIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <MuiMenu anchorEl={anchor} open={Boolean(anchor)} onClose={close}>
        {shown.map((item, i) => {
          const previous = shown[i - 1];
          const entry = (
            <MenuItem
              key={item.label}
              disabled={item.disabled}
              {...(item.to ? { component: RouterLink, to: item.to } : {})}
              onClick={() => {
                close();
                item.onClick?.();
              }}
              sx={{
                fontSize: 13.5,
                gap: 1.5,
                ...(item.danger && { color: 'error.main' }),
                ...(item.danger && previous && !previous.danger && {
                  borderTop: 1,
                  borderColor: 'divider',
                  mt: 0.5,
                  pt: 1,
                }),
              }}
            >
              <item.icon fontSize="small" />
              {item.label}
            </MenuItem>
          );

          // A disabled item cannot raise a tooltip of its own, so the reason
          // is wrapped around it rather than put on it.
          return item.disabled && item.hint ? (
            <Tooltip key={item.label} title={item.hint} arrow placement="left">
              <span>{entry}</span>
            </Tooltip>
          ) : (
            entry
          );
        })}
      </MuiMenu>
    </>
  );
}

export function ToneAction({
  label,
  icon: Icon,
  tone,
  onClick,
  disabled,
  size = 'medium',
  hint,
  sx,
}: {
  label: string;
  icon: ComponentType<SvgIconProps>;
  tone: Tone;
  onClick: () => void;
  disabled?: boolean;
  /** `small` for one of these sitting in a row of icon actions. */
  size?: 'small' | 'medium';
  /**
   * A colour this one action carries instead of its tone's. For the rare
   * control that is neither accept nor refuse and should not borrow either —
   * changing the tone itself would repaint every chip and tile that shares it.
   */
  sx?: SxProps<Theme>;
  /**
   * Why it is disabled, or what it will do. A worded button explains itself,
   * so this is for the case a word cannot carry — chiefly "you cannot do this
   * yet, and here is what is in the way".
   */
  hint?: string;
}) {
  const colour = TONE_COLOUR[tone];
  const button = (
    <Button
      // Filled rather than outlined: these decide something, and on a row of
      // otherwise quiet controls the fill is what makes the pair read at a
      // glance as accept and refuse.
      variant="contained"
      size={size}
      // A tone with no Button colour of its own — `plain`, `holiday`,
      // `followup` — inherits the surrounding text colour rather than claiming
      // a semantic one.
      color={colour === 'default' ? 'inherit' : colour}
      startIcon={<Icon fontSize="small" />}
      disabled={disabled}
      onClick={onClick}
      sx={{ whiteSpace: 'nowrap', ...sx }}
    >
      {label}
    </Button>
  );

  if (!hint) return button;

  // A disabled button fires no events, so the tooltip needs a wrapper to hang
  // on to — otherwise the one control somebody is unsure about is the one that
  // cannot explain itself.
  return (
    <Tooltip title={hint}>
      {disabled ? <span style={{ display: 'inline-flex' }}>{button}</span> : button}
    </Tooltip>
  );
}

export function Dialog({
  title,
  onClose,
  onSubmit,
  submitLabel = 'Save',
  busy,
  disabled,
  actions,
  secondary,
  maxWidth = 'sm',
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  /**
   * `sm` suits a stack of fields, which is what most of these hold. A dialog
   * showing a table needs the room its columns need — otherwise the last
   * columns are cut off the right edge with nothing to say they are there.
   */
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** A request is in flight. The button says so and stops taking clicks. */
  busy?: boolean;
  /**
   * The form is not ready to submit — a required field is empty, there is
   * nothing left to pay.
   *
   * Separate from `busy` on purpose: passing a validation test as `busy` made
   * the button read "Saving…" over an empty form, which says the panel is
   * doing something when it is waiting for the person to type.
   */
  disabled?: boolean;
  /**
   * Controls that belong to the record rather than to the form — printing it,
   * opening it elsewhere. They sit inline with the title, away from Cancel and
   * Save, because they neither commit nor abandon what is being edited.
   */
  actions?: ReactNode;
  /**
   * A second way of committing this form — saving it and going on somewhere
   * else. It sits in the footer beside Save, because it does commit; `actions`
   * is for controls that do not.
   */
  secondary?: ReactNode;
  children: ReactNode;
}) {
  return (
    <MuiDialog open onClose={onClose} fullWidth maxWidth={maxWidth}>
      <DialogTitle
        sx={{
          fontSize: '1rem',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
        }}
      >
        <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title}
        </Box>
        {actions}
      </DialogTitle>
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
          {/* A second way of committing sits beside the first, not across
              Cancel from it. */}
          {secondary}
          <Button type="submit" variant="contained" disabled={busy || disabled}>
            {busy ? 'Saving…' : submitLabel}
          </Button>
        </DialogActions>
      </Box>
    </MuiDialog>
  );
}

/**
 * Confirmation dialog for destructive actions (delete, remove, etc.).
 * Red-themed header with icon and text button.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  warning,
  onClose,
  onConfirm,
  confirmLabel = 'Delete',
  confirmIcon,
  busy,
  danger = true,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  warning?: string;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  confirmIcon?: ComponentType<SvgIconProps>;
  busy?: boolean;
  danger?: boolean;
}) {
  const Icon = confirmIcon;
  return (
    <MuiDialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle
        sx={{
          bgcolor: danger ? '#d32f2f' : 'primary.main',
          color: '#fff',
          fontWeight: 600,
        }}
      >
        {title}
      </DialogTitle>
      <DialogContent sx={{ pt: 3, pb: 2 }}>
        <Typography>{message}</Typography>
        {warning && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {warning}
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} color="inherit" size="small">
          Cancel
        </Button>
        <Button
          variant="contained"
          size="small"
          startIcon={Icon ? <Icon fontSize="small" /> : undefined}
          sx={danger ? { bgcolor: '#d32f2f', '&:hover': { bgcolor: '#b71c1c' } } : {}}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? 'Processing…' : confirmLabel}
        </Button>
      </DialogActions>
    </MuiDialog>
  );
}

export const money = (v: string | number | null | undefined) =>
  v == null || v === '' ? '—' : Number(v).toLocaleString('en-IN');
