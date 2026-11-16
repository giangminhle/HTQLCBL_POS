import Dexie, { type EntityTable } from 'dexie';
import type { StoredSession } from '@retailchain/shared';

export const POS_DB_NAME = 'retailchain-pos';

/** Single-row table holding the cashier session (ADR-001: POS keeps tokens in IndexedDB). */
export interface SessionRow extends StoredSession {
  key: 'current';
  savedAt: string;
}

/**
 * Local IndexedDB for offline-first selling.
 * Never edit an existing version's schema — always add a new version so installed POS devices migrate.
 */
export class PosDatabase extends Dexie {
  session!: EntityTable<SessionRow, 'key'>;

  constructor(name: string = POS_DB_NAME) {
    super(name);
    this.version(1).stores({});
    // Sprint 1 (REQ-AUTH-01, REQ-POS-05): persisted login session.
    this.version(2).stores({ session: 'key' });
  }
}

export const db = new PosDatabase();
