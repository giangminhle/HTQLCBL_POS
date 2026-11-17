import { BranchType, PrismaClient, Role } from '@prisma/client';
import { hashPassword } from '../src/common/security/password';
import { seedCatalog } from './seed-catalog';

/**
 * Demo data (also used by E2E tests). Passwords are documented in README — development only.
 * Idempotent: existing branches/users are left untouched (passwords are not reset on re-run).
 */
export const SEED_BRANCHES = [
  { code: 'KHO-TONG', name: 'Kho tổng', address: 'KCN Tân Bình, TP.HCM', type: BranchType.WAREHOUSE },
  { code: 'CH-01', name: 'Cửa hàng Quận 1', address: '12 Lê Lợi, Quận 1, TP.HCM', type: BranchType.STORE },
  {
    code: 'CH-02',
    name: 'Cửa hàng Quận 3',
    address: '45 Võ Văn Tần, Quận 3, TP.HCM',
    type: BranchType.STORE,
  },
  { code: 'CH-03', name: 'Cửa hàng Thủ Đức', address: '8 Võ Văn Ngân, TP. Thủ Đức', type: BranchType.STORE },
] as const;

export const SEED_USERS = [
  { username: 'owner', fullName: 'Nguyễn Văn Chủ', role: Role.OWNER, branch: null, password: 'Owner@2026' },
  {
    username: 'manager01',
    fullName: 'Trần Thị Quản Lý',
    role: Role.BRANCH_MANAGER,
    branch: 'CH-01',
    password: 'Manager@2026',
  },
  {
    username: 'manager02',
    fullName: 'Phạm Văn Quản Lý',
    role: Role.BRANCH_MANAGER,
    branch: 'CH-02',
    password: 'Manager@2026',
  },
  {
    username: 'cashier01',
    fullName: 'Lê Văn Thu Ngân',
    role: Role.CASHIER,
    branch: 'CH-01',
    password: 'Cashier@2026',
  },
  {
    username: 'cashier02',
    fullName: 'Hoàng Thị Thu Ngân',
    role: Role.CASHIER,
    branch: 'CH-02',
    password: 'Cashier@2026',
  },
  {
    username: 'warehouse01',
    fullName: 'Võ Văn Thủ Kho',
    role: Role.WAREHOUSE_KEEPER,
    branch: 'KHO-TONG',
    password: 'Warehouse@2026',
  },
  {
    username: 'accountant01',
    fullName: 'Đặng Thị Kế Toán',
    role: Role.ACCOUNTANT,
    branch: 'CH-01',
    password: 'Accountant@2026',
  },
] as const;

export async function seedDatabase(prisma: PrismaClient): Promise<void> {
  const branchIds = new Map<string, string>();
  for (const b of SEED_BRANCHES) {
    const row = await prisma.branch.upsert({ where: { code: b.code }, update: {}, create: b });
    branchIds.set(b.code, row.id);
  }

  for (const u of SEED_USERS) {
    const exists = await prisma.user.findUnique({ where: { username: u.username }, select: { id: true } });
    if (exists) continue;
    await prisma.user.create({
      data: {
        username: u.username,
        fullName: u.fullName,
        role: u.role,
        branchId: u.branch ? (branchIds.get(u.branch) ?? null) : null,
        passwordHash: await hashPassword(u.password),
        mustChangePassword: false,
      },
    });
  }

  await seedCatalog(prisma, branchIds);

  await prisma.appMeta.upsert({
    where: { key: 'seed_version' },
    update: { value: '2' },
    create: { key: 'seed_version', value: '2' },
  });
}
