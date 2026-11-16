import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { AuthSession, StoredSession } from '@retailchain/shared';

const AuthContext = createContext<AuthSession | null>(null);

export function AuthProvider({ auth, children }: { auth: AuthSession; children: ReactNode }) {
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthSession {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>');
  return auth;
}

/** Re-renders whenever the session changes (login, refresh, logout — also from other code paths). */
export function useSession(): StoredSession | null {
  const auth = useAuth();
  return useSyncExternalStore(auth.subscribe, auth.getSession);
}
