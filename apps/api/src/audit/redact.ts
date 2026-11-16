const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'currentPassword',
  'newPassword',
  'temporaryPassword',
  'token',
  'tokenHash',
  'accessToken',
  'refreshToken',
  'tokenVersion',
]);

export const REDACTED = '[REDACTED]';

/** Deep-copies a JSON-like value, replacing sensitive fields. Dates become ISO strings. */
export function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k) ? REDACTED : redact(v);
    }
    return out;
  }
  return value;
}
