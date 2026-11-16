import type { AuthClient, AuthUser } from '@retailchain/shared';
import type { Request } from 'express';

/** Express request after JwtAuthGuard ran. */
export type AuthenticatedRequest = Request & {
  id?: string;
  user?: AuthUser;
  authClient?: AuthClient;
};

/** Who/where a request came from — passed to services that write audit logs or sessions. */
export interface RequestContext {
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export function requestContext(req: AuthenticatedRequest): RequestContext {
  const ua = req.headers['user-agent'];
  return {
    ip: req.ip ?? null,
    userAgent: typeof ua === 'string' ? ua.slice(0, 255) : null,
    requestId: typeof req.id === 'string' ? req.id : null,
  };
}
