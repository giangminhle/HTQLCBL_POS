import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthClient as DbAuthClient, type RefreshToken } from '@prisma/client';
import { Role } from '@retailchain/shared';
import { hashPassword } from '../common/security/password';
import { LOCK_DURATION_MS, MAX_FAILED_LOGINS, refreshTtlFor } from './auth.constants';
import { AuthService } from './auth.service';
import { ConcurrentRotationError } from './refresh-token.service';

const DAY = 86_400_000;
const ctx = { ip: '127.0.0.1', userAgent: 'jest', requestId: 'req-1' };

async function errorOf(p: Promise<unknown>): Promise<{ status: number; code: string; details?: unknown }> {
  try {
    await p;
  } catch (e) {
    if (e instanceof HttpException) {
      const body = e.getResponse() as { code: string; details?: unknown };
      return { status: e.getStatus(), code: body.code, details: body.details };
    }
    throw e;
  }
  throw new Error('expected rejection');
}

describe('refreshTtlFor (ADR-001)', () => {
  const ttls = { adminMs: 7 * DAY, posMs: 30 * DAY };

  it('REQ-AUTH-01: POS app + CASHIER or BRANCH_MANAGER → 30 days', () => {
    expect(refreshTtlFor(Role.CASHIER, 'pos', ttls)).toBe(30 * DAY);
    expect(refreshTtlFor(Role.BRANCH_MANAGER, 'pos', ttls)).toBe(30 * DAY);
  });

  it('REQ-AUTH-01: OWNER is always 7 days, on every app', () => {
    expect(refreshTtlFor(Role.OWNER, 'pos', ttls)).toBe(7 * DAY);
    expect(refreshTtlFor(Role.OWNER, 'admin', ttls)).toBe(7 * DAY);
  });

  it('REQ-AUTH-01: admin web is 7 days; other roles on POS are 7 days', () => {
    expect(refreshTtlFor(Role.CASHIER, 'admin', ttls)).toBe(7 * DAY);
    expect(refreshTtlFor(Role.BRANCH_MANAGER, 'admin', ttls)).toBe(7 * DAY);
    expect(refreshTtlFor(Role.WAREHOUSE_KEEPER, 'pos', ttls)).toBe(7 * DAY);
  });
});

