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

if (import.meta.env.DEV && IS_CROSS_ORIGIN) {
  const origin = new URL(API_BASE).origin;
  console.info(
    `[iigl-admin] API at ${origin}, a different origin from this panel. ` +
      `That origin must include ${window.location.origin} in CORS_ORIGINS, ` +
      `or every request will be blocked by the browser.`,
  );
}
