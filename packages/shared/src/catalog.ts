import { z } from 'zod';
import { checkBarcode } from './barcode';
import { paginatedSchema, paginationQuerySchema, queryBoolean } from './pagination';

/** VND, integer đồng (CLAUDE.md rule 6). */
export const moneySchema = z.number().int('Tiền phải là số nguyên (đồng)').min(0).max(2_000_000_000);

const skuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9._-]{2,40}$/, 'SKU 2–40 ký tự: chữ, số, dấu chấm, gạch ngang, gạch dưới');

export const barcodeCodeSchema = z
  .string()
  .trim()
  .superRefine((code, ctx) => {
    const check = checkBarcode(code);
    if (!check.ok) ctx.addIssue({ code: z.ZodIssueCode.custom, message: check.message });
  });

// ---------- Categories ----------

export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  /** Materialised path of ids, e.g. "/a/b/" — used to filter a whole subtree. */
  path: z.string(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Category = z.infer<typeof categorySchema>;
export const categoryListSchema = z.array(categorySchema);

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên danh mục').max(100),
  parentId: z.string().uuid().nullable().default(null),
  sortOrder: z.number().int().default(0),
});
export type CreateCategory = z.output<typeof createCategorySchema>;

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    parentId: z.string().uuid().nullable(),
    sortOrder: z.number().int(),
    isActive: z.boolean(),
  })
  .partial();
export type UpdateCategory = z.output<typeof updateCategorySchema>;

// ---------- Products / variants ----------

export const variantInputSchema = z.object({
  /** Present when updating an existing variant. */
  id: z.string().uuid().optional(),
  sku: skuSchema,
  name: z.string().trim().min(1).max(150),
  attributes: z.record(z.string().trim().min(1).max(30), z.string().trim().max(50)).default({}),
  /** Null = use product.defaultPrice (CR-004). */
  price: moneySchema.nullable().default(null),
  costPrice: moneySchema.nullable().default(null),
  minStock: z.number().int().min(0).nullable().default(null),
  isActive: z.boolean().default(true),
  barcodes: z.array(barcodeCodeSchema).max(20).default([]),
});
export type VariantInput = z.output<typeof variantInputSchema>;

const productFields = {
  sku: skuSchema,
  name: z.string().trim().min(1, 'Nhập tên sản phẩm').max(150),
  categoryId: z.string().uuid().nullable().default(null),
  unit: z.string().trim().min(1, 'Nhập đơn vị tính').max(20),
  defaultPrice: moneySchema,
  costPrice: moneySchema.default(0),
  minStock: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
};

function uniqueVariantData(
  v: { variants?: VariantInput[]; barcodes?: string[] },
  ctx: z.RefinementCtx,
): void {
  const skus = new Set<string>();
  const codes = new Set<string>(v.barcodes ?? []);
  v.variants?.forEach((variant, i) => {
    if (skus.has(variant.sku)) {
      ctx.addIssue({ code: 'custom', path: ['variants', i, 'sku'], message: `SKU ${variant.sku} bị trùng` });
    }
    skus.add(variant.sku);
    for (const code of variant.barcodes) {
      if (codes.has(code)) {
        ctx.addIssue({ code: 'custom', path: ['variants', i, 'barcodes'], message: `Mã vạch ${code} bị trùng` });
      }
      codes.add(code);
    }
  });
}

/**
 * `variants` empty → a default variant is created with the product SKU/name and the top-level `barcodes`.
 * Every product always has ≥ 1 variant (CR-004).
 */
export const createProductSchema = z
  .object({
    ...productFields,
    barcodes: z.array(barcodeCodeSchema).max(20).default([]),
    variants: z.array(variantInputSchema).max(100).default([]),
  })
  .superRefine(uniqueVariantData);
export type CreateProduct = z.output<typeof createProductSchema>;

/**
 * `variants`, when given, is the full list: items with `id` are updated, without `id` are created,
 * existing variants missing from the list are deactivated (never deleted: sales will reference them).
 */
