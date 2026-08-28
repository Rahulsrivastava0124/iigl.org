import { createTheme } from '@mui/material/styles';

/**
 * IIGL theme.
 *
 * The primary colour is sampled from the logo files, where `#2c3b64` is the
 * dominant value across logo.png, h-logo.png, card-logo.png and logo-text.png.
 * It carries 10.96:1 against white, so it works for body text and small labels
 * as well as for fills.
 *
 * Light only, deliberately. White is half the brand, so the panel stays white
 * whatever the operating system prefers rather than flipping to a dark ground.
 */

export const BRAND = {
  navy: '#2c3b64',
  navyDark: '#1d2846',
  navySoft: '#4a5c8c',
  navyWash: '#e9ecf3',
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
    // Semantic colour stays separate from the brand: these carry state, and
    // turning them navy would cost the at-a-glance read on the tables.
    success: { main: '#1f6b4b' },
    warning: { main: '#8a5a16' },
    error: { main: '#97293f' },
    background: { default: '#f4f5f9', paper: '#ffffff' },
    text: { primary: '#151a28', secondary: '#5a6178' },
    divider: '#d6d9e5',
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
        outlined: { borderColor: '#d6d9e5' },
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
          color: '#5a6178',
          backgroundColor: '#eef0f6',
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
