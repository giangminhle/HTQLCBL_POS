import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';

/**
 * Loads apps/api/.env.test when present (local runs). In CI the variables come from the workflow.
 * When .env.test exists it OVERRIDES variables already loaded (e.g. from .env by Prisma).
 */
export function loadTestEnv(file = join(__dirname, '..', '.env.test')): void {
  // override: @prisma/client auto-loads apps/api/.env (dev DB) on import, before this runs.
  if (existsSync(file)) config({ path: file, override: true });
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
  process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-0123456789abcdef';
  process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-0123456789abcdef';
}