export const updateProductSchema = z
  .object({
    sku: productFields.sku,
    name: productFields.name,
    categoryId: z.string().uuid().nullable(),
    unit: productFields.unit,
    defaultPrice: moneySchema,
    costPrice: moneySchema,
    minStock: z.number().int().min(0),
    isActive: z.boolean(),
    variants: z.array(variantInputSchema).min(1).max(100),
  })
  .partial()
  .superRefine(uniqueVariantData);
export type UpdateProduct = z.output<typeof updateProductSchema>;

export const barcodeSchema = z.object({ id: z.string(), code: z.string() });

export const variantSchema = z.object({
  id: z.string(),
  productId: z.string(),
  sku: z.string(),
  name: z.string(),
  attributes: z.record(z.string()),
  price: z.number().int().nullable(),
  /** Hidden from CASHIER (serializer). */
  costPrice: z.number().int().nullable().optional(),
  minStock: z.number().int().nullable(),
  isActive: z.boolean(),
  barcodes: z.array(barcodeSchema),
});
export type Variant = z.infer<typeof variantSchema>;

export const PriceWarningCode = { PRICE_BELOW_COST: 'PRICE_BELOW_COST' } as const;
export const priceWarningSchema = z.object({
  code: z.literal('PRICE_BELOW_COST'),
  message: z.string(),
  variantId: z.string().optional(),
  sku: z.string().optional(),
  price: z.number().int(),
  costPrice: z.number().int(),
});
export type PriceWarning = z.infer<typeof priceWarningSchema>;

export const productSchema = z.object({
  id: z.string(),
  sku: z.string(),
  name: z.string(),
  categoryId: z.string().nullable(),
  unit: z.string(),
  defaultPrice: z.number().int(),
  /** Hidden from CASHIER (serializer). */
  costPrice: z.number().int().optional(),
  minStock: z.number().int(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  variants: z.array(variantSchema),
  /** Non-blocking warnings, e.g. selling price below cost. */
  warnings: z.array(priceWarningSchema).optional(),
});
export type Product = z.infer<typeof productSchema>;
export const productPageSchema = paginatedSchema(productSchema);

export const productQuerySchema = paginationQuerySchema.extend({
  /** Name (diacritics-insensitive), SKU, or exact barcode. */
  q: z.string().trim().max(100).optional(),
  /** Includes sub-categories. */
  categoryId: z.string().uuid().optional(),
  isActive: queryBoolean.optional(),
});
export type ProductQuery = z.output<typeof productQuerySchema>;
export type ProductQueryInput = z.input<typeof productQuerySchema>;

// ---------- Price lists (REQ-PRC-01) ----------

const isoDate = z.coerce.date();

export const priceListSchema = z.object({
  id: z.string(),
  branchId: z.string(),
  name: z.string(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  itemCount: z.number().int().optional(),
});
export type PriceList = z.infer<typeof priceListSchema>;
export const priceListPageSchema = paginatedSchema(priceListSchema);

export const priceListItemInputSchema = z.object({ variantId: z.string().uuid(), price: moneySchema });

const windowRefine = (v: { effectiveFrom?: Date; effectiveTo?: Date | null }, ctx: z.RefinementCtx) => {
  if (v.effectiveFrom && v.effectiveTo && v.effectiveTo <= v.effectiveFrom) {
    ctx.addIssue({ code: 'custom', path: ['effectiveTo'], message: 'Ngày kết thúc phải sau ngày bắt đầu' });
  }
};

export const createPriceListSchema = z
  .object({
    branchId: z.string().uuid(),
    name: z.string().trim().min(1, 'Nhập tên bảng giá').max(100),
    effectiveFrom: isoDate,
    /** Exclusive end; null = open-ended. */
    effectiveTo: isoDate.nullable().default(null),
    items: z.array(priceListItemInputSchema).max(5000).default([]),
  })
  .superRefine(windowRefine);
export type CreatePriceList = z.output<typeof createPriceListSchema>;

export const updatePriceListSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    effectiveFrom: isoDate,
    effectiveTo: isoDate.nullable(),
    isActive: z.boolean(),
  })
  .partial()
  .superRefine(windowRefine);
export type UpdatePriceList = z.output<typeof updatePriceListSchema>;

/** "End the current price list on day X" (sets effectiveTo). */
export const endPriceListSchema = z.object({ endAt: isoDate });

