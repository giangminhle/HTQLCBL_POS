import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  AuditAction,
  ErrorCode,
  type AuthClient,
  type AuthUser,
  type ChangePasswordRequest,
  type LoginResponse,
} from '@retailchain/shared';
import { AuditService } from '../audit/audit.service';
import { parseDuration } from '../common/duration';
import { apiError, badRequest, unauthorized } from '../common/http-errors';
import type { RequestContext } from '../common/request-context';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../common/security/password';
import type { Env } from '../config/env';
import { UsersService, type UserAuthState } from '../users/users.service';
import { LOCK_DURATION_MS, MAX_FAILED_LOGINS, refreshTtlFor, type RefreshTtls } from './auth.constants';
import { ConcurrentRotationError, fromDbClient, RefreshTokenService } from './refresh-token.service';

/** Access token claims. Role/branch are NOT trusted from the token: JwtAuthGuard reloads them. */
export interface AccessTokenPayload {
  sub: string;
  /** User.tokenVersion at issue time. */
  ver: number;
  cl: AuthClient;
}

const AUTH_ENTITY = 'User';

export function toAuthUser(u: UserAuthState): AuthUser {
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    branchId: u.branchId,
    mustChangePassword: u.mustChangePassword,
  };
}

@Injectable()
export class AuthService {
  private readonly accessTtlMs: number;
  private readonly refreshTtls: RefreshTtls;

  constructor(
    private readonly users: UsersService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    this.accessTtlMs = parseDuration(config.get('JWT_ACCESS_TTL', { infer: true }));
    this.refreshTtls = {
      adminMs: parseDuration(config.get('JWT_REFRESH_TTL_ADMIN', { infer: true })),
      posMs: parseDuration(config.get('JWT_REFRESH_TTL_POS', { infer: true })),
    };
  }

  async login(
    username: string,
    password: string,
    client: AuthClient,
    ctx: RequestContext,
    now = new Date(),
  ): Promise<LoginResponse> {
    const invalid = () =>
      unauthorized(ErrorCode.INVALID_CREDENTIALS, 'Tên đăng nhập hoặc mật khẩu không đúng');
    const user = await this.users.findForLogin(username);

    if (!user) {
      await verifyAgainstDummy(password);
      await this.audit.record({
        action: AuditAction.LOGIN_FAILED,
        entity: AUTH_ENTITY,
        after: { username, reason: 'UNKNOWN_USER' },
        context: ctx,
      });
      throw invalid();
    }

    const actor = { id: user.id, username: user.username };
    if (user.lockedUntil && user.lockedUntil > now) {
      throw this.lockedError(user.lockedUntil);
    }

    if (!(await verifyPassword(user.passwordHash, password))) {
      const failures = await this.users.incrementFailedLogins(user.id);
      await this.audit.record({
        action: AuditAction.LOGIN_FAILED,
        entity: AUTH_ENTITY,
        entityId: user.id,
        actor,
        branchId: user.branchId,
        after: { reason: 'WRONG_PASSWORD', failedLoginCount: failures },
        context: ctx,
      });
      if (failures >= MAX_FAILED_LOGINS) {
        const lockedUntil = new Date(now.getTime() + LOCK_DURATION_MS);
        await this.users.lock(user.id, lockedUntil);
        await this.audit.record({
          action: AuditAction.ACCOUNT_LOCKED,
          entity: AUTH_ENTITY,
          entityId: user.id,
          actor,
          branchId: user.branchId,
          after: { lockedUntil },
          context: ctx,
        });
        throw this.lockedError(lockedUntil);
      }
      throw invalid();
    }

    if (!user.isActive) {
      throw apiError(HttpStatus.FORBIDDEN, ErrorCode.ACCOUNT_DISABLED, 'Tài khoản đã bị ngưng hoạt động');
    }

    if (user.failedLoginCount > 0 || user.lockedUntil) await this.users.clearFailedLogins(user.id);
    const tokens = await this.issueTokens(user, client, ctx, now);
    await this.audit.record({
      action: AuditAction.LOGIN,
      entity: AUTH_ENTITY,
      entityId: user.id,
      actor,
      branchId: user.branchId,
      after: { client },
      context: ctx,
    });
    return tokens;
  }

