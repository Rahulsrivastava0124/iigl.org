import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { messageOf } from './auth';

/**
 * Loads a path and re-loads when it changes. Returns a `reload` so a screen can
 * refresh itself after a write without re-mounting.
 *
 * Only the newest request is allowed to set state. Search boxes fetch on every
 * keystroke, so several are in flight at once and they do not come back in the
 * order they were sent — a broad early term can easily outlast the narrow one
 * typed after it. Without this guard that stale response lands last and the
 * list ends up showing results for a term no longer in the box.
 */
export function useFetch<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));

  const latest = useRef(0);

  const load = useCallback(() => {
    if (!path) return;
    const request = ++latest.current;
    const current = () => request === latest.current;

    setLoading(true);
    setError(null);
    api
      .get<T>(path)
      .then((d) => current() && setData(d))
      .catch((e) => current() && setError(messageOf(e)))
      .finally(() => current() && setLoading(false));
  }, [path]);

  useEffect(load, [load]);

  return { data, error, loading, reload: load };
}

/**
 * A value that settles before it is used.
 *
 * A search term goes into the URL a list fetches, and `useFetch` reloads
 * whenever that URL changes, so without this every keystroke is a query — and
 * each one is a `LIKE '%…%'` that no index can help, across 22,000
 * certificates or 9,600 orders.
 *
 * 150ms is under the threshold where a delay reads as lag, so the list still
 * feels like it is following the typing, while a typed word becomes one query
 * rather than eight.
 */
export function useDebounced<T>(value: T, delay = 150): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}
