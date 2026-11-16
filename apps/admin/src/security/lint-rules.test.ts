// @vitest-environment node
import { join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = join(__dirname, '..', '..', '..', '..');

async function lint(code: string, file: string) {
  const eslint = new ESLint({ cwd: repoRoot });
  const [result] = await eslint.lintText(code, { filePath: join(repoRoot, file) });
  return result?.messages.filter((m) => m.ruleId === 'no-restricted-syntax') ?? [];
}

describe('ADR-001 lint rules (XSS hardening)', () => {
  it('REQ-AUTH-01: dangerouslySetInnerHTML is a lint error in admin and pos', async () => {
    const code = 'export const X = () => <div dangerouslySetInnerHTML={{ __html: "x" }} />;\n';
    for (const file of ['apps/admin/src/__probe.tsx', 'apps/pos/src/__probe.tsx']) {
      const msgs = await lint(code, file);
      expect(msgs).toHaveLength(1);
      expect(msgs[0]?.severity).toBe(2);
    }
  }, 30_000);

  it('REQ-AUTH-01: innerHTML assignment is a lint error', async () => {
    const msgs = await lint(
      'export function f(el: HTMLElement) { el.innerHTML = "x"; }\n',
      'apps/pos/src/__probe.ts',
    );
    expect(msgs).toHaveLength(1);
  }, 30_000);

  it('REQ-AUTH-01: plain JSX text passes', async () => {
    expect(
      await lint('export const X = () => <div>{"x"}</div>;\n', 'apps/admin/src/__probe.tsx'),
    ).toHaveLength(0);
  }, 30_000);
});
