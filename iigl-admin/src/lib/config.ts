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

const RAW = (import.meta.env.VITE_API_URL ?? '/api').trim();

/** No trailing slash, so joining a path never produces a double slash. */
export const API_BASE = RAW.replace(/\/+$/, '') || '/api';

export const IS_CROSS_ORIGIN = /^https?:\/\//i.test(API_BASE);

/** Builds a full URL for an API path. Paths are written with a leading slash. */
export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * A URL for a file the database points at.
 *
 * Image columns hold the path Laravel wrote — `public/uploads/icon/x.jpg` —
 * and the API serves the `uploads` directory at `/files`, so the stored
 * `public/uploads/` prefix comes off and the rest is the path.
 *
 * Returns null for an empty column, so a caller can decide what an absent
 * image looks like rather than rendering a broken one.
 */
export function fileUrl(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const trimmed = stored.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return apiUrl(`/files/${trimmed.replace(/^\/*(public\/)?uploads\//, '')}`);
}

if (import.meta.env.DEV && IS_CROSS_ORIGIN) {
  const origin = new URL(API_BASE).origin;
  console.info(
    `[iigl-admin] API at ${origin}, a different origin from this panel. ` +
      `That origin must include ${window.location.origin} in CORS_ORIGINS, ` +
      `or every request will be blocked by the browser.`,
  );
}
