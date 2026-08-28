import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { theme } from './lib/theme';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      {/* Paints the background and normalises browser defaults, so no
          stylesheet of our own is needed for either. */}
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>,
);
