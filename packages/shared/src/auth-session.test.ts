import { describe, expect, it, vi } from 'vitest';
import { createAuthSession, memoryStorageAdapter, type StoredSession } from './auth-session';

const user = {
  id: 'u1',
  username: 'cashier01',
  fullName: 'Thu Ngân',
  role: 'CASHIER' as const,
  branchId: 'b1',
  mustChangePassword: false,
};
const loginBody = (rt: string) => ({
  accessToken: `at-${rt}`,
  accessTokenExpiresIn: 900,
  refreshToken: rt,
  refreshTokenExpiresAt: '2026-12-31T00:00:00.000Z',
  user,
});
const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const stored = (rt = 'rt1'): StoredSession => ({
  accessToken: `at-${rt}`,
  refreshToken: rt,
  refreshTokenExpiresAt: '2026-12-31T00:00:00.000Z',
  user,
});

describe('createAuthSession', () => {
  it('REQ-AUTH-01: login stores the session and sends the client type', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(200, loginBody('rt1')));
    const storage = memoryStorageAdapter();
    const auth = createAuthSession({
      baseUrl: 'http://api',
      client: 'pos',
      storage,
      fetchImpl,
      onRefreshRejected: 'flag',
    });
    await auth.login('cashier01', 'pw');
    expect(JSON.parse((fetchImpl.mock.calls[0]?.[1] as RequestInit).body as string)).toMatchObject({
      client: 'pos',
    });
    expect((await storage.load())?.refreshToken).toBe('rt1');
    expect(auth.getSession()?.user.username).toBe('cashier01');
  });

  it('REQ-AUTH-01: concurrent 401s trigger a single refresh (no false reuse detection)', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).endsWith('/auth/refresh')) return json(200, loginBody('rt2'));
      return json(200, { ok: true });
    });
    const storage = memoryStorageAdapter(stored());
    const auth = createAuthSession({
      baseUrl: 'http://api',
      client: 'admin',
      storage,
      fetchImpl,
      onRefreshRejected: 'clear',
    });
    await auth.init();
    const results = await Promise.all([auth.refresh(), auth.refresh(), auth.refresh()]);
    expect(results).toEqual([true, true, true]);
    expect(fetchImpl.mock.calls.filter(([u]) => String(u).endsWith('/auth/refresh'))).toHaveLength(1);
    expect(auth.getSession()?.refreshToken).toBe('rt2');
  });

  it('REQ-AUTH-01: picks up a token rotated by another tab instead of refreshing again', async () => {
    const fetchImpl = vi.fn();
    const storage = memoryStorageAdapter(stored('rt1'));
    const auth = createAuthSession({
      baseUrl: 'http://api',
      client: 'admin',
      storage,
      fetchImpl,
      onRefreshRejected: 'clear',
    });
    await auth.init();
    await storage.save(stored('rt-from-other-tab'));
    await expect(auth.refresh()).resolves.toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(auth.getSession()?.refreshToken).toBe('rt-from-other-tab');
  });

  it('REQ-AUTH-01: admin clears the session when the refresh token is rejected', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(401, { code: 'INVALID_REFRESH_TOKEN', message: 'x' }));
    const storage = memoryStorageAdapter(stored());
    const auth = createAuthSession({
      baseUrl: 'http://api',
      client: 'admin',
      storage,
      fetchImpl,
      onRefreshRejected: 'clear',
    });
    await auth.init();
    await expect(auth.refresh()).resolves.toBe(false);
    expect(auth.getSession()).toBeNull();
    expect(await storage.load()).toBeNull();
  });

  it('REQ-POS-05: POS keeps the session and flags needsReauth when the refresh token is rejected', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(401, { code: 'INVALID_REFRESH_TOKEN', message: 'x' }));
    const storage = memoryStorageAdapter(stored());
    const auth = createAuthSession({
      baseUrl: 'http://api',
      client: 'pos',
      storage,
      fetchImpl,
      onRefreshRejected: 'flag',
    });
    await auth.init();
    await expect(auth.refresh()).resolves.toBe(false);
    expect(auth.getSession()).toMatchObject({ needsReauth: true, user: { username: 'cashier01' } });
  });

  it('REQ-POS-05: network failure during refresh keeps the session unchanged', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const storage = memoryStorageAdapter(stored());
    const auth = createAuthSession({
      baseUrl: 'http://api',
      client: 'pos',
      storage,
      fetchImpl,
      onRefreshRejected: 'flag',
    });
    await auth.init();
    await expect(auth.refresh()).resolves.toBe(false);
    expect(auth.getSession()).toEqual(stored());
  });

  it('REQ-AUTH-01: logout revokes on the server and clears locally; offline logout still clears', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(204));
    const storage = memoryStorageAdapter(stored());
    const auth = createAuthSession({
      baseUrl: 'http://api',
      client: 'admin',
      storage,
      fetchImpl,
      onRefreshRejected: 'clear',
    });
    await auth.init();
    await auth.logout();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api/auth/logout');
    expect(JSON.parse(init.body as string)).toEqual({ refreshToken: 'rt1' });
    expect(auth.getSession()).toBeNull();

    const offline = createAuthSession({
      baseUrl: 'http://api',
      client: 'pos',
      storage: memoryStorageAdapter(stored()),
      fetchImpl: vi.fn().mockRejectedValue(new TypeError('offline')),
      onRefreshRejected: 'flag',
    });
    await offline.init();
    await offline.logout();
    expect(offline.getSession()).toBeNull();
  });
});
