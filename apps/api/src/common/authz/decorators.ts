import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthUser, Role } from '@retailchain/shared';
import type { AuthenticatedRequest } from '../request-context';

export const IS_PUBLIC_KEY = 'authz:isPublic';
export const ROLES_KEY = 'authz:roles';
export const ALLOW_PASSWORD_CHANGE_REQUIRED_KEY = 'authz:allowPasswordChangeRequired';
export const BRANCH_SCOPED_KEY = 'authz:branchScoped';

/** Skip JWT authentication (login, refresh, health). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Only these roles may call the endpoint. No decorator = any authenticated user. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Endpoint stays reachable while the user must change their password (change-password, logout). */
export const AllowWhenPasswordChangeRequired = () => SetMetadata(ALLOW_PASSWORD_CHANGE_REQUIRED_KEY, true);

export interface BranchScopedOptions {
  /** Where the branch id is read from. */
  source: 'params' | 'query' | 'body';
  /** Field name holding the branch id. */
  key: string;
}
/**
 * Controller-level guard: reject non-OWNER users whose branch differs from the requested one.
 * Defence in depth only — services must still call assertBranchAccess / branchFilter.
 */
export const BranchScoped = (options: BranchScopedOptions) => SetMetadata(BRANCH_SCOPED_KEY, options);

/** Injects the authenticated user (set by JwtAuthGuard). */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!req.user) throw new Error('CurrentUser used on a public route');
  return req.user;
});
