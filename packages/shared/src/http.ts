import type { z } from 'zod';
import { ApiError, apiErrorSchema, ErrorCode } from './errors';

/** Error thrown by the frontend API client; carries the unified API error body. */
export class ApiRequestError extends Error implements ApiError {
  readonly code: string;
  readonly details?: unknown;
  readonly status: number;

  constructor(status: number, body: ApiError) {
    super(body.message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

export interface ApiClient {
  get<T>(path: string, schema: z.ZodType<T>): Promise<T>;
}

/**
 * Minimal fetch wrapper: validates responses with Zod and turns any failure into ApiRequestError.
 * Status 0 means the network is unreachable (offline) — the POS relies on this to switch to offline mode.
 */
export function createApiClient(baseUrl: string, fetchImpl: typeof fetch = (...a) => fetch(...a)): ApiClient {
  const root = baseUrl.replace(/\/+$/, '');

  return {
    async get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
      let res: Response;
      try {
        res = await fetchImpl(`${root}${path}`, { headers: { Accept: 'application/json' } });
      } catch {
        throw new ApiRequestError(0, {
          code: ErrorCode.SERVICE_UNAVAILABLE,
          message: 'Không kết nối được máy chủ',
        });
      }
      const json: unknown = await res.json().catch(() => undefined);
      if (!res.ok) {
        const parsed = apiErrorSchema.safeParse(json);
        throw new ApiRequestError(
          res.status,
          parsed.success ? parsed.data : { code: ErrorCode.INTERNAL_ERROR, message: `HTTP ${res.status}` },
        );
      }
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        throw new ApiRequestError(res.status, {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'Phản hồi từ máy chủ không đúng định dạng',
          details: parsed.error.issues,
        });
      }
      return parsed.data;
    },
  };
}
