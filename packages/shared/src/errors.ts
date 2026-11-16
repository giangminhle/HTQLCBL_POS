import { z } from 'zod';

/** Machine-readable error codes returned by the API. Extend per module. */
export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  // Auth (REQ-AUTH-01, REQ-AUTH-02)
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',
  REFRESH_TOKEN_REUSED: 'REFRESH_TOKEN_REUSED',
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  WRONG_PASSWORD: 'WRONG_PASSWORD',
  // Authorization
  BRANCH_FORBIDDEN: 'BRANCH_FORBIDDEN',
  ROLE_FORBIDDEN: 'ROLE_FORBIDDEN',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Unified error body: every non-2xx API response has this shape. */
export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
