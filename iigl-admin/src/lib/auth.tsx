import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError, setSessionLostHandler, type SessionUser } from './api';
import { currentPortal, PORTALS, type Portal } from './portal';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  /**
   * The API could not be reached on the last attempt to identify the person.
   *
   * Kept apart from `user: null` because the two look identical and mean
   * opposite things: one is "you are signed out", the other is "we cannot tell
   * — the server is not answering". Showing the sign-in form for the second
   * sends somebody to type a password that cannot possibly be checked.
   */
  offline: boolean;
  portal: Portal;
  /**
   * Read the session's own record again.
   *
   * The photograph travels beside the session rather than inside it, so a
   * person who changes theirs on their profile would otherwise keep the old
   * one in the bar until the next full load.
   */
  refresh: () => Promise<void>;
  signIn: (mobile: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const portal = currentPortal();
  const config = PORTALS[portal];

  // A 401 anywhere means the session is gone. Clearing the user here returns
  // the whole panel to sign-in, instead of each open screen showing the API
  // message where its data should be.
  useEffect(() => {
    setSessionLostHandler(() => setUser(null));
  }, []);

  // Ask the API who we are on first load: the session cookie survives a reload,
  // so a signed-in person should not be bounced back to sign-in.
  const refresh = useCallback(
    () =>
      api
        .get<{ user: SessionUser }>('/auth/me')
        .then((r) => {
          // Someone who signed in at another door should not be carried into
          // this one by a shared cookie.
          setUser(r.user.roleId !== null && config.admits(r.user.roleId) ? r.user : null);
          setOffline(false);
        })
        .catch((e) => {
          setUser(null);
          // A 401 is a real answer: there is no session. Anything else on this
          // call means the API did not answer at all.
          setOffline(e instanceof ApiError && e.code === 'offline');
        })
        .finally(() => setLoading(false)),
    [config],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = async (mobile: string, password: string) => {
    setOffline(false);
    const r = await api.post<{ user: SessionUser }>('/auth/login', { mobile, password });

    // A person with no role is not admitted by any door: every door asks for a
    // role, and null is the absence of one.
    if (r.user.roleId === null || !config.admits(r.user.roleId)) {
      // Correct credentials, wrong entrance. Drop the session so a refused
      // sign-in does not silently leave one behind.
      await api.post('/auth/logout').catch(() => undefined);
      throw new ApiError(403, config.wrongDoor, 'wrong_portal');
    }

    setUser(r.user);
  };

  const signOut = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, offline, portal, refresh, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Turns any thrown value into something worth showing a person. */
export function messageOf(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
