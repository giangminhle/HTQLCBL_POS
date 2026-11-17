import { Role } from '@retailchain/shared';
import { wouldCreateCycle } from './categories.service';
import { priceBelowCostWarnings, serializeProduct, type ProductRow } from './product.serializer';
import { diffPrices } from './products.service';

const now = new Date('2026-11-18T00:00:00Z');

const row = (overrides: Partial<ProductRow> = {}): ProductRow =>
  ({
    id: 'p1',
    sku: 'DG-CLEAR',
    name: 'Dầu gội Clear',
    searchText: 'dau goi clear dg-clear',
    categoryId: null,
    unit: 'chai',
    defaultPrice: 95_000,
    costPrice: 70_000,
    minStock: 10,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    variants: [
      {
        id: 'v1',
        productId: 'p1',
        sku: 'DG-CLEAR-180',
        name: 'Clear 180ml',
        searchText: '',
        attributes: { 'dung tích': '180ml' },
        price: 55_000,
        costPrice: 40_000,
        minStock: null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        barcodes: [
          {
            id: 'b1',
            variantId: 'v1',
            code: '2000000000015',
            deletedAt: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
      },
    ],
    ...overrides,
  }) as ProductRow;

describe('serializeProduct (REQ-PRD-01 decision 3)', () => {
  it('REQ-PRD-01: CASHIER never receives costPrice (product or variant)', () => {
    const out = serializeProduct(row(), { role: Role.CASHIER });
    expect(out).not.toHaveProperty('costPrice');
    expect(out.variants[0]).not.toHaveProperty('costPrice');
    expect(JSON.stringify(out)).not.toContain('70000');
    expect(JSON.stringify(out)).not.toContain('40000');
  });

  it('REQ-PRD-01: OWNER, BRANCH_MANAGER, WAREHOUSE_KEEPER, ACCOUNTANT see costPrice', () => {
    for (const role of [Role.OWNER, Role.BRANCH_MANAGER, Role.WAREHOUSE_KEEPER, Role.ACCOUNTANT]) {
      const out = serializeProduct(row(), { role });
      expect(out.costPrice).toBe(70_000);
      expect(out.variants[0]?.costPrice).toBe(40_000);
    }
  });

  it('REQ-PRD-01: dates become ISO strings and barcodes are plain codes', () => {
    const out = serializeProduct(row(), { role: Role.OWNER });
    expect(out.createdAt).toBe('2026-11-18T00:00:00.000Z');
    expect(out.variants[0]?.barcodes).toEqual([{ id: 'b1', code: '2000000000015' }]);
  });
});

describe('priceBelowCostWarnings (REQ-PRC-01)', () => {
  it('REQ-PRC-01: warns (does not block) when the effective selling price is below the effective cost', () => {
    const r = row();
    r.variants[0]!.price = 39_000; // cost 40 000
    expect(priceBelowCostWarnings(r)).toEqual([
      expect.objectContaining({
        code: 'PRICE_BELOW_COST',
        sku: 'DG-CLEAR-180',
        price: 39_000,
        costPrice: 40_000,
      }),
    ]);
  });

  it('REQ-PRC-01: variant without own price/cost falls back to product values (CR-004)', () => {
    const r = row({ defaultPrice: 60_000, costPrice: 70_000 });
    r.variants[0]!.price = null;
    r.variants[0]!.costPrice = null;
    expect(priceBelowCostWarnings(r)[0]).toMatchObject({ price: 60_000, costPrice: 70_000 });
  });

  it('REQ-PRC-01: no warning when price ≥ cost, cost is 0, or variant inactive', () => {
    expect(priceBelowCostWarnings(row())).toEqual([]);
    const free = row({ costPrice: 0 });
    free.variants[0]!.costPrice = null;
    free.variants[0]!.price = 1;
    expect(priceBelowCostWarnings(free)).toEqual([]);
    const inactive = row();
    inactive.variants[0]!.price = 1;
    inactive.variants[0]!.isActive = false;
    expect(priceBelowCostWarnings(inactive)).toEqual([]);
  });
});

describe('diffPrices (audit PRICE_CHANGE)', () => {
  const snap = (defaultPrice: number, vPrice: number | null) => ({
    defaultPrice,
    costPrice: 70_000,
    variants: { v1: { sku: 'DG-CLEAR-180', price: vPrice, costPrice: 40_000 } },
  });

  it('REQ-PRC-01: reports only changed prices', () => {
    expect(diffPrices(snap(95_000, 55_000), snap(99_000, 55_000))).toEqual({
      before: { defaultPrice: 95_000 },
      after: { defaultPrice: 99_000 },
    });
    expect(diffPrices(snap(95_000, 55_000), snap(95_000, 50_000))).toEqual({
      before: { variants: { 'DG-CLEAR-180': { price: 55_000, costPrice: 40_000 } } },
      after: { variants: { 'DG-CLEAR-180': { price: 50_000, costPrice: 40_000 } } },
    });
  });

  it('REQ-PRC-01: nothing changed → null (no audit row)', () => {
    expect(diffPrices(snap(95_000, 55_000), snap(95_000, 55_000))).toBeNull();
  });
});

describe('category tree', () => {
  it('REQ-PRD-01: moving a category under itself or its descendant is a cycle', () => {
    expect(wouldCreateCycle('/a/', '/a/')).toBe(true);
    expect(wouldCreateCycle('/a/', '/a/b/c/')).toBe(true);
    expect(wouldCreateCycle('/a/b/', '/a/')).toBe(false);
    expect(wouldCreateCycle('/a/', '/x/')).toBe(false);
  });
});
