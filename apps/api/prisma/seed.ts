import { PrismaClient } from '@prisma/client';
import { SEED_BRANCHES, SEED_USERS, seedDatabase } from './seed-data';

const prisma = new PrismaClient();

seedDatabase(prisma)
  .then(() => {
    console.log(
      `Seed done: ${SEED_BRANCHES.length} branches, ${SEED_USERS.length} users (see README for passwords)`,
    );
  })
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
