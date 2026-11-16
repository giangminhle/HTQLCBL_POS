import type { SessionStorageAdapter, StoredSession } from '@retailchain/shared';
import type { PosDatabase } from '../db';

/** Stores the POS session in IndexedDB so it survives reloads and works offline. */
export function dexieSessionAdapter(db: PosDatabase): SessionStorageAdapter {
  return {
    async load() {
      const row = await db.session.get('current');
      if (!row) return null;
      const { key: _key, savedAt: _savedAt, ...session } = row;
      return session as StoredSession;
    },
    async save(session) {
      await db.session.put({ ...session, key: 'current', savedAt: new Date().toISOString() });
    },
    async clear() {
      await db.session.delete('current');
    },
  };
}
