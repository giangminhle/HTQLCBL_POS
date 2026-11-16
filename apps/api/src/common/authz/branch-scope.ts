import { ErrorCode, Role, roleRank, STAFF_ROLES, type AuthUser } from '@retailchain/shared';
import { forbidden } from '../http-errors';

/**
 * Branch data isolation (CLAUDE.md rule 7): everyone except OWNER only sees their own branch.
 * These helpers are the authoritative check and must be called from services.
 */
export function canAccessBranch(user: Pick<AuthUser, 'role' | 'branchId'>, branchId: string | null): boolean {
  if (user.role === Role.OWNER) return true;
  return branchId !== null && user.branchId !== null && user.branchId === branchId;
}

export function assertBranchAccess(user: Pick<AuthUser, 'role' | 'branchId'>, branchId: string | null): void {
  if (!canAccessBranch(user, branchId)) {
    throw forbidden(ErrorCode.BRANCH_FORBIDDEN, 'Bạn không có quyền truy cập dữ liệu của chi nhánh này');
  }
}

/**
 * Branch filter for list queries. OWNER: the requested branch (or all when undefined).
 * Others: always their own branch; asking for another branch is a 403, not a silent empty list.
 */
export function branchFilter(
  user: Pick<AuthUser, 'role' | 'branchId'>,
  requested?: string,
): string | undefined {
  if (user.role === Role.OWNER) return requested;
  if (requested !== undefined) assertBranchAccess(user, requested);
  if (!user.branchId) {
    throw forbidden(ErrorCode.BRANCH_FORBIDDEN, 'Tài khoản chưa được gán chi nhánh');
  }
  return user.branchId;
}

type Actor = Pick<AuthUser, 'id' | 'role' | 'branchId'>;
type Target = { id: string; role: Role; branchId: string | null };

/**
 * May `actor` manage (update / reset password of) `target`?
 * OWNER: anyone. BRANCH_MANAGER: only lower-ranked users of the same branch. Others: nobody.
 */
export function canManageUser(actor: Actor, target: Target): boolean {
  if (actor.role === Role.OWNER) return true;
  if (actor.role !== Role.BRANCH_MANAGER) return false;
  return roleRank(target.role) < roleRank(actor.role) && canAccessBranch(actor, target.branchId);
}

export function assertCanManageUser(actor: Actor, target: Target): void {
  if (!canAccessBranch(actor, target.branchId) && actor.role !== Role.OWNER) {
    throw forbidden(ErrorCode.BRANCH_FORBIDDEN, 'Bạn không có quyền quản lý người dùng của chi nhánh khác');
  }
  if (!canManageUser(actor, target)) {
    throw forbidden(
      ErrorCode.ROLE_FORBIDDEN,
      'Bạn không có quyền quản lý người dùng có vai trò ngang hoặc cao hơn',
    );
  }
}

/** May `actor` give `role` in `branchId` to a user (create or update)? */
export function assertCanAssignRole(actor: Actor, role: Role, branchId: string | null): void {
  if (actor.role === Role.OWNER) return;
  if (actor.role !== Role.BRANCH_MANAGER || !STAFF_ROLES.includes(role)) {
    throw forbidden(
      ErrorCode.ROLE_FORBIDDEN,
      'Quản lý chi nhánh chỉ được gán vai trò Thu ngân, Thủ kho, Kế toán',
    );
  }
  assertBranchAccess(actor, branchId);
}