export const priceListQuerySchema = paginationQuerySchema.extend({
  branchId: z.string().uuid().optional(),
  /** Only lists in effect at this instant. */
  activeAt: isoDate.optional(),
});
export type PriceListQuery = z.output<typeof priceListQuerySchema>;

export const upsertPriceListItemsSchema = z.object({
  items: z.array(priceListItemInputSchema).min(1).max(5000),
});

export const priceListItemSchema = z.object({
  id: z.string(),
  priceListId: z.string(),
  variantId: z.string(),
  price: z.number().int(),
  variantSku: z.string(),
  variantName: z.string(),
  updatedAt: z.string(),
});
export type PriceListItem = z.infer<typeof priceListItemSchema>;
export const priceListItemsResponseSchema = z.object({
  items: z.array(priceListItemSchema),
  warnings: z.array(priceWarningSchema).default([]),
});

export const effectivePriceQuerySchema = z.object({
  variantId: z.string().uuid(),
  branchId: z.string().uuid(),
  at: isoDate.optional(),
});
export const effectivePriceResponseSchema = z.object({
  variantId: z.string(),
  branchId: z.string(),
  at: z.string(),
  price: z.number().int(),
  source: z.enum(['BRANCH_PRICE_LIST', 'VARIANT', 'PRODUCT_DEFAULT']),
  priceListId: z.string().nullable(),
});
export type EffectivePriceResponse = z.infer<typeof effectivePriceResponseSchema>;

// ---------- CSV import ----------

export const IMPORT_MAX_ROWS = 5000;
export const IMPORT_COLUMNS = [
  'product_sku',
  'product_name',
  'category',
  'unit',
  'default_price',
  'cost_price',
  'min_stock',
  'variant_sku',
  'variant_name',
  'attributes',
  'variant_price',
  'variant_cost_price',
  'variant_min_stock',
  'barcodes',
  'is_active',
] as const;

export const importErrorSchema = z.object({
  /** 1-based line number in the file (header = line 1). */
  line: z.number().int(),
  field: z.string().nullable(),
  message: z.string(),
});
export type ImportError = z.infer<typeof importErrorSchema>;

export const importResultSchema = z.object({
  dryRun: z.boolean(),
  ok: z.boolean(),
  totalRows: z.number().int(),
  productsCreated: z.number().int(),
  productsUpdated: z.number().int(),
  variantsCreated: z.number().int(),
  variantsUpdated: z.number().int(),
  errors: z.array(importErrorSchema),
  warnings: z.array(priceWarningSchema),
  /** Original CSV plus a "Lỗi" column; present when there are errors. */
  errorReportCsv: z.string().optional(),
});
export type ImportResult = z.infer<typeof importResultSchema>;

// ---------- Sync for POS (GET /sync/catalog) ----------

export const syncCatalogQuerySchema = z.object({
  branchId: z.string().uuid(),
  /** Omit for a full download. */
  since: isoDate.optional(),
});
export type SyncCatalogQuery = z.output<typeof syncCatalogQuerySchema>;

export const syncCatalogResponseSchema = z.object({
  branchId: z.string(),
  since: z.string().nullable(),
  serverTime: z.string(),
  /** Pass as `since` next time (slightly before serverTime to cover in-flight transactions). */
  nextSince: z.string(),
  categories: z.array(categorySchema),
  products: z.array(productSchema.omit({ variants: true, warnings: true, costPrice: true })),
  variants: z.array(variantSchema.omit({ barcodes: true, costPrice: true }).extend({ updatedAt: z.string() })),
  barcodes: z.array(
    z.object({ id: z.string(), variantId: z.string(), code: z.string(), deleted: z.boolean(), updatedAt: z.string() }),
  ),
  priceLists: z.array(priceListSchema.omit({ itemCount: true })),
  priceListItems: z.array(
    z.object({
      id: z.string(),
      priceListId: z.string(),
      variantId: z.string(),
      price: z.number().int(),
      deleted: z.boolean(),
      updatedAt: z.string(),
    }),
  ),
});
export type SyncCatalogResponse = z.infer<typeof syncCatalogResponseSchema>;
