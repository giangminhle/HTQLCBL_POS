import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../request-context';
import { assertBranchAccess } from './branch-scope';
import { BRANCH_SCOPED_KEY, type BranchScopedOptions } from './decorators';

/** Enforces @BranchScoped(...) routes. Requests without a branch id in the given place pass through. */
@Injectable()
export class BranchScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<BranchScopedOptions | undefined>(BRANCH_SCOPED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.user) return true; // public route; JwtAuthGuard decides
    const container = req[options.source] as Record<string, unknown> | undefined;
    const value = container?.[options.key];
    if (value === undefined || value === null || value === '') return true;

    assertBranchAccess(req.user, String(value));
    return true;
  }
}
