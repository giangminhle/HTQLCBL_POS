import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTestEnv } from './load-test-env';

describe('loadTestEnv', () => {
  const saved = process.env.DATABASE_URL;
  afterEach(() => {
    process.env.DATABASE_URL = saved;
  });

  it('REQ-NFR-01: .env.test overrides a DATABASE_URL already loaded from .env (bug: E2E pointed at retailchain_dev)', () => {
    // @prisma/client auto-loads apps/api/.env on import, before loadTestEnv() runs.
    process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/retailchain_dev';
    const dir = mkdtempSync(join(tmpdir(), 'envtest-'));
    const file = join(dir, '.env.test');
    writeFileSync(file, 'DATABASE_URL=postgresql://u:p@localhost:5432/retailchain_test\n');

    loadTestEnv(file);

    expect(process.env.DATABASE_URL).toBe('postgresql://u:p@localhost:5432/retailchain_test');
  });

  it('REQ-NFR-01: without a .env.test file (CI) the environment from the workflow is kept', () => {
    process.env.DATABASE_URL = 'postgresql://ci:ci@localhost:5432/retailchain_test';
    loadTestEnv(join(tmpdir(), 'does-not-exist', '.env.test'));
    expect(process.env.DATABASE_URL).toBe('postgresql://ci:ci@localhost:5432/retailchain_test');
  });
});
