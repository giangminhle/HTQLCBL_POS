import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role, type AuthUser } from '@retailchain/shared';
import { BranchScopeGuard } from './branch-scope.guard';
import {
  assertBranchAccess,
  assertCanAssignRole,
  assertCanManageUser,
  branchFilter,
  canManageUser,
} from './branch-scope';
import { BranchScoped, Public, Roles } from './decorators';
import { RolesGuard } from './roles.guard';

const BRANCH_A = '00000000-0000-0000-0000-00000000000a';
const BRANCH_B = '00000000-0000-0000-0000-00000000000b';

const user = (role: Role, branchId: string | null, id = `${role}-${branchId}`): AuthUser => ({
  id,
  username: id,
  fullName: id,
  role,
  branchId,
  mustChangePassword: false,
});
const owner = user(Role.OWNER, null);
const managerA = user(Role.BRANCH_MANAGER, BRANCH_A);
const cashierA = user(Role.CASHIER, BRANCH_A);

/** Builds an ExecutionContext for a handler decorated with `decorators`. */
function contextFor(
  decorators: MethodDecorator[],
  req: { user?: AuthUser; params?: object; query?: object; body?: object },
): ExecutionContext {
  class TestController {
    handler() {}
  }
  const descriptor = Object.getOwnPropertyDescriptor(TestController.prototype, 'handler')!;
  for (const d of decorators) d(TestController.prototype, 'handler', descriptor);
  return {
    getHandler: () => TestController.prototype.handler,
    getClass: () => TestController,
    switchToHttp: () => ({ getRequest: () => ({ params: {}, query: {}, body: {}, ...req }) }),
  } as unknown as ExecutionContext;
}

function errorOf(fn: () => unknown): { status: number; code: string } {
  try {
    fn();
  } catch (e) {
    if (e instanceof HttpException) {
      return { status: e.getStatus(), code: (e.getResponse() as { code: string }).code };
    }
    throw e;
  }
  throw new Error('expected an exception');
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('REQ-AUTH-01: allows any authenticated user when no @Roles is set', () => {
    expect(guard.canActivate(contextFor([], { user: cashierA }))).toBe(true);
  });

  it('REQ-AUTH-01: allows a listed role', () => {
    expect(guard.canActivate(contextFor([Roles(Role.OWNER, Role.BRANCH_MANAGER)], { user: managerA }))).toBe(
      true,
    );
  });

  it('REQ-AUTH-01: rejects an unlisted role with 403 ROLE_FORBIDDEN', () => {
    const ctx = contextFor([Roles(Role.OWNER)], { user: cashierA });
    expect(errorOf(() => guard.canActivate(ctx))).toEqual({ status: 403, code: 'ROLE_FORBIDDEN' });
  });

  it('REQ-AUTH-01: skips role checks on @Public routes', () => {
    expect(guard.canActivate(contextFor([Public(), Roles(Role.OWNER)], {}))).toBe(true);
  });
});

describe('BranchScope (service-level helpers)', () => {
  it('REQ-AUTH-01: CASHIER of branch A accessing branch B data gets 403 BRANCH_FORBIDDEN', () => {
    expect(errorOf(() => assertBranchAccess(cashierA, BRANCH_B))).toEqual({
      status: 403,
      code: 'BRANCH_FORBIDDEN',
    });
  });

  it('REQ-AUTH-01: CASHIER of branch A may access branch A', () => {
    expect(() => assertBranchAccess(cashierA, BRANCH_A)).not.toThrow();
  });

  it('REQ-AUTH-01: non-OWNER cannot access records without a branch (OWNER-level data)', () => {
    expect(errorOf(() => assertBranchAccess(managerA, null)).status).toBe(403);
  });

  it('REQ-AUTH-01: OWNER accesses every branch', () => {
    expect(() => assertBranchAccess(owner, BRANCH_B)).not.toThrow();
    expect(() => assertBranchAccess(owner, null)).not.toThrow();
  });

  it('REQ-AUTH-01: list filter forces non-OWNER to their own branch and rejects other branches', () => {
    expect(branchFilter(cashierA, undefined)).toBe(BRANCH_A);
    expect(branchFilter(cashierA, BRANCH_A)).toBe(BRANCH_A);
    expect(errorOf(() => branchFilter(cashierA, BRANCH_B)).code).toBe('BRANCH_FORBIDDEN');
    expect(branchFilter(owner, undefined)).toBeUndefined();
    expect(branchFilter(owner, BRANCH_B)).toBe(BRANCH_B);
  });
});

