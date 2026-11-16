import { randomInt } from 'node:crypto';
import * as argon2 from 'argon2';

// OWASP-recommended argon2id parameters (19 MiB, 2 iterations).
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;
/** Burn the same CPU time as a real check so response time does not reveal whether a username exists. */
export async function verifyAgainstDummy(plain: string): Promise<void> {
  dummyHash ??= hashPassword('dummy-password-for-timing-0');
  await verifyPassword(await dummyHash, plain);
}

// No look-alike characters (0/O, 1/l/I) — the password is read out or typed by staff.
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const ALL = LOWER + UPPER + DIGITS;

/** REQ-AUTH-02: 12-char temporary password, always containing lower, upper and digit (meets passwordSchema). */
export function generateTemporaryPassword(length = 12): string {
  const pick = (set: string) => set.charAt(randomInt(set.length));
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS)];
  while (chars.length < length) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j] as string, chars[i] as string];
  }
  return chars.join('');
}
