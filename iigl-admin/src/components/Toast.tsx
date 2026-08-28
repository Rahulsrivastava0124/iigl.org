import hot, { Toaster } from 'react-hot-toast';
import { BRAND, TONE } from '../lib/theme';

/**
 * Toasts for the result of an action, on react-hot-toast.
 *
 * Pages call `useToast()` and get `ok` / `error` / `info`. That façade is the
 * point of this file: it was a Snackbar before and the thirteen pages behind it
 * did not have to know, and they will not have to know next time either.
 *
 * The library's own look is a white pill with an emoji-ish tick, which belongs
 * to no product in particular. Everything below dresses it in the panel's own
 * palette — the tone colours from `theme.ts`, the same ones a `StateChip` and a
 * `Notice` use — so a saved record reads as this panel rather than as a
 * dependency's default.
 *
 * ponytail: no promise toasts, no per-call duration, no undo action. Add one
 * when a screen actually needs it; `hot` is exported for that.
 */

const base = {
  // A toast is one sentence. Wider than this and it reads as a paragraph
  // floating over the table; narrower and every message wraps three times.
  maxWidth: 460,
  padding: '10px 14px',
  borderRadius: 8,
  fontSize: 13.5,
  fontWeight: 500,
  boxShadow: '0 6px 24px rgba(6, 25, 72, 0.16)',
};

/** Filled in the tone's colour, the way `Notice` and `StateChip` are. */
const toned = (tone: keyof typeof TONE) => ({
  style: { ...base, background: TONE[tone].main, color: TONE[tone].on },
  iconTheme: { primary: TONE[tone].on, secondary: TONE[tone].main },
});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="top-center"
        gutter={8}
        toastOptions={{
          // Long enough to read a sentence; a failure stays up longer because
          // it is the one worth reading twice.
          duration: 4000,
          success: { ...toned('settled') },
          error: { ...toned('refused'), duration: 8000 },
          blank: { style: { ...base, background: BRAND.navy, color: '#ffffff' } },
        }}
      />
    </>
  );
}

export interface ToastApi {
  ok: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const api: ToastApi = {
  ok: (message) => void hot.success(message),
  error: (message) => void hot.error(message),
  info: (message) => void hot(message),
};

/**
 * react-hot-toast is imperative and needs no context, so this is a hook only
 * because every page already calls it as one.
 */
export function useToast(): ToastApi {
  return api;
}

/** The library itself, for the rare call this façade does not cover. */
export { hot };
