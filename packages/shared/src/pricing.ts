/**
 * Price resolution — CLAUDE.md rule 5 as amended by CR-004:
 *   active branch price list covering `at` → variant.price → product.defaultPrice.
 * Pure function, shared by the API (getEffectivePrice) and the POS (offline pricing, Sprint 5),
 * so the till and the server always agree.
 */

export type DateLike = Date | string;

export interface PriceListWindow {
  id: string;
  name?: string;
  branchId: string;
  /** Inclusive. */
  effectiveFrom: DateLike;
  /** Exclusive; null = open-ended. */
  effectiveTo: DateLike | null;
  isActive: boolean;
}

export interface PriceListEntry {
  priceListId: string;
  variantId: string;
  price: number;
  /** Soft-deleted entries are ignored. */
  deleted?: boolean;
}

export interface PriceResolutionInput {
  variantId: string;
  branchId: string;
  at: DateLike;
  variantPrice: number | null;
  productDefaultPrice: number;
  priceLists: readonly PriceListWindow[];
  entries: readonly PriceListEntry[];
}

export type PriceSource = 'BRANCH_PRICE_LIST' | 'VARIANT' | 'PRODUCT_DEFAULT';

export interface EffectivePrice {
  price: number;
  source: PriceSource;
  priceListId: string | null;
}

const ms = (d: DateLike) => (d instanceof Date ? d.getTime() : new Date(d).getTime());

/** Half-open window [from, to). */
export function isPriceListEffective(list: PriceListWindow, at: DateLike): boolean {
  const t = ms(at);
  return (
    list.isActive && ms(list.effectiveFrom) <= t && (list.effectiveTo === null || t < ms(list.effectiveTo))
  );
}

export function resolveEffectivePrice(input: PriceResolutionInput): EffectivePrice {
  // The DB forbids overlapping lists per branch; if data ever overlaps, the most recently started list wins.
  const lists = input.priceLists
    .filter((l) => l.branchId === input.branchId && isPriceListEffective(l, input.at))
    .sort((a, b) => ms(b.effectiveFrom) - ms(a.effectiveFrom));

  for (const list of lists) {
    const entry = input.entries.find(
      (e) => e.priceListId === list.id && e.variantId === input.variantId && !e.deleted,
    );
    if (entry) return { price: entry.price, source: 'BRANCH_PRICE_LIST', priceListId: list.id };
  }
  if (input.variantPrice !== null) {
    return { price: input.variantPrice, source: 'VARIANT', priceListId: null };
  }
  return { price: input.productDefaultPrice, source: 'PRODUCT_DEFAULT', priceListId: null };
}
