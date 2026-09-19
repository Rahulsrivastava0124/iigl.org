/**
 * Where the API lives.
 *
 * `VITE_API_URL` is read at build time, not at run time — Vite substitutes it
 * into the bundle. A build therefore targets one API, and pointing the panel
 * somewhere else means rebuilding with a different value.
 *
 * Two shapes are supported:
 *
 *   /api                        same origin. The default. In development Vite
 *                               proxies it to the API server; in production the
 *                               panel and the API sit behind one host.
 *
 *   https://api.iigl.org/api    a different origin. Authentication is a cookie,
 *                               so that origin must list this one in its
 *                               CORS_ORIGINS, and both must be HTTPS for the
 *                               browser to send the cookie at all.
 *
 * Same origin is the better default: the cookie stays first-party, which
 * survives third-party cookie restrictions that a cross-origin setup does not.
 */

import { currentPortal } from './portal';

const RAW = (import.meta.env.VITE_API_URL ?? '/api').trim();

/** No trailing slash, so joining a path never produces a double slash. */
export const API_BASE = RAW.replace(/\/+$/, '') || '/api';

export const IS_CROSS_ORIGIN = /^https?:\/\//i.test(API_BASE);

/**
 * Builds a full URL for an API path. Paths are written with a leading slash.
 *
 * Every URL names the panel it comes from. The API keeps one session per panel,
 * chosen by this, so signing in to admin. in one tab no longer signs super. out
 * in the next. Added here because everything reaches the API through this —
 * requests, uploads, pictures, and the PDFs opened in a new tab, where no
 * header could be set.
 */
export function apiUrl(path: string): string {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  return `${url}${url.includes('?') ? '&' : '?'}portal=${currentPortal()}`;
}

/**
 * A URL for a file the database points at.
 *
 * Image columns hold the path Laravel wrote — `public/uploads/icon/x.jpg` —
 * and the API serves those files at `/files`, so Laravel's own document root
 * comes off and the rest is the path.
 *
 * `public/` and `uploads/` are stripped separately, because one folder is not
 * under the other: payment proof is `public/screenshots/x.webp`, and taking
 * the two off only as a pair left the prefix on and asked for a file that
 * does not exist.
 *
 * Returns null for an empty column, so a caller can decide what an absent
 * image looks like rather than rendering a broken one.
 */
export function fileUrl(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const trimmed = stored.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return apiUrl(`/files/${trimmed.replace(/^\/+/, '').replace(/^public\//, '').replace(/^uploads\//, '')}`);
}

if (import.meta.env.DEV && IS_CROSS_ORIGIN) {
  const origin = new URL(API_BASE).origin;
  console.info(
    `[iigl-admin] API at ${origin}, a different origin from this panel. ` +
      `That origin must include ${window.location.origin} in CORS_ORIGINS, ` +
      `or every request will be blocked by the browser.`,
  );
}

/** The three cards a certificate can be printed as. */
export type CardKind = 'smart' | 'smart-header' | 'classic';

/**
 * Opens a printed card in a new tab. The API streams the PDF inline.
 *
 * One helper rather than a copy on each screen that prints one: the smart card
 * gained a second form — with the customer's own name and mark on it — and
 * that is the kind of change that reaches one copy and not the other.
 *
 *   smart          IIGL's logo alone
 *   smart-header   the customer's name and mark beside it, when their order
 *                  asked for them
 *   classic        the A4 identification report
 */
export function printCard(id: number, kind: CardKind) {
  window.open(apiUrl(`/cards/${kind}/${id}`), '_blank', 'noopener');
}
