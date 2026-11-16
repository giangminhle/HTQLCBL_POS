import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { dexieSessionAdapter } from '../lib/session-storage';
import { PosDatabase } from './index';

const session = {
  accessToken: 'at',
  refreshToken: 'rt',
  refreshTokenExpiresAt: '2030-01-01T00:00:00.000Z',
  user: {
    id: 'u1',
    username: 'cashier01',
    fullName: 'Thu Ngân',
    role: 'CASHIER' as const,
    branchId: 'b1',
    mustChangePassword: false,
  },
};

describe('PosDatabase', () => {
  it('REQ-POS-05: opens the local IndexedDB at schema version 2 with a session table', async () => {
    const db = new PosDatabase('test-pos-db');
    await db.open();
    expect(db.verno).toBe(2);
    expect(db.tables.map((t) => t.name)).toContain('session');
    db.close();
    await PosDatabase.delete('test-pos-db');
  });

  it('REQ-POS-05: the session survives closing and reopening the database (app restart offline)', async () => {
    const name = 'test-pos-session';
    const db1 = new PosDatabase(name);
    await dexieSessionAdapter(db1).save(session);
    db1.close();

    const db2 = new PosDatabase(name);
    const adapter = dexieSessionAdapter(db2);
    expect(await adapter.load()).toEqual(session);
    await adapter.clear();
    expect(await adapter.load()).toBeNull();
    db2.close();
    await PosDatabase.delete(name);
  });
});
