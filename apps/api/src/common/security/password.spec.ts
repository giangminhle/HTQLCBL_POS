import { passwordSchema } from '@retailchain/shared';
import { generateTemporaryPassword, hashPassword, verifyPassword } from './password';

describe('password helpers', () => {
  it('REQ-AUTH-01: hashes with argon2id and verifies', async () => {
    const hash = await hashPassword('Secret@123');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(verifyPassword(hash, 'Secret@123')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'wrong')).resolves.toBe(false);
    await expect(verifyPassword('not-a-hash', 'x')).resolves.toBe(false);
  });

  it('REQ-AUTH-02: temporary passwords are 12 chars, satisfy the password policy and differ each time', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = generateTemporaryPassword();
      expect(p).toHaveLength(12);
      expect(passwordSchema.safeParse(p).success).toBe(true);
      expect(p).not.toMatch(/[0O1lI]/);
      seen.add(p);
    }
    expect(seen.size).toBe(200);
  });
});