describe('BranchScopeGuard (controller-level)', () => {
  const guard = new BranchScopeGuard(new Reflector());
  const scoped = BranchScoped({ source: 'params', key: 'branchId' });

  it('REQ-AUTH-01: CASHIER of branch A requesting /branches/B/... gets 403', () => {
    const ctx = contextFor([scoped], { user: cashierA, params: { branchId: BRANCH_B } });
    expect(errorOf(() => guard.canActivate(ctx))).toEqual({ status: 403, code: 'BRANCH_FORBIDDEN' });
  });

  it('REQ-AUTH-01: same-branch request passes', () => {
    expect(guard.canActivate(contextFor([scoped], { user: cashierA, params: { branchId: BRANCH_A } }))).toBe(
      true,
    );
  });

  it('REQ-AUTH-01: reads query and body sources too', () => {
    const q = contextFor([BranchScoped({ source: 'query', key: 'branchId' })], {
      user: managerA,
      query: { branchId: BRANCH_B },
    });
    expect(errorOf(() => guard.canActivate(q)).status).toBe(403);
    const b = contextFor([BranchScoped({ source: 'body', key: 'branchId' })], {
      user: owner,
      body: { branchId: BRANCH_B },
    });
    expect(guard.canActivate(b)).toBe(true);
  });

  it('REQ-AUTH-01: routes without @BranchScoped are not affected', () => {
    expect(guard.canActivate(contextFor([], { user: cashierA, params: { branchId: BRANCH_B } }))).toBe(true);
  });
});

describe('User management policy (REQ-AUTH-01, REQ-AUTH-02)', () => {
  const managerB = user(Role.BRANCH_MANAGER, BRANCH_B);
  const otherManagerA = user(Role.BRANCH_MANAGER, BRANCH_A, 'other-manager-a');
  const warehouseA = user(Role.WAREHOUSE_KEEPER, BRANCH_A);
  const cashierB = user(Role.CASHIER, BRANCH_B);

  it('REQ-AUTH-02: OWNER may manage (reset password of) anyone', () => {
    for (const t of [managerA, cashierB, user(Role.OWNER, null, 'owner-2')]) {
      expect(canManageUser(owner, t)).toBe(true);
    }
  });

  it('REQ-AUTH-02: BRANCH_MANAGER may manage lower roles in their own branch', () => {
    expect(canManageUser(managerA, cashierA)).toBe(true);
    expect(canManageUser(managerA, warehouseA)).toBe(true);
  });

  it('REQ-AUTH-02: BRANCH_MANAGER cannot manage an equal role (another manager) → ROLE_FORBIDDEN', () => {
    expect(errorOf(() => assertCanManageUser(managerA, otherManagerA)).code).toBe('ROLE_FORBIDDEN');
  });

  it('REQ-AUTH-02: BRANCH_MANAGER cannot manage OWNER', () => {
    expect(errorOf(() => assertCanManageUser(managerA, owner)).status).toBe(403);
  });

  it('REQ-AUTH-02: BRANCH_MANAGER cannot manage staff of another branch → BRANCH_FORBIDDEN', () => {
    expect(errorOf(() => assertCanManageUser(managerA, cashierB)).code).toBe('BRANCH_FORBIDDEN');
    expect(canManageUser(managerB, cashierA)).toBe(false);
  });

  it('REQ-AUTH-02: staff roles cannot manage anyone', () => {
    expect(canManageUser(cashierA, user(Role.CASHIER, BRANCH_A, 'c2'))).toBe(false);
  });

  it('REQ-AUTH-01: BRANCH_MANAGER may only assign staff roles in their own branch', () => {
    expect(() => assertCanAssignRole(managerA, Role.CASHIER, BRANCH_A)).not.toThrow();
    expect(errorOf(() => assertCanAssignRole(managerA, Role.BRANCH_MANAGER, BRANCH_A)).code).toBe(
      'ROLE_FORBIDDEN',
    );
    expect(errorOf(() => assertCanAssignRole(managerA, Role.OWNER, null)).code).toBe('ROLE_FORBIDDEN');
    expect(errorOf(() => assertCanAssignRole(managerA, Role.CASHIER, BRANCH_B)).code).toBe(
      'BRANCH_FORBIDDEN',
    );
    expect(() => assertCanAssignRole(owner, Role.BRANCH_MANAGER, BRANCH_B)).not.toThrow();
  });
});
