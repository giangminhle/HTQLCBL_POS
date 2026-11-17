import { Prisma } from '@prisma/client';
import { Role, type AuthUser, type PriceWarning, type Product, type Variant } from '@retailchain/shared';

/** Prisma include used everywhere a full product is returned. Soft-deleted barcodes are excluded. */
export const PRODUCT_INCLUDE = {
  variants: {
    orderBy: { createdAt: 'asc' },
    include: { barcodes: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } } },
  },
} satisfies Prisma.ProductInclude;

export type ProductRow = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

/** REQ-PRD-01 decision 3: cost prices are visible to everyone except CASHIER. */
export const canSeeCost = (viewer: Pick<AuthUser, 'role'>) => viewer.role !== Role.CASHIER;

/**
 * The only way products leave the API. Hiding costPrice here (not in the UI) guarantees a cashier
 * never receives it, whatever endpoint or client they use.
 */
export function serializeProduct(
  row: ProductRow,
  viewer: Pick<AuthUser, 'role'>,
  warnings?: PriceWarning[],
): Product {
  const showCost = canSeeCost(viewer);
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    categoryId: row.categoryId,
    unit: row.unit,
    defaultPrice: row.defaultPrice,
    ...(showCost ? { costPrice: row.costPrice } : {}),
    minStock: row.minStock,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    variants: row.variants.map((v): Variant => ({
      id: v.id,
      productId: v.productId,
      sku: v.sku,
      name: v.name,
      attributes: (v.attributes ?? {}) as Record<string, string>,
      price: v.price,
      ...(showCost ? { costPrice: v.costPrice } : {}),
      minStock: v.minStock,
      isActive: v.isActive,
      barcodes: v.barcodes.map((b) => ({ id: b.id, code: b.code })),
    })),
    ...(warnings && warnings.length ? { warnings } : {}),
  };
}

/**
 * Non-blocking warnings when a selling price is below cost (effective values: variant overrides product).
 * Only reported to users who may see costs.
 */
export function priceBelowCostWarnings(row: ProductRow): PriceWarning[] {
  const out: PriceWarning[] = [];
  for (const v of row.variants) {
    if (!v.isActive) continue;
    const price = v.price ?? row.defaultPrice;
    const cost = v.costPrice ?? row.costPrice;
    if (cost > 0 && price < cost) {
      out.push({
        code: 'PRICE_BELOW_COST',
        message: `Giá bán ${price.toLocaleString('vi-VN')}đ của ${v.sku} thấp hơn giá vốn ${cost.toLocaleString('vi-VN')}đ`,
        variantId: v.id,
        sku: v.sku,
        price,
        costPrice: cost,
      });
    }
  }
  return out;
}
