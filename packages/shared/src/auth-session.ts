import { z } from 'zod';
import {
  loginResponseSchema,
  type AuthClient,
  type AuthUser,
  type ChangePasswordRequest,
  type LoginResponse,
} from './auth';
import { ApiRequestError, createApiClient, type ApiClient } from './http';

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: AuthUser;
  /** POS only: the server rejected the refresh token; keep selling, ask the cashier to log in again. */
  needsReauth?: boolean;
}

/** Async so it fits both localStorage (admin) and IndexedDB (POS). */
export interface SessionStorageAdapter {
  load(): Promise<StoredSession | null>;
  save(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
}

export interface AuthSessionOptions {
  baseUrl: string;
  client: AuthClient;
  storage: SessionStorageAdapter;
  /**
   * What to do when the server rejects the refresh token (401):
   * - 'clear' (admin): drop the session → user goes back to the login page.
   * - 'flag'  (POS):   keep the session and set needsReauth, so selling continues offline-style (ADR-001).
   */
  onRefreshRejected: 'clear' | 'flag';
  /** Web Locks name used to serialise refreshes across tabs (avoids false refresh-token reuse). */
  lockName?: string;
  fetchImpl?: typeof fetch;
}

export interface AuthSession {
  /** Authenticated API client: attaches the access token, refreshes once on 401. */
  readonly api: ApiClient;
  init(): Promise<StoredSession | null>;
  getSession(): StoredSession | null;
  subscribe(listener: () => void): () => void;
  login(username: string, password: string): Promise<StoredSession>;
  /** Returns true when a fresh token pair is available. Never throws for network errors. */
  refresh(): Promise<boolean>;
  changePassword(dto: ChangePasswordRequest): Promise<StoredSession>;
  /** Revokes the refresh token on the server when reachable, then clears the local session. */
  logout(): Promise<void>;
}

export const toStoredSession = (res: LoginResponse): StoredSession => ({
  accessToken: res.accessToken,
  refreshToken: res.refreshToken,
  refreshTokenExpiresAt: res.refreshTokenExpiresAt,
  user: res.user,
});

type LockManagerLike = { request<T>(name: string, cb: () => Promise<T>): Promise<T> };

function withLock<T>(name: string | undefined, fn: () => Promise<T>): Promise<T> {
  const locks = (globalThis as { navigator?: { locks?: LockManagerLike } }).navigator?.locks;
  return name && locks ? locks.request(name, fn) : fn();
}

export function createAuthSession(opts: AuthSessionOptions): AuthSession {
  let session: StoredSession | null = null;
  let inflight: Promise<boolean> | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  const publicApi = createApiClient(opts.baseUrl, { fetchImpl: opts.fetchImpl });

  async function set(next: StoredSession | null): Promise<void> {
    session = next;
    if (next) await opts.storage.save(next);
    else await opts.storage.clear();
    emit();
  }

  async function doRefresh(): Promise<boolean> {
    // Another tab may already have rotated the token: pick up its result instead of reusing ours.
    const latest = await opts.storage.load();
    if (latest && session && latest.refreshToken !== session.refreshToken) {
      session = latest;
      emit();
      return !latest.needsReauth;
    }
    if (!session) return false;
    try {
      const res = await publicApi.post(
        '/auth/refresh',
        loginResponseSchema,
        { refreshToken: session.refreshToken },
        { auth: false },
      );
      await set(toStoredSession(res));
      return true;
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        if (opts.onRefreshRejected === 'clear') await set(null);
        else await set({ ...session, needsReauth: true });
      }
      // Network errors (status 0) and 5xx: keep the session untouched.
      return false;
    }
  }

  const refresh = (): Promise<boolean> => {
    inflight ??= withLock(opts.lockName, doRefresh).finally(() => {
      inflight = null;
    });
    return inflight;
  };

  const api = createApiClient(opts.baseUrl, {
    fetchImpl: opts.fetchImpl,
    getAccessToken: () => session?.accessToken,
    onUnauthorized: refresh,
  });

  return {
    api,
    async init() {
      session = await opts.storage.load();
      emit();
      return session;
    },
    getSession: () => session,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async login(username, password) {
      const res = await publicApi.post(
        '/auth/login',
        loginResponseSchema,
        { username, password, client: opts.client },
        { auth: false },
      );
      const next = toStoredSession(res);
      await set(next);
      return next;
    },
    refresh,
    async changePassword(dto) {
      const res = await api.post('/auth/change-password', loginResponseSchema, dto);
      const next = toStoredSession(res);
      await set(next);
      return next;
    },
    async logout() {
      const current = session;
      if (current) {
        try {
          await api.post('/auth/logout', z.unknown(), { refreshToken: current.refreshToken });
        } catch {
          // Offline or token already invalid: the local session is cleared anyway.
        }
      }
      await set(null);
    },
  };
}

/** localStorage adapter (admin web). Storage failures (private mode, quota) degrade to an in-memory session. */
export function localStorageAdapter(key: string): SessionStorageAdapter {
  const ls = () => (globalThis as { localStorage?: Storage }).localStorage;
  return {
    async load() {
      try {
        const raw = ls()?.getItem(key);
        return raw ? (JSON.parse(raw) as StoredSession) : null;
      } catch {
        return null;
      }
    },
    async save(s) {
      try {
        ls()?.setItem(key, JSON.stringify(s));
      } catch {
        /* ignore */
      }
    },
    async clear() {
      try {
        ls()?.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

export function memoryStorageAdapter(initial: StoredSession | null = null): SessionStorageAdapter {
  let value = initial;
  return {
    load: async () => value,
    save: async (s) => {
      value = s;
    },
    clear: async () => {
      value = null;
    },
  };
}
