/**
 * Content-Security-Policy for admin and POS (ADR-001). Single source of truth:
 * used by `vite preview` and checked against docker/nginx-spa.conf.template by a unit test.
 * `vite dev` does NOT apply it (HMR needs inline scripts).
 */
export function buildCsp(apiOrigin: string): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self' ${apiOrigin}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** Origin part of the API URL (connect-src must not contain a path). */
export function apiOriginOf(apiUrl: string): string {
  return new URL(apiUrl).origin;
}
