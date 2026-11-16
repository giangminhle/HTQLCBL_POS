import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';

/**
 * Loads apps/api/.env.test when present (local runs). In CI the variables come from the workflow.
 * Variables already set in the environment win.
 */
export function loadTestEnv(): void {
  const file = join(__dirname, '..', '.env.test');
  if (existsSync(file)) config({ path: file });
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
  process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-0123456789abcdef';
  process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-0123456789abcdef';
}

/** Refuse to touch any database whose name does not end with _test. */
export function assertTestDatabase(url: string | undefined): string {
  if (!url) throw new Error('DATABASE_URL is not set. Create apps/api/.env.test (see .env.test.example).');
  const name = new URL(url).pathname.replace(/^\//, '');
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to reset database "${name}": E2E tests only run on a database ending with _test.`,
    );
  }
  if (url.includes('CHANGE_ME')) throw new Error('Fill in the password in apps/api/.env.test (CHANGE_ME).');
  return name;
}
