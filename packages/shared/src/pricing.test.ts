import { describe, expect, it } from 'vitest';
import { checkBarcode, eanCheckDigit, isValidEan, toEan13 } from './barcode';
import { resolveEffectivePrice, type PriceListWindow } from './pricing';
import { normalizeSearch } from './text';

const BRANCH = 'branch-1';
const OTHER = 'branch-2';
const VARIANT = 'v1';

const list = (id: string, from: string, to: string | null, extra: Partial<PriceListWindow> = {}) => ({
  id,
  branchId: BRANCH,
  effectiveFrom: from,
  effectiveTo: to,
  isActive: true,
  ...extra,
});

const base = {
  variantId: VARIANT,
  branchId: BRANCH,
  at: '2026-12-15T10:00:00Z',
  variantPrice: 45_000 as number | null,
  productDefaultPrice: 50_000,
};

describe('resolveEffectivePrice (rule 5 + CR-004)', () => {
  it('REQ-PRC-01: branch price list in effect → branch price', () => {
    const r = resolveEffectivePrice({
      ...base,
      priceLists: [list('pl', '2026-12-01T00:00:00Z', '2027-01-01T00:00:00Z')],
      entries: [{ priceListId: 'pl', variantId: VARIANT, price: 39_000 }],
    });
    expect(r).toEqual({ price: 39_000, source: 'BRANCH_PRICE_LIST', priceListId: 'pl' });
  });

  it('REQ-PRC-01: branch price list expired → variant price', () => {
    const r = resolveEffectivePrice({
      ...base,
      priceLists: [list('pl', '2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z')],
      entries: [{ priceListId: 'pl', variantId: VARIANT, price: 39_000 }],
    });
    expect(r).toEqual({ price: 45_000, source: 'VARIANT', priceListId: null });
  });

  it('REQ-PRC-01: no branch price → variant price; no variant price → product default', () => {
    expect(resolveEffectivePrice({ ...base, priceLists: [], entries: [] }).source).toBe('VARIANT');
    expect(resolveEffectivePrice({ ...base, variantPrice: null, priceLists: [], entries: [] })).toEqual({
      price: 50_000,
      source: 'PRODUCT_DEFAULT',
      priceListId: null,
    });
  });

  it('REQ-PRC-01: list in effect but without this variant → falls back', () => {
    const r = resolveEffectivePrice({
      ...base,
      priceLists: [list('pl', '2026-12-01T00:00:00Z', null)],
      entries: [{ priceListId: 'pl', variantId: 'other-variant', price: 1 }],
    });
    expect(r.source).toBe('VARIANT');
  });

  it('REQ-PRC-01: window is half-open [from, to): from is included, to is excluded', () => {
    const pl = list('pl', '2026-12-15T10:00:00Z', '2026-12-16T00:00:00Z');
    const entries = [{ priceListId: 'pl', variantId: VARIANT, price: 1_000 }];
    expect(resolveEffectivePrice({ ...base, priceLists: [pl], entries }).source).toBe('BRANCH_PRICE_LIST');
    expect(
      resolveEffectivePrice({ ...base, at: '2026-12-16T00:00:00Z', priceLists: [pl], entries }).source,
    ).toBe('VARIANT');
  });

  it('REQ-PRC-01: list that has not started yet, inactive list, other branch, deleted entry are ignored', () => {
    const entries = [
      { priceListId: 'future', variantId: VARIANT, price: 1 },
      { priceListId: 'inactive', variantId: VARIANT, price: 2 },
      { priceListId: 'other', variantId: VARIANT, price: 3 },
      { priceListId: 'deleted', variantId: VARIANT, price: 4, deleted: true },
    ];
    const r = resolveEffectivePrice({
      ...base,
      priceLists: [
        list('future', '2027-01-01T00:00:00Z', null),
        list('inactive', '2026-01-01T00:00:00Z', null, { isActive: false }),
        list('other', '2026-01-01T00:00:00Z', null, { branchId: OTHER }),
        list('deleted', '2026-01-01T00:00:00Z', null),
      ],
      entries,
    });
    expect(r.source).toBe('VARIANT');
  });

  it('REQ-PRC-01: open-ended list (effectiveTo null) applies indefinitely', () => {
    const r = resolveEffectivePrice({
      ...base,
      at: '2030-01-01T00:00:00Z',
      priceLists: [list('pl', '2026-01-01T00:00:00Z', null)],
      entries: [{ priceListId: 'pl', variantId: VARIANT, price: 7_000 }],
    });
    expect(r.price).toBe(7_000);
  });
});

describe('barcodes', () => {
  it('REQ-PRD-01: computes GS1 check digits', () => {
    expect(eanCheckDigit('400638133393')).toBe(1); // 4006381333931
    expect(isValidEan('4006381333931')).toBe(true);
    expect(isValidEan('4006381333932')).toBe(false);
    expect(isValidEan('96385074')).toBe(true); // EAN-8
    expect(toEan13('200000000001')).toMatch(/^200000000001\d$/);
    expect(isValidEan(toEan13('893604123456'))).toBe(true);
  });

  it('REQ-PRD-01: accepts valid EAN and internal codes, rejects wrong check digits and junk', () => {
    expect(checkBarcode('4006381333931').ok).toBe(true);
    expect(checkBarcode('SP-0001').ok).toBe(true);
    expect(checkBarcode('4006381333932')).toMatchObject({
      ok: false,
      message: expect.stringContaining('EAN-13'),
    });
    expect(checkBarcode('ab').ok).toBe(false);
    expect(checkBarcode('có dấu').ok).toBe(false);
  });
});

describe('normalizeSearch', () => {
  it('REQ-PRD-01: removes Vietnamese diacritics so "sua" finds "Sữa"', () => {
    expect(normalizeSearch('Sữa tươi  Đà Lạt')).toBe('sua tuoi da lat');
    expect(normalizeSearch('DẦU GỘI Clear')).toBe('dau goi clear');
  });
});
