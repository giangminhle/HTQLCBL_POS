import { Role, type AuthClient } from '@retailchain/shared';

/** REQ-AUTH-01: lock the account for 15 minutes after 5 consecutive wrong passwords. */
export const MAX_FAILED_LOGINS = 5;
export const LOCK_DURATION_MS = 15 * 60_000;

export interface RefreshTtls {
  adminMs: number;
  posMs: number;
}

/**
 * ADR-001: POS sessions of CASHIER and BRANCH_MANAGER get the long (30-day) refresh token so the POS
 * keeps working through long offline periods. OWNER is always 7 days on every app; admin web is 7 days.
 */
export function refreshTtlFor(role: Role, client: AuthClient, ttls: RefreshTtls): number {
  const longPosSession = client === 'pos' && (role === Role.CASHIER || role === Role.BRANCH_MANAGER);
  return longPosSession ? ttls.posMs : ttls.adminMs;
}
