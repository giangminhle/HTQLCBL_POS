import { Role, type StoredSession } from '@retailchain/shared';

/**
 * What the POS screen should do with the stored session (ADR-001, REQ-POS-05).
 * - none:          no session → login page
 * - change-password: server requires a new password → only possible online
 * - offline:       session kept, no network → keep selling (token expiry does not matter offline)
 * - needs-reauth:  server rejected the refresh token → keep selling, ask to log in again to sync
 * - active:        normal online session
 */
export type PosSessionStatus = 'none' | 'change-password' | 'offline' | 'needs-reauth' | 'active';

export function posSessionStatus(session: StoredSession | null, online: boolean): PosSessionStatus {
  if (!session) return 'none';
  if (session.user.mustChangePassword) return 'change-password';
  if (!online) return 'offline';
  if (session.needsReauth) return 'needs-reauth';
  return 'active';
}

/** Selling is allowed whenever a cashier session exists and no password change is pending. */
export function canSell(status: PosSessionStatus): boolean {
  return status === 'active' || status === 'offline' || status === 'needs-reauth';
}

/** Roles that may sign in on the POS app. */
export const POS_ROLES: readonly Role[] = [Role.CASHIER];
