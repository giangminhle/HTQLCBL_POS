import { z } from 'zod';

export const Role = {
  OWNER: 'OWNER',
  BRANCH_MANAGER: 'BRANCH_MANAGER',
  CASHIER: 'CASHIER',
  WAREHOUSE_KEEPER: 'WAREHOUSE_KEEPER',
  ACCOUNTANT: 'ACCOUNTANT',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const ROLES = [
  Role.OWNER,
  Role.BRANCH_MANAGER,
  Role.CASHIER,
  Role.WAREHOUSE_KEEPER,
  Role.ACCOUNTANT,
] as const;
export const roleSchema = z.enum(ROLES);

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Chủ chuỗi',
  BRANCH_MANAGER: 'Quản lý chi nhánh',
  CASHIER: 'Thu ngân',
  WAREHOUSE_KEEPER: 'Thủ kho',
  ACCOUNTANT: 'Kế toán',
};

/** Higher number = more authority. Staff roles share the lowest rank. */
export function roleRank(role: Role): number {
  switch (role) {
    case Role.OWNER:
      return 3;
    case Role.BRANCH_MANAGER:
      return 2;
    default:
      return 1;
  }
}

/** Roles a BRANCH_MANAGER may create, assign, or reset passwords for (REQ-AUTH-01, REQ-AUTH-02). */
export const STAFF_ROLES: readonly Role[] = [Role.CASHIER, Role.WAREHOUSE_KEEPER, Role.ACCOUNTANT];
