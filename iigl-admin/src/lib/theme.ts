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
  bodyText: '#3c4252',
  mutedText: '#4a5265',
  cardBorder: '#e6e8ee',
  sectionBg: '#f8f9fb',
} as const;

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
    // turning them navy would cost the at-a-glance read on the tables.
    success: { main: '#1f6b4b' },
    warning: { main: '#8a5a16' },
    error: { main: '#97293f' },
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
        head: {
          textTransform: 'uppercase',
          fontSize: '0.66rem',
          letterSpacing: '0.08em',
          fontWeight: 500,
          color: BRAND.mutedText,
          backgroundColor: BRAND.sectionBg,
          whiteSpace: 'nowrap',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
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
      defaultProps: { disableElevation: true },
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
