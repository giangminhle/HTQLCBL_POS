import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { PosDatabase } from './index';

describe('PosDatabase', () => {
  it('REQ-POS-05: opens the local IndexedDB at schema version 1', async () => {
    const db = new PosDatabase('test-pos-db');
    await db.open();
    expect(db.isOpen()).toBe(true);
    expect(db.verno).toBe(1);
    db.close();
    await PosDatabase.delete('test-pos-db');
  });
});
