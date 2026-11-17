import { describe, expect, it } from 'vitest';
import { calculateCartSummary, calculateCashChange, calculateLineTotal, isDiscountOverLimit } from './sales';
import { isValidUuid, uuidv7 } from './uuid';

describe('UUID v7 (RFC 9562)', () => {
  it('generates valid UUID v7 format', () => {
    const id = uuidv7();
    expect(isValidUuid(id)).toBe(true);
    // UUID v7 has 7 as the 13th character (index 14 with hyphens: xxxxxxxx-xxxx-7xxx-...)
    expect(id[14]).toBe('7');
    // Variant 1 (RFC 4122) has 8, 9, a, or b as the 17th character (index 19 with hyphens)
    expect(['8', '9', 'a', 'b']).toContain(id[19]?.toLowerCase());
  });

  it('generates chronologically sorted UUIDs', async () => {
    const id1 = uuidv7();
    // small wait
    await new Promise((resolve) => setTimeout(resolve, 5));
    const id2 = uuidv7();
    expect(id1 < id2).toBe(true);
  });
});

describe('POS Calculation Helpers', () => {
  it('calculates line total with and without discount', () => {
    expect(calculateLineTotal(2, 50000)).toBe(100000);
    expect(calculateLineTotal(2, 50000, 10000)).toBe(90000);
    expect(calculateLineTotal(2, 50000, 150000)).toBe(0); // clamps to 0
  });

  it('calculates cart summary accurately', () => {
    const items = [
      { quantity: 2, unitPrice: 50000, discount: 10000 }, // subtotal 100k, disc 10k, net 90k
      { quantity: 1, unitPrice: 100000 }, // subtotal 100k, disc 0k, net 100k
    ];
    const summary = calculateCartSummary(items, 10000); // 10k order discount
    expect(summary.subtotal).toBe(200000);
    expect(summary.itemsDiscount).toBe(10000);
    expect(summary.orderDiscount).toBe(10000);
    expect(summary.totalDiscount).toBe(20000);
    expect(summary.total).toBe(180000);
    expect(summary.totalQuantity).toBe(3);
  });

  it('calculates cash change', () => {
    expect(calculateCashChange(180000, 200000)).toBe(20000);
    expect(calculateCashChange(180000, 180000)).toBe(0);
    expect(calculateCashChange(180000, 150000)).toBe(0);
  });

  it('checks discount limit (> 10% requires manager approval)', () => {
    expect(isDiscountOverLimit(5000, 100000, 10)).toBe(false); // 5% <= 10%
    expect(isDiscountOverLimit(10000, 100000, 10)).toBe(false); // 10% <= 10%
    expect(isDiscountOverLimit(10001, 100000, 10)).toBe(true); // 10.001% > 10%
    expect(isDiscountOverLimit(15000, 100000, 10)).toBe(true); // 15% > 10%
  });
});
