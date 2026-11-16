import { INestApplication } from '@nestjs/common';
import { branchPageSchema, userPageSchema } from '@retailchain/shared';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createTestApp, login, PASSWORDS } from './helpers';

describe('Branches, users, audit (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: string;
  let manager01: string;
  let cashier01: string;
  let ch01: string;
  let ch02: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    owner = (await login(app, 'owner', PASSWORDS.owner)).accessToken;
    manager01 = (await login(app, 'manager01', PASSWORDS.manager)).accessToken;
    cashier01 = (await login(app, 'cashier01', PASSWORDS.cashier)).accessToken;
    ch01 = (await prisma.branch.findUniqueOrThrow({ where: { code: 'CH-01' } })).id;
    ch02 = (await prisma.branch.findUniqueOrThrow({ where: { code: 'CH-02' } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('branches (REQ-BR-01)', () => {
    it('REQ-BR-01: seed has 1 central warehouse and 3 stores; OWNER sees all', async () => {
      const res = await http().get('/branches').set(bearer(owner)).expect(200);
      const page = branchPageSchema.parse(res.body);
      expect(page.items.filter((b) => b.type === 'WAREHOUSE').map((b) => b.code)).toContain('KHO-TONG');
      expect(page.items.filter((b) => b.type === 'STORE').length).toBeGreaterThanOrEqual(3);
    });

    it('REQ-AUTH-01: non-OWNER only sees their own branch', async () => {
      const res = await http().get('/branches').set(bearer(cashier01)).expect(200);
      expect(res.body.items.map((b: { id: string }) => b.id)).toEqual([ch01]);
    });

    it('REQ-AUTH-01: CASHIER of CH-01 reading CH-02 → 403 BRANCH_FORBIDDEN', async () => {
      const res = await http().get(`/branches/${ch02}`).set(bearer(cashier01)).expect(403);
      expect(res.body.code).toBe('BRANCH_FORBIDDEN');
      await http().get(`/branches/${ch01}`).set(bearer(cashier01)).expect(200);
    });

    it('REQ-BR-01: OWNER creates and updates a branch; both are audited with before/after', async () => {
      const created = await http()
        .post('/branches')
        .set(bearer(owner))
        .send({ code: 'ch-99', name: 'Cửa hàng thử', address: '1 Test', type: 'STORE' })
        .expect(201);
      expect(created.body.code).toBe('CH-99');

      await http()
        .post('/branches')
        .set(bearer(owner))
        .send({ code: 'CH-99', name: 'Trùng', type: 'STORE' })
        .expect(409);

      const updated = await http()
        .patch(`/branches/${created.body.id}`)
        .set(bearer(owner))
        .send({ name: 'Cửa hàng đã đổi tên', isActive: false })
        .expect(200);
      expect(updated.body).toMatchObject({ name: 'Cửa hàng đã đổi tên', isActive: false });

      const logs = await prisma.auditLog.findMany({
        where: { entity: 'Branch', entityId: created.body.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs.map((l) => l.action)).toEqual(['CREATE', 'UPDATE']);
      expect(logs[1]?.before).toMatchObject({ name: 'Cửa hàng thử', isActive: true });
      expect(logs[1]?.after).toMatchObject({ name: 'Cửa hàng đã đổi tên', isActive: false });
      expect(logs[1]?.username).toBe('owner');
      expect(logs[1]?.branchId).toBe(created.body.id);
    });

    it('REQ-BR-01: only OWNER may create branches', async () => {
      const res = await http()
        .post('/branches')
        .set(bearer(manager01))
        .send({ code: 'CH-98', name: 'x', type: 'STORE' })
        .expect(403);
      expect(res.body.code).toBe('ROLE_FORBIDDEN');
    });
  });

  describe('users (REQ-AUTH-01)', () => {
    it('REQ-AUTH-01: BRANCH_MANAGER lists only users of their branch; asking for another branch → 403', async () => {
      const res = await http().get('/users').set(bearer(manager01)).expect(200);
      const page = userPageSchema.parse(res.body);
      expect(page.items.length).toBeGreaterThan(0);
      expect(page.items.every((u) => u.branchId === ch01)).toBe(true);
      await http().get('/users').query({ branchId: ch02 }).set(bearer(manager01)).expect(403);
    });

    it('REQ-AUTH-01: CASHIER cannot manage users', async () => {
      expect((await http().get('/users').set(bearer(cashier01)).expect(403)).body.code).toBe(
        'ROLE_FORBIDDEN',
      );
    });

    it('REQ-AUTH-01: BRANCH_MANAGER creates staff in own branch (branch defaults to own)', async () => {
      const res = await http()
        .post('/users')
        .set(bearer(manager01))
        .send({
          username: 'e2e.staff1',
          fullName: 'Nhân viên',
          role: 'WAREHOUSE_KEEPER',
          branchId: null,
          password: 'Initial@123',
        })
        .expect(201);
      expect(res.body).toMatchObject({ branchId: ch01, mustChangePassword: true });
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('REQ-AUTH-01: BRANCH_MANAGER cannot create users in another branch or with manager/owner roles', async () => {
      const otherBranch = await http()
        .post('/users')
        .set(bearer(manager01))
        .send({ username: 'e2e.x1', fullName: 'x', role: 'CASHIER', branchId: ch02, password: 'Initial@123' })
        .expect(403);
      expect(otherBranch.body.code).toBe('BRANCH_FORBIDDEN');
      const manager = await http()
        .post('/users')
        .set(bearer(manager01))
        .send({
          username: 'e2e.x2',
          fullName: 'x',
          role: 'BRANCH_MANAGER',
          branchId: ch01,
          password: 'Initial@123',
        })
        .expect(403);
      expect(manager.body.code).toBe('ROLE_FORBIDDEN');
    });

    it('REQ-AUTH-01: OWNER role must not have a branch; other roles must', async () => {
      await http()
        .post('/users')
        .set(bearer(owner))
        .send({ username: 'e2e.o2', fullName: 'x', role: 'OWNER', branchId: ch01, password: 'Initial@123' })
        .expect(400);
      await http()
        .post('/users')
        .set(bearer(owner))
        .send({ username: 'e2e.c9', fullName: 'x', role: 'CASHIER', branchId: null, password: 'Initial@123' })
        .expect(400);
    });

    it('REQ-AUTH-01: deactivating a user revokes their sessions immediately', async () => {
      const created = await http()
        .post('/users')
        .set(bearer(owner))
        .send({
          username: 'e2e.leaver',
          fullName: 'x',
          role: 'CASHIER',
          branchId: ch01,
          password: 'Initial@123',
        })
        .expect(201);
      const s = await login(app, 'e2e.leaver', 'Initial@123');
      await http()
        .patch(`/users/${created.body.id}`)
        .set(bearer(manager01))
        .send({ isActive: false })
        .expect(200);
      await http().post('/auth/logout').set(bearer(s.accessToken)).expect(401);
      const again = await http()
        .post('/auth/login')
        .send({ username: 'e2e.leaver', password: 'Initial@123' });
      expect(again.status).toBe(403);
      expect(again.body.code).toBe('ACCOUNT_DISABLED');
    });

    it('REQ-AUTH-01: users cannot demote or deactivate themselves', async () => {
      const me = await http().get('/auth/me').set(bearer(owner)).expect(200);
      await http().patch(`/users/${me.body.id}`).set(bearer(owner)).send({ isActive: false }).expect(400);
    });
  });

  describe('reset password (REQ-AUTH-02, CR-002)', () => {
    async function idOf(username: string) {
      return (await prisma.user.findUniqueOrThrow({ where: { username } })).id;
    }

    it('REQ-AUTH-02: manager resets a cashier: temp password, unlock, revoke sessions, force change, audit', async () => {
      const targetId = (
        await http()
          .post('/users')
          .set(bearer(owner))
          .send({
            username: 'e2e.forgot',
            fullName: 'x',
            role: 'CASHIER',
            branchId: ch01,
            password: 'Initial@123',
          })
          .expect(201)
      ).body.id as string;
      const oldSession = await login(app, 'e2e.forgot', 'Initial@123');
      // lock the account
      for (let i = 0; i < 5; i++) {
        await http().post('/auth/login').send({ username: 'e2e.forgot', password: 'Bad@pass1' });
      }
      expect((await prisma.user.findUniqueOrThrow({ where: { id: targetId } })).lockedUntil).not.toBeNull();

      const res = await http().post(`/users/${targetId}/reset-password`).set(bearer(manager01)).expect(200);
      expect(res.body).toMatchObject({ userId: targetId, mustChangePassword: true });
      const temp = res.body.temporaryPassword as string;
      expect(temp).toHaveLength(12);

      const row = await prisma.user.findUniqueOrThrow({ where: { id: targetId } });
      expect(row).toMatchObject({ lockedUntil: null, failedLoginCount: 0, mustChangePassword: true });

      // old sessions revoked
      await http().post('/auth/refresh').send({ refreshToken: oldSession.refreshToken }).expect(401);

      // log in with the temp password → must change before anything else
      const s = await login(app, 'e2e.forgot', temp);
      expect(s.user.mustChangePassword).toBe(true);
      expect((await http().get('/branches').set(bearer(s.accessToken)).expect(403)).body.code).toBe(
        'PASSWORD_CHANGE_REQUIRED',
      );
      const changed = await http()
        .post('/auth/change-password')
        .set(bearer(s.accessToken))
        .send({ currentPassword: temp, newPassword: 'Mine@2027' })
        .expect(200);
      await http().get('/branches').set(bearer(changed.body.accessToken)).expect(200);

      const log = await prisma.auditLog.findFirstOrThrow({
        where: { action: 'RESET_PASSWORD', entityId: targetId },
      });
      expect(log.username).toBe('manager01');
      expect(log.before).toMatchObject({ mustChangePassword: true });
      expect(log.after).toMatchObject({ lockedUntil: null, mustChangePassword: true });
      expect(JSON.stringify(log)).not.toContain(temp);
    });

    it('REQ-AUTH-02: manager cannot reset another manager, the owner, or staff of another branch', async () => {
      const m2 = await http()
        .post(`/users/${await idOf('manager02')}/reset-password`)
        .set(bearer(manager01))
        .expect(403);
      expect(m2.body.code).toBe('BRANCH_FORBIDDEN');
      await http()
        .post(`/users/${await idOf('owner')}/reset-password`)
        .set(bearer(manager01))
        .expect(403);
      const c2 = await http()
        .post(`/users/${await idOf('cashier02')}/reset-password`)
        .set(bearer(manager01))
        .expect(403);
      expect(c2.body.code).toBe('BRANCH_FORBIDDEN');
    });

    it('REQ-AUTH-02: manager cannot reset a same-branch user of equal rank', async () => {
      const peer = await http()
        .post('/users')
        .set(bearer(owner))
        .send({
          username: 'e2e.manager1b',
          fullName: 'x',
          role: 'BRANCH_MANAGER',
          branchId: ch01,
          password: 'Initial@123',
        })
        .expect(201);
      const res = await http()
        .post(`/users/${peer.body.id}/reset-password`)
        .set(bearer(manager01))
        .expect(403);
      expect(res.body.code).toBe('ROLE_FORBIDDEN');
    });

    it('REQ-AUTH-02: OWNER can reset anyone; nobody resets their own password this way', async () => {
      await http()
        .post(`/users/${await idOf('manager02')}/reset-password`)
        .set(bearer(owner))
        .expect(200);
      await http()
        .post(`/users/${await idOf('owner')}/reset-password`)
        .set(bearer(owner))
        .expect(400);
    });

    it('REQ-AUTH-02: CASHIER cannot reset passwords', async () => {
      await http()
        .post(`/users/${await idOf('accountant01')}/reset-password`)
        .set(bearer(cashier01))
        .expect(403);
    });
  });

  describe('audit logs (REQ-AUD-01)', () => {
    it('REQ-AUD-01: OWNER sees all logs, filterable by action', async () => {
      const res = await http()
        .get('/audit-logs')
        .query({ action: 'LOGIN', pageSize: 100 })
        .set(bearer(owner))
        .expect(200);
      expect(res.body.total).toBeGreaterThan(0);
      expect(res.body.items.every((l: { action: string }) => l.action === 'LOGIN')).toBe(true);
    });

    it('REQ-AUD-01: BRANCH_MANAGER sees only logs of their branch', async () => {
      const res = await http().get('/audit-logs').query({ pageSize: 100 }).set(bearer(manager01)).expect(200);
      expect(res.body.items.length).toBeGreaterThan(0);
      expect(res.body.items.every((l: { branchId: string }) => l.branchId === ch01)).toBe(true);
      await http().get('/audit-logs').query({ branchId: ch02 }).set(bearer(manager01)).expect(403);
    });

    it('REQ-AUD-01: CASHIER cannot read audit logs', async () => {
      await http().get('/audit-logs').set(bearer(cashier01)).expect(403);
    });

    it('REQ-AUD-01: audit logs never contain password hashes or tokens', async () => {
      const rows = await prisma.auditLog.findMany();
      const dump = JSON.stringify(rows);
      expect(dump).not.toMatch(/\$argon2id\$/);
    });
  });
});
