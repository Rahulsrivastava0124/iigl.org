import { useEffect, useState } from 'react';

/**
 * Where the website reads from.
 *
 * `VITE_API_URL` is substituted at build time, like the panel's: the API base
 * including its `/api` suffix. `.env.production` points deployed builds at the
 * live API; `.env.development` points `npm run dev` at the local one.
 */
export const API_BASE = (import.meta.env.VITE_API_URL ?? 'https://api.iigl.org/api').trim().replace(/\/+$/, '');

/** A full URL for an API path, written with a leading slash. */
export const apiUrl = (path) => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;

/** GET a public endpoint and return its `data`. Throws on a non-2xx. */
export async function getPublic(path, { signal } = {}) {
  const response = await fetch(apiUrl(path), { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${path} answered ${response.status}`);
  const body = await response.json();
  return body.data;
}

/**
 * A URL for a stored `public/uploads/…` path, built the way the panel builds
 * it. The website's own folders (website, banner, icon) need no session.
 */
export function fileUrl(stored) {
  const path = stored?.trim();
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return apiUrl(`/files/${path.replace(/^\/*(public\/)?uploads\//, '')}`);
}

/**
 * The rows a public endpoint returns, or null until they arrive — and null for
 * good when the API cannot be reached, so a section keeps its built-in content
 * instead of going blank.
 */
export function usePublic(path) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    getPublic(`/public${path}`, { signal: controller.signal })
      .then((data) => setRows(Array.isArray(data) ? data : null))
      .catch(() => {});
    return () => controller.abort();
  }, [path]);

  return rows;
}
