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

  /** Status 0: the server could not be reached (offline, DNS, CORS). */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

export type QueryValue = string | number | boolean | Date | null | undefined;

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  /** Attach the Bearer token and retry once after a refresh on 401. Default true. */
  auth?: boolean;
}

export interface ApiClientOptions {
  fetchImpl?: typeof fetch;
  getAccessToken?: () => string | null | undefined;
  /**
   * Called when an authenticated request gets 401. Resolve `true` after refreshing tokens to retry
   * the request once; resolve `false` to surface the 401 to the caller.
   */
  onUnauthorized?: () => Promise<boolean>;
}

export interface ApiClient {
  get<T>(path: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, opts?: RequestOptions): Promise<T>;
  post<T>(
    path: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    body?: unknown,
    opts?: RequestOptions,
  ): Promise<T>;
  patch<T>(
    path: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    body?: unknown,
    opts?: RequestOptions,
  ): Promise<T>;
}

function buildQuery(query?: Record<string, QueryValue>): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, value instanceof Date ? value.toISOString() : String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

/**
 * Minimal fetch wrapper: validates responses with Zod and turns any failure into ApiRequestError.
 * Status 0 means the network is unreachable (offline) — the POS relies on this to stay in offline mode.
 */
export function createApiClient(baseUrl: string, options: ApiClientOptions | typeof fetch = {}): ApiClient {
  const opts: ApiClientOptions = typeof options === 'function' ? { fetchImpl: options } : options;
  const fetchImpl = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const root = baseUrl.replace(/\/+$/, '');

  async function send<T>(
    method: string,
    path: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    body: unknown,
    ro: RequestOptions = {},
    isRetry = false,
  ): Promise<T> {
    const useAuth = ro.auth !== false;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = useAuth ? opts.getAccessToken?.() : undefined;
    if (token) headers.Authorization = `Bearer ${token}`;

    let res: Response;
    try {
      res = await fetchImpl(`${root}${path}${buildQuery(ro.query)}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiRequestError(0, {
        code: ErrorCode.SERVICE_UNAVAILABLE,
        message: 'Không kết nối được máy chủ',
      });
    }

    if (res.status === 401 && useAuth && !isRetry && opts.onUnauthorized) {
      if (await opts.onUnauthorized()) return send(method, path, schema, body, ro, true);
    }

    const json: unknown = res.status === 204 ? undefined : await res.json().catch(() => undefined);
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
  }

  return {
    get: (path, schema, ro) => send('GET', path, schema, undefined, ro),
    post: (path, schema, body, ro) => send('POST', path, schema, body, ro),
    patch: (path, schema, body, ro) => send('PATCH', path, schema, body, ro),
  };
}
