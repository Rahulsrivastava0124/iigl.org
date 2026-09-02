import { createTheme } from '@mui/material/styles';

/**
 * IIGL theme.
 *
 * The palette is the one in iigl-frontend-website/style.md, so the panel and
 * the public site are the same brand rather than two interpretations of it.
 * Deep navy #061948 carries 17.0:1 against white, which is why it works for
 * body text and small labels as well as for fills.
 *
 * Gold is an accent only. It marks a value or a state; it never fills a button
 * or a bar, because at that size it competes with the navy instead of
 * punctuating it.
 *
 * Light only, deliberately. White is half the brand, so the panel stays white
 * whatever the operating system prefers rather than flipping to a dark ground.
 */

/**
 * The one place the brand colour is defined. Everything else in the panel
 * derives from `navy`, so changing this line restyles the whole thing.
 */
export const BRAND = {
  /** Deep navy. The primary brand colour, shared with the public website. */
  navy: '#061948',
  navyDark: '#03102f',
  /** Primary navy from the website palette: the lighter of the two. */
  navySoft: '#2c3b64',
  navyWash: '#e7eaf1',
  /** Gold, for accents only — never for a large fill or a primary action. */
  gold: '#d58a2b',
  goldDark: '#bd7724',
  /**
   * A true yellow, brighter than the accent gold.
   *
   * One control uses it: Follow, on the two enquiry lists. It is filled rather
   * than accented, which is the exception to the gold rule above, and it takes
   * navy text — yellow this bright carries nothing legible in white.
   */
  yellow: '#f2b705',
  yellowDark: '#d79f04',
  bodyText: '#3c4252',
  mutedText: '#4a5265',
  /**
   * The edge of every surface: panels, tables, dialogs, fields, drop zones.
   *
   * Navy diluted, not grey. Grey borders belong to no palette and read as the
   * browser's own chrome; a border mixed from the brand colour puts the panel
   * and the thing it frames in the same family, and at this dilution it still
   * sits behind the content rather than boxing it in.
   */
  cardBorder: '#c2cce0',
  /**
   * The line between two table rows.
   *
   * A shade darker than `cardBorder`, for the same reason it always was: a
   * card's edge has a shadow helping it, and a rule between two records is on
   * its own in saying where one ends and the next begins.
   */
  tableRule: '#aab8d3',
  sectionBg: '#f8f9fb',
  /**
   * The table header row is filled with the brand navy rather than the pale
   * section grey, so a list reads as a titled block instead of a run of rows.
   * Labels sit on it in white, which carries 17.0:1.
   */
  tableHeadBg: '#061948',
  tableHeadText: '#ffffff',
} as const;

/**
 * The four states, and the colours that carry them.
 *
 * Every status badge, tile fill and row action in the panel takes its colour
 * from here rather than naming one itself, so a state looks the same on a chip
 * as it does on a button as it does on a dashboard card. `plain` is the fourth
 * state deliberately: a status with no news still needs a defined colour, or
 * each screen invents its own grey.
 *
 * `main` is the fill, `on` the text that sits on it, `soft` the tint for a
 * surface that should carry the state without shouting it. The first four
 * `main` values clear 4.5:1 against white for text use and carry white above
 * 7:1 as a fill; `yes` and `no` are the Laravel panel's own flag colours and do
 * not — see the note on them below.
 */
export const TONE = {
  settled: { main: '#1f6b4b', on: '#ffffff', soft: '#e7f1ec' },
  waiting: { main: '#8a5a16', on: '#ffffff', soft: '#f7efe1' },
  refused: { main: '#97293f', on: '#ffffff', soft: '#f8e9ec' },
  plain: { main: '#4a5265', on: '#ffffff', soft: '#eef0f4' },
  // The Yes/No flag columns, kept as the Laravel panel had them. Those columns
  // are read as a block — a wall of green with the exceptions in red — and the
  // muted settled/refused tones lose that at-a-glance read. They stay separate
  // from settled/refused so that brightening a flag cannot brighten every
  // status chip and alert in the panel.
  yes: { main: '#20c020', on: '#ffffff', soft: '#e6f7e6' },
  no: { main: '#fb3b5c', on: '#ffffff', soft: '#feeaee' },
} as const;

export type ToneName = keyof typeof TONE;

