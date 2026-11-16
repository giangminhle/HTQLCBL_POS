// Runs in every test worker before modules are imported: ConfigModule validates env at import time.
import { loadTestEnv } from './load-test-env';

loadTestEnv();
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/unit_test';
