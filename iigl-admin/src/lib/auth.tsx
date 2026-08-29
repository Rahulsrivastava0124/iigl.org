import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, setSessionLostHandler, type SessionUser } from './api';
import { currentPortal, PORTALS, type Portal } from './portal';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  portal: Portal;
  signIn: (mobile: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
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
  useEffect(() => {
    api
      .get<{ user: SessionUser }>('/auth/me')
      .then((r) => {
        // Someone who signed in at another door should not be carried into
        // this one by a shared cookie.
        setUser(r.user.roleId !== null && config.admits(r.user.roleId) ? r.user : null);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [config]);

  const signIn = async (mobile: string, password: string) => {
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
    <AuthContext.Provider value={{ user, loading, portal, signIn, signOut }}>
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