export const theme = createTheme({
  cssVariables: true,

  palette: {
    mode: 'light',
    primary: {
      main: BRAND.navy,
      dark: BRAND.navyDark,
      light: BRAND.navySoft,
      contrastText: '#ffffff',
    },
    secondary: {
      main: BRAND.gold,
      dark: BRAND.goldDark,
      contrastText: '#ffffff',
    },
    // Semantic colour stays separate from the brand: these carry state, and
    // turning them navy would cost the at-a-glance read on the tables. The
    // values come from TONE so that Material UI's own components and the
    // panel's tone-driven ones cannot drift apart.
    success: { main: TONE.settled.main, contrastText: TONE.settled.on },
    warning: { main: TONE.waiting.main, contrastText: TONE.waiting.on },
    error: { main: TONE.refused.main, contrastText: TONE.refused.on },
    background: { default: BRAND.sectionBg, paper: '#ffffff' },
    text: { primary: BRAND.bodyText, secondary: BRAND.mutedText },
    divider: BRAND.cardBorder,
  },

  shape: { borderRadius: 8 },

  typography: {
    fontFamily: '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
    fontSize: 14,
    h1: { fontSize: '1.4rem', fontWeight: 600, letterSpacing: '-0.01em' },
    h2: { fontSize: '1.05rem', fontWeight: 600 },
    // Table headers and field labels.
    overline: {
      fontSize: '0.66rem',
      fontWeight: 500,
      letterSpacing: '0.09em',
      lineHeight: 1.6,
    },
    button: { textTransform: 'none', fontWeight: 600 },
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // Digits line up in columns throughout, so this is set globally rather
        // than remembered on each numeric cell.
        '.tabular': { fontVariantNumeric: 'tabular-nums' },
        '.mono': {
          fontFamily: '"IBM Plex Mono", ui-monospace, "SFMono-Regular", monospace',
          fontSize: '0.82rem',
        },
        /*
         * No spinner arrows on a number field.
         *
         * Every numeric field in the panel holds money, a count of days or a
         * percentage — figures somebody types, not ones they nudge one at a
         * time. The arrows also sit where the eye goes for the value, and a
         * stray scroll over a focused field silently changes an amount.
         * `type="number"` is kept for the keypad it brings up on a phone and
         * for the min/max the fields already set.
         */
        'input[type=number]::-webkit-outer-spin-button, input[type=number]::-webkit-inner-spin-button':
          { WebkitAppearance: 'none', margin: 0 },
        'input[type=number]': { MozAppearance: 'textfield' },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: 'none' },
        outlined: { borderColor: BRAND.cardBorder },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { paddingTop: 9, paddingBottom: 9, whiteSpace: 'nowrap' },
        // Every row in the panel is separated, and by the same line.
        body: { borderBottom: `1px solid ${BRAND.tableRule}` },
        head: {
          textTransform: 'uppercase',
          fontSize: '0.76rem',
          letterSpacing: '0.08em',
          fontWeight: 600,
          color: BRAND.tableHeadText,
          backgroundColor: BRAND.tableHeadBg,
          borderBottom: 'none',
          whiteSpace: 'nowrap',
        },
        // Every list in the panel sets `stickyHeader`, and that slot paints its
        // own background over the one above, so the navy has to be repeated
        // here or the header goes pale as soon as a table scrolls.
        stickyHeader: { backgroundColor: BRAND.tableHeadBg },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        // The last row keeps no rule of its own: the panel closes with its own
        // border — the count footer or the pager — and two lines a pixel apart
        // read as a mistake.
        root: { '&:last-child td': { borderBottom: 0 } },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, fontSize: '0.7rem' },
        sizeSmall: { height: 21 },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true, size: 'medium' },
      styleOverrides: {
        // A button sharing a flex row with a filter is the item that gives way
        // when the row runs out of width, and its label breaks across lines
        // inside a shrunken box. It should keep its width and let the row wrap
        // around it instead.
        root: { whiteSpace: 'nowrap', flexShrink: 0 },
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small', fullWidth: true },
    },
    MuiSelect: {
      defaultProps: { size: 'small' },
    },
    MuiAlert: {
      defaultProps: { variant: 'outlined' },
    },
    MuiTooltip: {
      defaultProps: { arrow: true },
    },
  },
});
