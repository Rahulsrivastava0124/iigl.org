import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { messageOf } from './auth';

/**
 * Loads a path and re-loads when it changes. Returns a `reload` so a screen can
 * refresh itself after a write without re-mounting.
 */
export function useFetch<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));

  const load = useCallback(() => {
    if (!path) return;
    setLoading(true);
    setError(null);
    api
      .get<T>(path)
      .then(setData)
      .catch((e) => setError(messageOf(e)))
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(load, [load]);

  return { data, error, loading, reload: load };
}
