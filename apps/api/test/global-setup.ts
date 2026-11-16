import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { seedDatabase } from '../prisma/seed-data';
import { loadTestEnv } from './load-test-env';
import { prepareTestDatabase } from './prepare-test-database';

/** Runs once per E2E run: verify we are on retailchain_test, reset the schema, seed demo data. */
export default async function globalSetup(): Promise<void> {
  loadTestEnv();
  const prisma = new PrismaClient();
  try {
    await prepareTestDatabase({
      databaseUrl: process.env.DATABASE_URL,
      currentDatabase: async () => {
        const rows = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
        return rows[0]?.db ?? '';
      },
      reset: async () => {
        execSync('pnpm exec prisma migrate reset --force --skip-seed --skip-generate', {
          cwd: join(__dirname, '..'),
          env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
          stdio: 'pipe',
        });
      },
      seed: () => seedDatabase(prisma),
      log: (m) => console.log(m),
    });
  } finally {
    await prisma.$disconnect();
  }
}
