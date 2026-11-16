import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TokenExpiredError } from '@nestjs/jwt';
import { ErrorCode } from '@retailchain/shared';
import { ALLOW_PASSWORD_CHANGE_REQUIRED_KEY, IS_PUBLIC_KEY } from '../common/authz/decorators';
import { forbidden, unauthorized } from '../common/http-errors';
import type { AuthenticatedRequest } from '../common/request-context';
import { UsersService } from '../users/users.service';
import { AuthService, toAuthUser, type AccessTokenPayload } from './auth.service';

/**
 * Global guard. Verifies the Bearer token, then reloads the user so that deactivation, role changes,
 * password changes/resets (tokenVersion) take effect immediately instead of after token expiry.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw unauthorized(ErrorCode.UNAUTHORIZED, 'Vui lòng đăng nhập');

    let payload: AccessTokenPayload;
    try {
      payload = await this.auth.verifyAccessToken(token);
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        throw unauthorized(ErrorCode.TOKEN_EXPIRED, 'Phiên đăng nhập đã hết hạn');
      }
      throw unauthorized(ErrorCode.INVALID_TOKEN, 'Token không hợp lệ');
    }

    const user = await this.users.findAuthState(payload.sub);
    if (!user || !user.isActive || user.tokenVersion !== payload.ver) {
      throw unauthorized(ErrorCode.INVALID_TOKEN, 'Phiên đăng nhập đã bị thu hồi, vui lòng đăng nhập lại');
    }

    req.user = toAuthUser(user);
    req.authClient = payload.cl;

    // Decision (c): while a password change is pending, only change-password and logout are allowed.
    if (
      user.mustChangePassword &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_PASSWORD_CHANGE_REQUIRED_KEY, targets)
    ) {
      throw forbidden(ErrorCode.PASSWORD_CHANGE_REQUIRED, 'Bạn cần đổi mật khẩu trước khi tiếp tục');
    }
    return true;
  }
}
