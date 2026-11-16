import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { seedDatabase } from '../prisma/seed-data';
import { assertTestDatabase, loadTestEnv } from './load-test-env';

/** Reset the *_test schema to the latest migrations and seed demo data, once per E2E run. */
export default async function globalSetup(): Promise<void> {
  loadTestEnv();
  const name = assertTestDatabase(process.env.DATABASE_URL);
  execSync('pnpm exec prisma migrate reset --force --skip-seed --skip-generate', {
    cwd: join(__dirname, '..'),
    env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    stdio: 'pipe',
  });
  const prisma = new PrismaClient();
  try {
    await seedDatabase(prisma);
  } finally {
    await prisma.$disconnect();
  }
  console.log(`\n[e2e] database ${name} reset and seeded`);
}
