import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Alert, Snackbar } from '@mui/material';

/**
 * Toasts — Material UI calls them Snackbars — for the result of an action.
 *
 * Nothing new was installed for this: `Snackbar` wrapping an `Alert` is the
 * documented pattern for a severity-carrying toast, so notistack would have
 * been a dependency for a queue and a hook, which is what this file is.
 *
 * A saved record used to be reported by an `Alert` pushed in above the panel,
 * which moved the whole page down and then sat there until something else
 * replaced it. Failures still belong beside the field that caused them —
 * validation, a sign-in that did not match — and those stay inline.
 *
 * ponytail: one toast at a time, the queue holds the rest. Stacking several is
 * against the Material guidelines and nothing here fires two at once.
 */

type Kind = 'success' | 'error' | 'info';

interface Toasted {
  key: number;
  message: string;
  kind: Kind;
}

interface ToastApi {
  ok: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Toasted[]>([]);
  const current = queue[0];

  const push = useCallback(
    (kind: Kind) => (message: string) =>
      setQueue((q) => [...q, { key: Date.now() + q.length, message, kind }]),
    [],
  );

  const api = useMemo<ToastApi>(
    () => ({ ok: push('success'), error: push('error'), info: push('info') }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Snackbar
        key={current?.key}
        open={Boolean(current)}
        // Long enough to read a sentence; failures stay up longer because they
        // are the ones worth reading twice.
        autoHideDuration={current?.kind === 'error' ? 8000 : 4000}
        onClose={(_e, reason) => {
          // Clicking anywhere else must not swallow a message the user has not
          // read yet. Escape and the close button still dismiss it.
          if (reason === 'clickaway') return;
          setQueue((q) => q.slice(1));
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          severity={current?.kind ?? 'info'}
          variant="filled"
          onClose={() => setQueue((q) => q.slice(1))}
          sx={{ maxWidth: 480 }}
        >
          {current?.message}
        </Alert>
      </Snackbar>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}
