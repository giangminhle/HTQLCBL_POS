import { createAuthSession, localStorageAdapter } from '@retailchain/shared';

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** Admin session: tokens in localStorage (ADR-001); a rejected refresh token sends the user back to login. */
export const auth = createAuthSession({
  baseUrl: API_URL,
  client: 'admin',
  storage: localStorageAdapter('retailchain.admin.session'),
  onRefreshRejected: 'clear',
  lockName: 'retailchain-admin-refresh',
});

export const api = auth.api;
