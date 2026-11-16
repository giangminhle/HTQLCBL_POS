import Dexie from 'dexie';

export const POS_DB_NAME = 'retailchain-pos';

/**
 * Local IndexedDB for offline-first selling.
 * Sprint 0: no tables yet. Later sprints bump the version and add stores, e.g.
 *   this.version(2).stores({ invoices: 'id, status, createdAt', outbox: '++seq, entityId, createdAt' });
 * Never edit an existing version's schema — always add a new version so installed POS devices migrate.
 */
export class PosDatabase extends Dexie {
  constructor(name: string = POS_DB_NAME) {
    super(name);
    this.version(1).stores({});
  }
}

export const db = new PosDatabase();
