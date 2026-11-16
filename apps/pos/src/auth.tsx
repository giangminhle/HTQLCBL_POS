import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
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

export function useSession(): StoredSession | null {
  const auth = useAuth();
  return useSyncExternalStore(auth.subscribe, auth.getSession);
}

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine);
}

/** Whenever the device is (or comes back) online, try to refresh tokens. Failures never log the cashier out. */
export function useAutoRefresh(): void {
  const auth = useAuth();
  const online = useOnline();
  const hasSession = useSession() !== null;
  useEffect(() => {
    if (online && hasSession) void auth.refresh();
  }, [auth, online, hasSession]);
}
