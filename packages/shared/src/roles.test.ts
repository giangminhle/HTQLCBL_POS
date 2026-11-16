import { describe, expect, it } from 'vitest';
import { Role, roleRank, STAFF_ROLES } from './roles';

describe('roles', () => {
  it('REQ-AUTH-02: OWNER > BRANCH_MANAGER > staff roles (equal rank)', () => {
    expect(roleRank(Role.OWNER)).toBeGreaterThan(roleRank(Role.BRANCH_MANAGER));
    expect(roleRank(Role.BRANCH_MANAGER)).toBeGreaterThan(roleRank(Role.CASHIER));
    expect(new Set(STAFF_ROLES.map(roleRank)).size).toBe(1);
  });
});
