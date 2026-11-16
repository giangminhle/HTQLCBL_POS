import { createAuthSession } from '@retailchain/shared';
import { db } from '../db';
import { dexieSessionAdapter } from './session-storage';

export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/**
 * POS session: tokens in IndexedDB (ADR-001). When the server rejects the refresh token the session is
 * kept with needsReauth=true so the cashier can keep selling; sync resumes after logging in again.
 */
export const auth = createAuthSession({
  baseUrl: API_URL,
  client: 'pos',
  storage: dexieSessionAdapter(db),
  onRefreshRejected: 'flag',
  lockName: 'retailchain-pos-refresh',
});

export const api = auth.api;
