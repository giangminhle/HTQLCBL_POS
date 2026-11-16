import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ErrorCode,
  Role,
  type AuthUser,
  type CreateUser,
  type Paginated,
  type ResetPasswordResponse,
  type UpdateUser,
  type UserQuery,
} from '@retailchain/shared';
import { AuditSnapshotRegistry } from '../audit/audit-snapshot.registry';
import {
  assertBranchAccess,
  assertCanAssignRole,
  assertCanManageUser,
  branchFilter,
} from '../common/authz/branch-scope';
import { badRequest, conflict, forbidden, notFound } from '../common/http-errors';
import { generateTemporaryPassword, hashPassword } from '../common/security/password';
import { BranchesService } from '../branches/branches.service';
import { PrismaService } from '../prisma/prisma.service';

export const USER_ENTITY = 'User';

/** Columns safe to return to clients and to store in audit logs. */
const PUBLIC_SELECT = {
  id: true,
  username: true,
  fullName: true,
  role: true,
  branchId: true,
  isActive: true,
  mustChangePassword: true,
  lockedUntil: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;
export type PublicUser = Prisma.UserGetPayload<{ select: typeof PUBLIC_SELECT }>;

/** What the auth module needs to authenticate a request (no password hash). */
const AUTH_STATE_SELECT = {
  id: true,
  username: true,
  fullName: true,
  role: true,
  branchId: true,
  isActive: true,
  mustChangePassword: true,
  tokenVersion: true,
} satisfies Prisma.UserSelect;
export type UserAuthState = Prisma.UserGetPayload<{ select: typeof AUTH_STATE_SELECT }>;

export type UserForLogin = UserAuthState & {
  passwordHash: string;
  failedLoginCount: number;
  lockedUntil: Date | null;
};

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branches: BranchesService,
    private readonly snapshots: AuditSnapshotRegistry,
  ) {}

  onModuleInit(): void {
    this.snapshots.register(USER_ENTITY, (id) =>
      this.prisma.user.findUnique({ where: { id }, select: PUBLIC_SELECT }),
    );
  }

  // ---------- Management API (REQ-AUTH-01, REQ-AUTH-02) ----------

  async list(actor: AuthUser, query: UserQuery): Promise<Paginated<PublicUser>> {
    const { page, pageSize } = query;
    const branchId = branchFilter(actor, query.branchId);
    const where: Prisma.UserWhereInput = {
      ...(branchId ? { branchId } : {}),
      ...(query.role ? { role: query.role } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.q
        ? {
            OR: [
              { username: { contains: query.q, mode: 'insensitive' } },
              { fullName: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: PUBLIC_SELECT,
        orderBy: { username: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(actor: AuthUser, id: string): Promise<PublicUser> {
    const user = await this.findPublic(id);
    assertBranchAccess(actor, user.branchId);
    return user;
  }

  async create(actor: AuthUser, dto: CreateUser): Promise<PublicUser> {
    // A manager creating staff may omit the branch: it defaults to their own.
    const branchId = actor.role === Role.BRANCH_MANAGER ? (dto.branchId ?? actor.branchId) : dto.branchId;
    assertCanAssignRole(actor, dto.role, branchId);
    await this.assertValidBranchForRole(dto.role, branchId);

    try {
      return await this.prisma.user.create({
        data: {
          username: dto.username,
          fullName: dto.fullName,
          role: dto.role,
          branchId,
          passwordHash: await hashPassword(dto.password),
          mustChangePassword: true, // decision (c): first login must change the initial password
        },
        select: PUBLIC_SELECT,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw conflict(`Tên đăng nhập ${dto.username} đã tồn tại`);
      }
      throw err;
    }
  }

  async update(actor: AuthUser, id: string, dto: UpdateUser): Promise<PublicUser> {
    const target = await this.findPublic(id);
    assertCanManageUser(actor, target);

    const role = dto.role ?? target.role;
    const branchId = dto.branchId !== undefined ? dto.branchId : target.branchId;
    const roleOrBranchChanged = role !== target.role || branchId !== target.branchId;
    const deactivated = dto.isActive === false && target.isActive;

    if (id === actor.id && (roleOrBranchChanged || deactivated)) {
      throw badRequest('Không thể tự đổi vai trò, chi nhánh hoặc tự khóa tài khoản của mình');
    }
    if (roleOrBranchChanged) {
      assertCanAssignRole(actor, role, branchId);
      await this.assertValidBranchForRole(role, branchId);
    }
    if (target.role === Role.OWNER && (role !== Role.OWNER || deactivated)) {
      await this.assertNotLastOwner(id);
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...dto,
        branchId,
        // Losing role/branch/active status revokes every session immediately.
        ...(roleOrBranchChanged || deactivated ? { tokenVersion: { increment: 1 } } : {}),
      },
      select: PUBLIC_SELECT,
    });
  }

  /**
   * REQ-AUTH-02 / CR-002: temporary password, must change at next login, unlock the account,
   * reset the failed-login counter and revoke all sessions.
   */
  async resetPassword(actor: AuthUser, id: string): Promise<ResetPasswordResponse> {
    if (id === actor.id) {
      throw badRequest('Dùng chức năng Đổi mật khẩu để đổi mật khẩu của chính bạn');
    }
    const target = await this.findPublic(id);
    assertCanManageUser(actor, target);

    const temporaryPassword = generateTemporaryPassword();
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
        passwordChangedAt: new Date(),
        failedLoginCount: 0,
        lockedUntil: null,
        tokenVersion: { increment: 1 },
      },
    });
    return { userId: id, temporaryPassword, mustChangePassword: true };
  }

  // ---------- Used by the auth module ----------

  findForLogin(username: string): Promise<UserForLogin | null> {
    return this.prisma.user.findUnique({
      where: { username: username.trim().toLowerCase() },
      select: { ...AUTH_STATE_SELECT, passwordHash: true, failedLoginCount: true, lockedUntil: true },
    });
  }

  findAuthState(id: string): Promise<UserAuthState | null> {
    return this.prisma.user.findUnique({ where: { id }, select: AUTH_STATE_SELECT });
  }

  /** Returns the new consecutive-failure count. */
  async incrementFailedLogins(id: string): Promise<number> {
    const { failedLoginCount } = await this.prisma.user.update({
      where: { id },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    return failedLoginCount;
  }

  async lock(id: string, until: Date): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { lockedUntil: until, failedLoginCount: 0 } });
  }

  async clearFailedLogins(id: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { failedLoginCount: 0, lockedUntil: null } });
  }

  /** Sets a new password chosen by the user; clears mustChangePassword and revokes every session. */
  setOwnPassword(id: string, passwordHash: string): Promise<UserAuthState> {
    return this.prisma.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
        tokenVersion: { increment: 1 },
      },
      select: AUTH_STATE_SELECT,
    });
  }

  async getPasswordHash(id: string): Promise<string | null> {
    const row = await this.prisma.user.findUnique({ where: { id }, select: { passwordHash: true } });
    return row?.passwordHash ?? null;
  }

  /** Invalidates every access and refresh token of the user (e.g. refresh-token reuse detected). */
  async revokeAllSessions(id: string): Promise<void> {
    await this.prisma.user.update({ where: { id }, data: { tokenVersion: { increment: 1 } } });
  }

  // ---------- helpers ----------

  private async findPublic(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: PUBLIC_SELECT });
    if (!user) throw notFound('Không tìm thấy người dùng');
    return user;
  }

  private async assertValidBranchForRole(role: Role, branchId: string | null): Promise<void> {
    if (role === Role.OWNER) {
      if (branchId !== null) throw badRequest('Chủ chuỗi không thuộc chi nhánh nào (branchId phải để trống)');
      return;
    }
    if (!branchId) throw badRequest('Vai trò này bắt buộc phải gán chi nhánh');
    if (!(await this.branches.isActiveBranch(branchId))) {
      throw badRequest('Chi nhánh không tồn tại hoặc đã ngưng hoạt động');
    }
  }

  private async assertNotLastOwner(id: string): Promise<void> {
    const others = await this.prisma.user.count({
      where: { role: Role.OWNER, isActive: true, id: { not: id } },
    });
    if (others === 0) {
      throw forbidden(ErrorCode.FORBIDDEN, 'Phải còn ít nhất một tài khoản Chủ chuỗi đang hoạt động');
    }
  }
}