  /** Rotation: every refresh revokes the presented token. Reusing a revoked token revokes ALL sessions (ADR-001). */
  async refresh(rawToken: string, ctx: RequestContext, now = new Date()): Promise<LoginResponse> {
    const invalid = () => unauthorized(ErrorCode.INVALID_REFRESH_TOKEN, 'Phiên đăng nhập không hợp lệ');
    const stored = await this.refreshTokens.findByToken(rawToken);
    if (!stored) throw invalid();

    if (stored.revokedAt) {
      // Only a token that was already ROTATED (has a successor) signals theft: both the thief and the owner
      // hold it. Tokens revoked by logout / password change / reset are simply dead — revoking every session
      // for them would log the user out of the device where they just changed their password.
      if (stored.replacedById) await this.handleReuse(stored.userId, ctx, now);
      throw invalid();
    }
    if (stored.expiresAt <= now) {
      throw unauthorized(
        ErrorCode.INVALID_REFRESH_TOKEN,
        'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại',
      );
    }

    const user = await this.users.findAuthState(stored.userId);
    if (!user || !user.isActive || user.tokenVersion !== stored.tokenVersion) {
      await this.refreshTokens.revoke(stored.id, now);
      throw invalid();
    }

    const client = fromDbClient(stored.client);
    try {
      const refresh = await this.refreshTokens.rotate(
        stored,
        {
          userId: user.id,
          client,
          tokenVersion: user.tokenVersion,
          ttlMs: refreshTtlFor(user.role, client, this.refreshTtls),
          context: ctx,
        },
        now,
      );
      return this.buildResponse(user, client, refresh);
    } catch (err) {
      if (err instanceof ConcurrentRotationError) await this.handleReuse(user.id, ctx, now);
      throw err;
    }
  }

  async logout(user: AuthUser, rawToken: string | undefined, ctx: RequestContext): Promise<void> {
    if (rawToken) {
      const stored = await this.refreshTokens.findByToken(rawToken);
      if (stored && stored.userId === user.id) await this.refreshTokens.revoke(stored.id);
    }
    await this.audit.record({
      action: AuditAction.LOGOUT,
      entity: AUTH_ENTITY,
      entityId: user.id,
      actor: user,
      branchId: user.branchId,
      context: ctx,
    });
  }

  /** Revokes every session, then issues a fresh pair for the current client so the user stays signed in. */
  async changePassword(
    user: AuthUser,
    client: AuthClient,
    dto: ChangePasswordRequest,
    ctx: RequestContext,
  ): Promise<LoginResponse> {
    const hash = await this.users.getPasswordHash(user.id);
    if (!hash || !(await verifyPassword(hash, dto.currentPassword))) {
      // 400, not 401: a wrong current password must not make the client think its session expired.
      throw badRequest('Mật khẩu hiện tại không đúng', ErrorCode.WRONG_PASSWORD);
    }
    const updated = await this.users.setOwnPassword(user.id, await hashPassword(dto.newPassword));
    await this.refreshTokens.revokeAllForUser(user.id);
    await this.audit.record({
      action: AuditAction.CHANGE_PASSWORD,
      entity: AUTH_ENTITY,
      entityId: user.id,
      actor: user,
      branchId: user.branchId,
      before: { mustChangePassword: user.mustChangePassword },
      after: { mustChangePassword: false },
      context: ctx,
    });
    return this.issueTokens(updated, client, ctx);
  }

  verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token);
  }

  // ---------- internals ----------

  private async issueTokens(
    user: UserAuthState,
    client: AuthClient,
    ctx: RequestContext,
    now = new Date(),
  ): Promise<LoginResponse> {
    const refresh = await this.refreshTokens.issue(
      {
        userId: user.id,
        client,
        tokenVersion: user.tokenVersion,
        ttlMs: refreshTtlFor(user.role, client, this.refreshTtls),
        context: ctx,
      },
      now,
    );
    return this.buildResponse(user, client, refresh);
  }

  private async buildResponse(
    user: UserAuthState,
    client: AuthClient,
    refresh: { token: string; expiresAt: Date },
  ): Promise<LoginResponse> {
    const payload: AccessTokenPayload = { sub: user.id, ver: user.tokenVersion, cl: client };
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: Math.floor(this.accessTtlMs / 1000),
    });
    return {
      accessToken,
      accessTokenExpiresIn: Math.floor(this.accessTtlMs / 1000),
      refreshToken: refresh.token,
      refreshTokenExpiresAt: refresh.expiresAt.toISOString(),
      user: toAuthUser(user),
    };
  }

  private async handleReuse(userId: string, ctx: RequestContext, now: Date): Promise<never> {
    await this.users.revokeAllSessions(userId);
    await this.refreshTokens.revokeAllForUser(userId, now);
    const user = await this.users.findAuthState(userId);
    await this.audit.record({
      action: AuditAction.REFRESH_TOKEN_REUSE,
      entity: AUTH_ENTITY,
      entityId: userId,
      actor: user ? { id: user.id, username: user.username } : null,
      branchId: user?.branchId ?? null,
      after: { revokedAllSessions: true },
      context: ctx,
    });
    throw unauthorized(
      ErrorCode.REFRESH_TOKEN_REUSED,
      'Phát hiện phiên đăng nhập bất thường. Mọi phiên đã bị thu hồi, vui lòng đăng nhập lại',
    );
  }

  private lockedError(lockedUntil: Date) {
    return apiError(
      423 as HttpStatus, // 423 Locked (not in Nest HttpStatus enum)
      ErrorCode.ACCOUNT_LOCKED,
      `Tài khoản tạm khóa do đăng nhập sai ${MAX_FAILED_LOGINS} lần. Thử lại sau 15 phút`,
      { lockedUntil: lockedUntil.toISOString() },
    );
  }
}
