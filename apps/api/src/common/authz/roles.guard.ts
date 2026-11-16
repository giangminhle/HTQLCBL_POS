import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode, type Role } from '@retailchain/shared';
import { forbidden } from '../http-errors';
import type { AuthenticatedRequest } from '../request-context';
import { IS_PUBLIC_KEY, ROLES_KEY } from './decorators';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (!roles || roles.length === 0) return true;

    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (user && roles.includes(user.role)) return true;
    throw forbidden(ErrorCode.ROLE_FORBIDDEN, 'Vai trò của bạn không được phép thực hiện thao tác này');
  }
}
