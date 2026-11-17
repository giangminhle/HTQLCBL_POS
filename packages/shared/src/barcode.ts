/** GS1 check digit for an EAN-8/EAN-13 body (all digits except the last). */
export function eanCheckDigit(body: string): number {
  let sum = 0;
  // Weights 3,1,3,1… counted from the right-most digit of the body.
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[body.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEan(code: string): boolean {
  if (!/^\d{8}$|^\d{13}$/.test(code)) return false;
  return eanCheckDigit(code.slice(0, -1)) === Number(code[code.length - 1]);
}

/** Completes a 12-digit body into a valid EAN-13. */
export function toEan13(body12: string): string {
  if (!/^\d{12}$/.test(body12)) throw new Error('EAN-13 body must be 12 digits');
  return body12 + String(eanCheckDigit(body12));
}

export type BarcodeCheck = { ok: true } | { ok: false; message: string };

/**
 * Accepted barcodes (REQ-PRD-01): 8 or 13 digits must be a valid EAN-8/EAN-13; anything else must be an
 * internal code of 4–32 letters/digits/dashes and must not be all digits of EAN length.
 */
export function checkBarcode(code: string): BarcodeCheck {
  if (/^\d{8}$|^\d{13}$/.test(code)) {
    return isValidEan(code)
      ? { ok: true }
      : { ok: false, message: `Mã ${code} sai chữ số kiểm tra EAN-${code.length}` };
  }
  if (/^[A-Za-z0-9-]{4,32}$/.test(code)) return { ok: true };
  return { ok: false, message: `Mã vạch ${code} không hợp lệ (EAN-8, EAN-13 hoặc mã nội bộ 4–32 ký tự chữ/số)` };
}