describe('AuthService', () => {
  let passwordHash: string;
  beforeAll(async () => {
    passwordHash = await hashPassword('Cashier@2026');
  });

  const baseUser = () => ({
    id: 'u1',
    username: 'cashier01',
    fullName: 'Thu Ngân',
    role: Role.CASHIER as Role,
    branchId: 'b1' as string | null,
    isActive: true,
    mustChangePassword: false,
    tokenVersion: 0,
    passwordHash,
    failedLoginCount: 0,
    lockedUntil: null as Date | null,
  });

  function setup(userOverrides: Partial<ReturnType<typeof baseUser>> = {}) {
    const state = { ...baseUser(), ...userOverrides };
    const users = {
      findForLogin: jest.fn(async () => state),
      findAuthState: jest.fn(async () => state),
      incrementFailedLogins: jest.fn(async () => ++state.failedLoginCount),
      lock: jest.fn(async (_id: string, until: Date) => {
        state.lockedUntil = until;
        state.failedLoginCount = 0;
      }),
      clearFailedLogins: jest.fn(async () => {
        state.failedLoginCount = 0;
        state.lockedUntil = null;
      }),
      revokeAllSessions: jest.fn(async () => {
        state.tokenVersion++;
      }),
      getPasswordHash: jest.fn(async () => state.passwordHash),
      setOwnPassword: jest.fn(async (_id: string, hash: string) => {
        state.passwordHash = hash;
        state.mustChangePassword = false;
        state.tokenVersion++;
        return state;
      }),
    };
    const refreshTokens = {
      issue: jest.fn(async (input: { ttlMs: number }, now = new Date()) => ({
        token: 'rt-new',
        expiresAt: new Date(now.getTime() + input.ttlMs),
      })),
      findByToken: jest.fn(),
      rotate: jest.fn(async (_old: RefreshToken, input: { ttlMs: number }, now = new Date()) => ({
        token: 'rt-rotated',
        expiresAt: new Date(now.getTime() + input.ttlMs),
      })),
      revoke: jest.fn(),
      revokeAllForUser: jest.fn(),
    };
    const audit = { record: jest.fn() };
    const config = {
      get: (key: string) =>
        ({ JWT_ACCESS_TTL: '15m', JWT_REFRESH_TTL_ADMIN: '7d', JWT_REFRESH_TTL_POS: '30d' })[key],
    } as unknown as ConfigService;
    const jwt = new JwtService({ secret: 'unit-test-secret-0123456789' });
    const service = new AuthService(
      users as never,
      refreshTokens as never,
      jwt,
      audit as never,
      config as never,
    );
    const actions = () => audit.record.mock.calls.map((c) => (c[0] as { action: string }).action);
    return { service, state, users, refreshTokens, audit, jwt, actions };
  }

  const storedToken = (overrides: Partial<RefreshToken> = {}): RefreshToken => ({
    id: 'rt-id',
    userId: 'u1',
    tokenHash: 'h',
    client: DbAuthClient.POS,
    tokenVersion: 0,
    expiresAt: new Date(Date.now() + DAY),
    revokedAt: null,
    replacedById: null,
    userAgent: null,
    ip: null,
    createdAt: new Date(),
    ...overrides,
  });

  describe('login', () => {
    it('REQ-AUTH-01: returns a 15-minute access token, refresh token and user, and audits LOGIN', async () => {
      const { service, jwt, actions } = setup();
      const res = await service.login('cashier01', 'Cashier@2026', 'admin', ctx);
      expect(res.accessTokenExpiresIn).toBe(15 * 60);
      expect(res.refreshToken).toBe('rt-new');
      expect(res.user).toMatchObject({ username: 'cashier01', role: 'CASHIER', mustChangePassword: false });
      expect(res.user).not.toHaveProperty('passwordHash');
      const payload = await jwt.verifyAsync<{
        sub: string;
        ver: number;
        cl: string;
        exp: number;
        iat: number;
      }>(res.accessToken);
      expect(payload).toMatchObject({ sub: 'u1', ver: 0, cl: 'admin' });
      expect(payload.exp - payload.iat).toBe(15 * 60);
      expect(actions()).toEqual(['LOGIN']);
    });

    it('REQ-AUTH-01: CASHIER from POS gets a 30-day refresh token', async () => {
      const { service } = setup();
      const now = new Date();
      const res = await service.login('cashier01', 'Cashier@2026', 'pos', ctx, now);
      expect(new Date(res.refreshTokenExpiresAt).getTime() - now.getTime()).toBe(30 * DAY);
    });

    it('REQ-AUTH-01: OWNER from POS still gets 7 days', async () => {
      const { service } = setup({ role: Role.OWNER, branchId: null });
      const now = new Date();
      const res = await service.login('cashier01', 'Cashier@2026', 'pos', ctx, now);
      expect(new Date(res.refreshTokenExpiresAt).getTime() - now.getTime()).toBe(7 * DAY);
    });

    it('REQ-AUTH-01: unknown username and wrong password give the same 401 INVALID_CREDENTIALS', async () => {
      const unknown = setup();
      unknown.users.findForLogin.mockResolvedValueOnce(null as never);
      const a = await errorOf(unknown.service.login('nobody', 'x', 'admin', ctx));
      const wrong = setup();
      const b = await errorOf(wrong.service.login('cashier01', 'wrong-pass', 'admin', ctx));
      expect(a).toEqual({ status: 401, code: 'INVALID_CREDENTIALS', details: undefined });
      expect(b).toEqual(a);
    });

    it(`REQ-AUTH-01: locks the account for 15 minutes on the ${MAX_FAILED_LOGINS}th wrong password`, async () => {
      const { service, state, actions } = setup();
      const now = new Date('2026-11-17T08:00:00Z');
      for (let i = 1; i < MAX_FAILED_LOGINS; i++) {
        expect((await errorOf(service.login('cashier01', 'bad', 'admin', ctx, now))).status).toBe(401);
      }
      const fifth = await errorOf(service.login('cashier01', 'bad', 'admin', ctx, now));
      expect(fifth.status).toBe(423);
      expect(fifth.code).toBe('ACCOUNT_LOCKED');
      expect(state.lockedUntil?.getTime()).toBe(now.getTime() + LOCK_DURATION_MS);
      expect(actions()).toContain('ACCOUNT_LOCKED');
      expect(actions().filter((a) => a === 'LOGIN_FAILED')).toHaveLength(MAX_FAILED_LOGINS);
    });

    it('REQ-AUTH-01: a locked account rejects even the correct password until the lock expires', async () => {
      const lockedUntil = new Date('2026-11-17T08:15:00Z');
      const { service } = setup({ lockedUntil });
      const during = await errorOf(
        service.login('cashier01', 'Cashier@2026', 'admin', ctx, new Date('2026-11-17T08:14:59Z')),
      );
      expect(during.code).toBe('ACCOUNT_LOCKED');
      const after = await service.login(
        'cashier01',
        'Cashier@2026',
        'admin',
        ctx,
        new Date('2026-11-17T08:15:01Z'),
      );
      expect(after.user.username).toBe('cashier01');
    });

    it('REQ-AUTH-01: a successful login resets the failed counter', async () => {
      const { service, users } = setup({ failedLoginCount: 3 });
      await service.login('cashier01', 'Cashier@2026', 'admin', ctx);
      expect(users.clearFailedLogins).toHaveBeenCalledWith('u1');
    });

    it('REQ-AUTH-01: deactivated account → 403 ACCOUNT_DISABLED (after a correct password)', async () => {
      const { service } = setup({ isActive: false });
      expect((await errorOf(service.login('cashier01', 'Cashier@2026', 'admin', ctx))).code).toBe(
        'ACCOUNT_DISABLED',
      );
    });

    it('REQ-AUTH-01: login reports mustChangePassword so the client forces a change', async () => {
      const { service } = setup({ mustChangePassword: true });
      const res = await service.login('cashier01', 'Cashier@2026', 'admin', ctx);
      expect(res.user.mustChangePassword).toBe(true);
    });
  });

  describe('refresh (rotation)', () => {
    it('REQ-AUTH-01: rotates the token and keeps the client TTL', async () => {
      const { service, refreshTokens } = setup();
      refreshTokens.findByToken.mockResolvedValue(storedToken());
      const now = new Date();
      const res = await service.refresh('rt-old', ctx, now);
      expect(res.refreshToken).toBe('rt-rotated');
      expect(refreshTokens.rotate).toHaveBeenCalledTimes(1);
      expect(new Date(res.refreshTokenExpiresAt).getTime() - now.getTime()).toBe(30 * DAY);
    });

    it('REQ-AUTH-01: reusing a revoked token revokes ALL sessions of the user and audits it', async () => {
      const { service, refreshTokens, users, state, actions } = setup();
      refreshTokens.findByToken.mockResolvedValue(storedToken({ revokedAt: new Date() }));
      const err = await errorOf(service.refresh('rt-old', ctx));
      expect(err).toMatchObject({ status: 401, code: 'REFRESH_TOKEN_REUSED' });
      expect(users.revokeAllSessions).toHaveBeenCalledWith('u1');
      expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('u1', expect.any(Date));
      expect(state.tokenVersion).toBe(1);
      expect(actions()).toEqual(['REFRESH_TOKEN_REUSE']);
      expect(refreshTokens.rotate).not.toHaveBeenCalled();
    });

    it('REQ-AUTH-01: a concurrent second rotation of the same token is treated as reuse', async () => {
      const { service, refreshTokens, users } = setup();
      refreshTokens.findByToken.mockResolvedValue(storedToken());
      refreshTokens.rotate.mockRejectedValueOnce(new ConcurrentRotationError());
      expect((await errorOf(service.refresh('rt-old', ctx))).code).toBe('REFRESH_TOKEN_REUSED');
      expect(users.revokeAllSessions).toHaveBeenCalled();
    });

    it('REQ-AUTH-01: unknown or expired token → 401 INVALID_REFRESH_TOKEN', async () => {
      const { service, refreshTokens } = setup();
      refreshTokens.findByToken.mockResolvedValueOnce(null);
      expect((await errorOf(service.refresh('nope', ctx))).code).toBe('INVALID_REFRESH_TOKEN');
      refreshTokens.findByToken.mockResolvedValueOnce(storedToken({ expiresAt: new Date(Date.now() - 1) }));
      expect((await errorOf(service.refresh('old', ctx))).code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('REQ-AUTH-02: a token issued before a password reset (older tokenVersion) is rejected', async () => {
      const { service, refreshTokens } = setup({ tokenVersion: 3 });
      refreshTokens.findByToken.mockResolvedValue(storedToken({ tokenVersion: 2 }));
      expect((await errorOf(service.refresh('rt', ctx))).code).toBe('INVALID_REFRESH_TOKEN');
      expect(refreshTokens.revoke).toHaveBeenCalledWith('rt-id', expect.any(Date));
    });
  });

  describe('changePassword', () => {
    const me = {
      id: 'u1',
      username: 'cashier01',
      fullName: 'x',
      role: Role.CASHIER,
      branchId: 'b1',
      mustChangePassword: true,
    };

    it('REQ-AUTH-01: verifies the current password, revokes all sessions, returns new tokens', async () => {
      const { service, refreshTokens, users, actions } = setup({ mustChangePassword: true });
      const res = await service.changePassword(
        me,
        'pos',
        { currentPassword: 'Cashier@2026', newPassword: 'NewPass@2027' },
        ctx,
      );
      expect(users.setOwnPassword).toHaveBeenCalled();
      expect(refreshTokens.revokeAllForUser).toHaveBeenCalledWith('u1');
      expect(res.user.mustChangePassword).toBe(false);
      expect(res.refreshToken).toBe('rt-new');
      expect(actions()).toEqual(['CHANGE_PASSWORD']);
    });

    it('REQ-AUTH-01: wrong current password → 400 WRONG_PASSWORD (not 401)', async () => {
      const { service, users } = setup();
      const err = await errorOf(
        service.changePassword(me, 'admin', { currentPassword: 'nope', newPassword: 'NewPass@2027' }, ctx),
      );
      expect(err).toMatchObject({ status: 400, code: 'WRONG_PASSWORD' });
      expect(users.setOwnPassword).not.toHaveBeenCalled();
    });
  });
});
