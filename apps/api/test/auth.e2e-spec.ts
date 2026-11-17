import { INestApplication } from '@nestjs/common';
import { loginResponseSchema } from '@retailchain/shared';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createTestApp, login, PASSWORDS } from './helpers';

const DAY = 86_400_000;

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerToken: string;
  let ch01Id: string;

  /** Creates a throw-away cashier in CH-01 so tests that lock/reset accounts don't affect seeded users. */
  async function createCashier(username: string, password = 'Initial@123') {
    const res = await request(app.getHttpServer())
      .post('/users')
      .set(bearer(ownerToken))
      .send({ username, fullName: username, role: 'CASHIER', branchId: ch01Id, password })
      .expect(201);
    return res.body as { id: string };
  }

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    ownerToken = (await login(app, 'owner', PASSWORDS.owner)).accessToken;
    ch01Id = (await prisma.branch.findUniqueOrThrow({ where: { code: 'CH-01' } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('REQ-AUTH-01: valid credentials return tokens and the user (no password hash)', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'cashier01', password: PASSWORDS.cashier })
        .expect(200);
      const body = loginResponseSchema.parse(res.body);
      expect(body.user).toMatchObject({ username: 'cashier01', role: 'CASHIER', mustChangePassword: false });
      expect(body.accessTokenExpiresIn).toBe(900);
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    });

    it('REQ-AUTH-01: username is case-insensitive', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'CASHIER01', password: PASSWORDS.cashier })
        .expect(200);
    });

    it('REQ-AUTH-01: wrong password and unknown user both return 401 INVALID_CREDENTIALS', async () => {
      const a = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'cashier02', password: 'wrong-pass1' })
        .expect(401);
      const b = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'ghost', password: 'wrong-pass1' })
        .expect(401);
      expect(a.body).toEqual(b.body);
      expect(a.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('REQ-AUTH-01: invalid body → 400 VALIDATION_ERROR with details', async () => {
      const res = await request(app.getHttpServer()).post('/auth/login').send({ username: '' }).expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(Array.isArray(res.body.details)).toBe(true);
    });

    it('REQ-AUTH-01: 5 wrong passwords lock the account for 15 minutes (423), even for the right password', async () => {
      const u = await createCashier('e2e.lockme');
      for (let i = 1; i <= 4; i++) {
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ username: 'e2e.lockme', password: 'Bad@pass1' })
          .expect(401);
      }
      const locked = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'e2e.lockme', password: 'Bad@pass1' })
        .expect(423);
      expect(locked.body.code).toBe('ACCOUNT_LOCKED');
      const until = new Date((locked.body.details as { lockedUntil: string }).lockedUntil).getTime();
      expect(until - Date.now()).toBeGreaterThan(14 * 60_000);
      expect(until - Date.now()).toBeLessThanOrEqual(15 * 60_000);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'e2e.lockme', password: 'Initial@123' })
        .expect(423);

      const logs = await prisma.auditLog.findMany({
        where: { entityId: u.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs.map((l) => l.action)).toEqual([
        'CREATE',
        'LOGIN_FAILED',
        'LOGIN_FAILED',
        'LOGIN_FAILED',
        'LOGIN_FAILED',
        'LOGIN_FAILED',
        'ACCOUNT_LOCKED',
      ]);
    });

    it('REQ-AUTH-01: POS cashier gets a 30-day refresh token; OWNER on POS gets 7 days', async () => {
      const pos = await login(app, 'cashier01', PASSWORDS.cashier, 'pos');
      const days = (iso: string) => Math.round((new Date(iso).getTime() - Date.now()) / DAY);
      expect(days(pos.refreshTokenExpiresAt)).toBe(30);
      const ownerPos = await login(app, 'owner', PASSWORDS.owner, 'pos');
      expect(days(ownerPos.refreshTokenExpiresAt)).toBe(7);
      const managerPos = await login(app, 'manager01', PASSWORDS.manager, 'pos');
      expect(days(managerPos.refreshTokenExpiresAt)).toBe(30);
    });

    it('REQ-AUTH-01: refresh tokens are stored hashed only', async () => {
      const res = await login(app, 'accountant01', PASSWORDS.accountant);
      const raw = await prisma.refreshToken.findMany({ where: { tokenHash: res.refreshToken } });
      expect(raw).toHaveLength(0);
      const all = await prisma.refreshToken.findMany({ select: { tokenHash: true } });
      expect(all.every((t) => /^[0-9a-f]{64}$/.test(t.tokenHash))).toBe(true);
    });
  });

  describe('protected routes', () => {
    it('REQ-AUTH-01: no token → 401 UNAUTHORIZED; bad token → 401 INVALID_TOKEN', async () => {
      expect((await request(app.getHttpServer()).get('/auth/me').expect(401)).body.code).toBe('UNAUTHORIZED');
      const bad = await request(app.getHttpServer()).get('/auth/me').set(bearer('abc.def.ghi')).expect(401);
      expect(bad.body.code).toBe('INVALID_TOKEN');
    });

    it('REQ-AUTH-01: GET /auth/me returns the current user', async () => {
      const { accessToken } = await login(app, 'manager01', PASSWORDS.manager);
      const res = await request(app.getHttpServer()).get('/auth/me').set(bearer(accessToken)).expect(200);
      expect(res.body).toMatchObject({ username: 'manager01', role: 'BRANCH_MANAGER', branchId: ch01Id });
    });

    it('REQ-NFR-01: /health stays public', async () => {
      await request(app.getHttpServer()).get('/health').expect(200);
    });
  });

  describe('POST /auth/refresh', () => {
    it('REQ-AUTH-01: rotates: the new token works, the old one is revoked', async () => {
      const first = await login(app, 'cashier02', PASSWORDS.cashier, 'pos');
      const second = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(200);
      expect(second.body.refreshToken).not.toBe(first.refreshToken);
      await request(app.getHttpServer()).get('/auth/me').set(bearer(second.body.accessToken)).expect(200);
      const third = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: second.body.refreshToken })
        .expect(200);
      expect(third.body.user.username).toBe('cashier02');
    });

    it('REQ-AUTH-01: reusing an old refresh token revokes ALL sessions of the user', async () => {
      await createCashier('e2e.reuse');
      // first login must change password — do it to get a normal session
      const initial = await login(app, 'e2e.reuse', 'Initial@123');
      const changed = await request(app.getHttpServer())
        .post('/auth/change-password')
        .set(bearer(initial.accessToken))
        .send({ currentPassword: 'Initial@123', newPassword: 'Changed@123' })
        .expect(200);

      const otherDevice = await login(app, 'e2e.reuse', 'Changed@123', 'pos');
      const rotated = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: changed.body.refreshToken })
        .expect(200);

      // attacker replays the already-rotated token
      const reuse = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: changed.body.refreshToken })
        .expect(401);
      expect(reuse.body.code).toBe('REFRESH_TOKEN_REUSED');

      // every session is gone: the legit rotated token, the other device, and current access tokens
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: rotated.body.refreshToken })
        .expect(401);
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: otherDevice.refreshToken })
        .expect(401);
      await request(app.getHttpServer()).get('/auth/me').set(bearer(otherDevice.accessToken)).expect(401);

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'REFRESH_TOKEN_REUSE', username: 'e2e.reuse' },
      });
      expect(audit).not.toBeNull();
    });
  });

  describe('POST /auth/logout', () => {
    it('REQ-AUTH-01: revokes the refresh token and audits LOGOUT', async () => {
      const s = await login(app, 'warehouse01', PASSWORDS.warehouse);
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set(bearer(s.accessToken))
        .send({ refreshToken: s.refreshToken })
        .expect(204);
      const after = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: s.refreshToken })
        .expect(401);
      // A logged-out token is dead, but presenting it is not treated as theft (it was never rotated).
      expect(after.body.code).toBe('INVALID_REFRESH_TOKEN');
      await login(app, 'warehouse01', PASSWORDS.warehouse);
    });

    it('REQ-AUTH-01: an old device refreshing after a password change does NOT kill the new session', async () => {
      const pos = await login(app, 'accountant01', PASSWORDS.accountant, 'pos');
      const admin = await login(app, 'accountant01', PASSWORDS.accountant);
      const changed = await request(app.getHttpServer())
        .post('/auth/change-password')
        .set(bearer(admin.accessToken))
        .send({ currentPassword: PASSWORDS.accountant, newPassword: 'Account@2027' })
        .expect(200);

      // the POS still holds its pre-change refresh token
      const old = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: pos.refreshToken })
        .expect(401);
      expect(old.body.code).toBe('INVALID_REFRESH_TOKEN');

      // the session created by the password change keeps working
      await request(app.getHttpServer()).get('/auth/me').set(bearer(changed.body.accessToken)).expect(200);
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: changed.body.refreshToken })
        .expect(200);

      // restore the seeded password for other tests
      const s = await login(app, 'accountant01', 'Account@2027');
      await request(app.getHttpServer())
        .post('/auth/change-password')
        .set(bearer(s.accessToken))
        .send({ currentPassword: 'Account@2027', newPassword: PASSWORDS.accountant })
        .expect(200);
    });
  });

  describe('POST /auth/change-password', () => {
    it('REQ-AUTH-01: new user must change the initial password; until then only change-password/logout work', async () => {
      await createCashier('e2e.firstlogin');
      const s = await login(app, 'e2e.firstlogin', 'Initial@123');
      expect(s.user.mustChangePassword).toBe(true);

      const blocked = await request(app.getHttpServer())
        .get('/auth/me')
        .set(bearer(s.accessToken))
        .expect(403);
      expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
      await request(app.getHttpServer()).get('/branches').set(bearer(s.accessToken)).expect(403);

      const wrong = await request(app.getHttpServer())
        .post('/auth/change-password')
        .set(bearer(s.accessToken))
        .send({ currentPassword: 'nope', newPassword: 'Brand@new1' })
        .expect(400);
      expect(wrong.body.code).toBe('WRONG_PASSWORD');

      const weak = await request(app.getHttpServer())
        .post('/auth/change-password')
        .set(bearer(s.accessToken))
        .send({ currentPassword: 'Initial@123', newPassword: 'short' })
        .expect(400);
      expect(weak.body.code).toBe('VALIDATION_ERROR');

      const ok = await request(app.getHttpServer())
        .post('/auth/change-password')
        .set(bearer(s.accessToken))
        .send({ currentPassword: 'Initial@123', newPassword: 'Brand@new1' })
        .expect(200);
      expect(ok.body.user.mustChangePassword).toBe(false);

      // old tokens are revoked, new ones work
      await request(app.getHttpServer()).get('/auth/me').set(bearer(s.accessToken)).expect(401);
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: s.refreshToken })
        .expect(401);
      await request(app.getHttpServer()).get('/auth/me').set(bearer(ok.body.accessToken)).expect(200);
      await login(app, 'e2e.firstlogin', 'Brand@new1');
    });
  });
});
