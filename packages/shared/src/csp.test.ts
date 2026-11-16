import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { apiOriginOf, buildCsp } from './csp';

describe('Content-Security-Policy (ADR-001)', () => {
  it('REQ-AUTH-01: blocks inline scripts, plugins and framing; only the API is reachable', () => {
    const csp = buildCsp('http://localhost:3000');
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self' http://localhost:3000");
  });

  it('REQ-AUTH-01: nginx (Docker) serves exactly the same policy as buildCsp()', () => {
    const conf = readFileSync(join(__dirname, '../../../docker/nginx-spa.conf.template'), 'utf8');
    expect(conf).toContain(`set $csp "${buildCsp('${CSP_CONNECT_SRC}')}";`);
    const headers = readFileSync(join(__dirname, '../../../docker/security-headers.inc'), 'utf8');
    expect(headers).toContain('add_header Content-Security-Policy $csp always;');
    // every location must include the headers (add_header in a location drops inherited ones)
    const locations = conf.match(/location [^{]+\{[^}]*\}/g) ?? [];
    expect(locations.length).toBeGreaterThan(0);
    for (const loc of locations) expect(loc).toContain('include /etc/nginx/security-headers.inc;');
  });

  it('REQ-AUTH-01: connect-src uses the API origin without path', () => {
    expect(apiOriginOf('https://api.example.com/v1/')).toBe('https://api.example.com');
  });
});
