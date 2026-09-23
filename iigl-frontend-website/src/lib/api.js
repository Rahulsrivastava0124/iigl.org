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
 * POST a public form. Form-encoded rather than JSON, so the browser sends it
 * as it is instead of first asking the API whether this site may.
 * Throws with the API's own message on a non-2xx.
 */
export async function postPublic(path, fields) {
  const response = await fetch(apiUrl(path), { method: 'POST', body: new URLSearchParams(fields) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? 'Something went wrong. Please try again.');
  return body;
}

/**
 * The student portal talks to `/api/public/student/*` and carries the
 * `iigl.student` cookie, so these send credentials where the plain public
 * helpers do not.
 */
export async function getStudent(path, { signal } = {}) {
  const response = await fetch(apiUrl(`/public/student${path}`), {
    signal,
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (response.status === 401) throw Object.assign(new Error('Not signed in.'), { status: 401 });
  if (!response.ok) throw new Error(`${path} answered ${response.status}`);
  return (await response.json()).data;
}

export async function postStudent(path, fields = {}) {
  const response = await fetch(apiUrl(`/public/student${path}`), {
    method: 'POST',
    credentials: 'include',
    body: new URLSearchParams(fields),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message ?? 'Something went wrong. Please try again.');
  return body.data;
}

/** A URL on the student portal, for a PDF opened in a new tab. */
export const studentUrl = (path) => apiUrl(`/public/student${path}`);

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
