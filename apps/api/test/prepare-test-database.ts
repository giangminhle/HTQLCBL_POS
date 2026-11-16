/**
 * Safety gate for E2E: the schema is DROPPED and recreated before every run, so we must be certain we are
 * talking to the test database. Checked twice: the name in DATABASE_URL, and the database the server says
 * we are actually connected to (`SELECT current_database()`), which is printed on every run.
 */
export const EXPECTED_TEST_DATABASE = 'retailchain_test';

export interface PrepareDeps {
  databaseUrl: string | undefined;
  /** Returns the result of `SELECT current_database()` on the connection that reset will use. */
  currentDatabase: () => Promise<string>;
  reset: () => Promise<void>;
  seed: () => Promise<void>;
  log: (message: string) => void;
}

function fail(message: string): never {
  throw new Error(`[e2e] STOP: ${message}`);
}

export async function prepareTestDatabase(deps: PrepareDeps): Promise<void> {
  const url = deps.databaseUrl;
  if (!url) fail('DATABASE_URL is not set. Create apps/api/.env.test (see .env.test.example).');
  if (url.includes('CHANGE_ME')) fail('fill in the password in apps/api/.env.test (CHANGE_ME).');

  const parsed = new URL(url);
  const urlDb = parsed.pathname.replace(/^\//, '');
  deps.log(
    `[e2e] DATABASE_URL → ${parsed.hostname}:${parsed.port || '5432'}/${urlDb} (user ${parsed.username})`,
  );
  if (urlDb !== EXPECTED_TEST_DATABASE) {
    fail(`DATABASE_URL points to "${urlDb}", expected "${EXPECTED_TEST_DATABASE}". Nothing was reset.`);
  }

  const connected = await deps.currentDatabase();
  deps.log(`[e2e] Connected database: ${connected}`);
  if (connected !== EXPECTED_TEST_DATABASE) {
    fail(`connected to "${connected}", expected "${EXPECTED_TEST_DATABASE}". Nothing was reset.`);
  }

  deps.log(`[e2e] Resetting schema of ${connected} (prisma migrate reset) and seeding demo data…`);
  await deps.reset();
  await deps.seed();
  deps.log(`[e2e] ${connected} ready`);
}
