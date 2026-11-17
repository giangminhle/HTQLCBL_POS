/**
 * RFC 9562 UUID v7 generator.
 * Uses 48-bit timestamp in milliseconds + 74 bits of cryptographically strong randomness.
 * Monotonically sorts by generation time.
 */
export function uuidv7(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);

  const timestamp = BigInt(Date.now());
  // 48-bit timestamp (bytes 0..5)
  bytes[0] = Number((timestamp >> 40n) & 0xffn);
  bytes[1] = Number((timestamp >> 32n) & 0xffn);
  bytes[2] = Number((timestamp >> 24n) & 0xffn);
  bytes[3] = Number((timestamp >> 16n) & 0xffn);
  bytes[4] = Number((timestamp >> 8n) & 0xffn);
  bytes[5] = Number(timestamp & 0xffn);

  // version 7: 0111xxxx
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  // variant 2 (RFC 4122/9562): 10xxxxxx
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  let hex = '';
  for (let i = 0; i < 16; i++) {
    const byte = bytes[i]!.toString(16).padStart(2, '0');
    hex += byte;
    if (i === 3 || i === 5 || i === 7 || i === 9) {
      hex += '-';
    }
  }
  return hex;
}

export function isValidUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}
