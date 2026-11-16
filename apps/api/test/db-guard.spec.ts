import { EXPECTED_TEST_DATABASE, prepareTestDatabase } from './prepare-test-database';

const URL_OK = 'postgresql://u:p@localhost:5432/retailchain_test?schema=public';

function deps(connectedDb: string, url = URL_OK) {
  const calls: string[] = [];
  const logs: string[] = [];
  return {
    calls,
    logs,
    run: () =>
      prepareTestDatabase({
        databaseUrl: url,
        currentDatabase: async () => {
          calls.push('query');
          return connectedDb;
        },
        reset: async () => {
          calls.push('reset');
        },
        seed: async () => {
          calls.push('seed');
        },
        log: (m) => logs.push(m),
      }),
  };
}

describe('E2E database guard', () => {
  it(`REQ-NFR-01: only ${EXPECTED_TEST_DATABASE} may be reset`, () => {
    expect(EXPECTED_TEST_DATABASE).toBe('retailchain_test');
  });

  it('REQ-NFR-01: prints the connected database, then resets and seeds when it is retailchain_test', async () => {
    const d = deps('retailchain_test');
    await d.run();
    expect(d.logs.some((l) => l.includes('retailchain_test'))).toBe(true);
    expect(d.calls).toEqual(['query', 'reset', 'seed']);
  });

  it('REQ-NFR-01: connected to another database (e.g. dev) → stops BEFORE reset', async () => {
    const d = deps('retailchain_dev');
    await expect(d.run()).rejects.toThrow(/retailchain_dev/);
    expect(d.calls).toEqual(['query']);
    expect(d.logs.some((l) => l.includes('retailchain_dev'))).toBe(true);
  });

  it('REQ-NFR-01: URL pointing to another database → stops without even connecting', async () => {
    const d = deps('retailchain_test', 'postgresql://u:p@localhost:5432/retailchain_dev');
    await expect(d.run()).rejects.toThrow(/retailchain_dev/);
    expect(d.calls).toEqual([]);
  });

  it('REQ-NFR-01: a different *_test database is also refused', async () => {
    const d = deps('other_test', 'postgresql://u:p@localhost:5432/other_test');
    await expect(d.run()).rejects.toThrow();
    expect(d.calls).toEqual([]);
  });

  it('REQ-NFR-01: placeholder password or missing URL is refused', async () => {
    await expect(deps('x', 'postgresql://u:CHANGE_ME@localhost:5432/retailchain_test').run()).rejects.toThrow(
      /CHANGE_ME/,
    );
    await expect(deps('x', '').run()).rejects.toThrow(/DATABASE_URL/);
  });

  it('REQ-NFR-01: never prints the password', async () => {
    const d = deps('retailchain_test', 'postgresql://u:SuperSecret1@localhost:5432/retailchain_test');
    await d.run();
    expect(d.logs.join('\n')).not.toContain('SuperSecret1');
  });
});
