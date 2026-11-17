import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AuditAction,
  normalizeSearch,
  type AuthUser,
  type CreateProduct,
  type Paginated,
  type Product,
  type ProductQuery,
  type UpdateProduct,
  type VariantInput,
} from '@retailchain/shared';
import { AuditSnapshotRegistry } from '../audit/audit-snapshot.registry';
import { AuditService } from '../audit/audit.service';
import { badRequest, conflict, notFound } from '../common/http-errors';
import type { RequestContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from './categories.service';
import {
  PRODUCT_INCLUDE,
  priceBelowCostWarnings,
  serializeProduct,
  type ProductRow,
} from './product.serializer';

export const PRODUCT_ENTITY = 'Product';

type Tx = Prisma.TransactionClient;

export interface ProductFields {
  sku: string;
  name: string;
  categoryId: string | null;
  unit: string;
  defaultPrice: number;
  costPrice: number;
  minStock: number;
  isActive: boolean;
}

/** Prices captured before/after a write, to audit PRICE_CHANGE (CLAUDE.md rule 8). */
interface PriceSnapshot {
  defaultPrice: number;
  costPrice: number;
  variants: Record<string, { sku: string; price: number | null; costPrice: number | null }>;
}

const productSearchText = (name: string, sku: string) => normalizeSearch(`${name} ${sku}`);
const variantSearchText = (v: Pick<VariantInput, 'name' | 'sku' | 'attributes'>) =>
  normalizeSearch(`${v.name} ${v.sku} ${Object.values(v.attributes).join(' ')}`);

function snapshotPrices(row: ProductRow): PriceSnapshot {
  return {
    defaultPrice: row.defaultPrice,
    costPrice: row.costPrice,
    variants: Object.fromEntries(
      row.variants.map((v) => [v.id, { sku: v.sku, price: v.price, costPrice: v.costPrice }]),
    ),
  };
}

/** Returns only what changed, or null when no price changed. */
export function diffPrices(
  before: PriceSnapshot | null,
  after: PriceSnapshot,
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of ['defaultPrice', 'costPrice'] as const) {
    if (!before || before[key] !== after[key]) {
      b[key] = before?.[key] ?? null;
      a[key] = after[key];
    }
  }
  const vb: Record<string, unknown> = {};
  const va: Record<string, unknown> = {};
  for (const [id, v] of Object.entries(after.variants)) {
    const old = before?.variants[id];
    if (!old || old.price !== v.price || old.costPrice !== v.costPrice) {
      vb[v.sku] = old ? { price: old.price, costPrice: old.costPrice } : null;
      va[v.sku] = { price: v.price, costPrice: v.costPrice };
    }
  }
  if (Object.keys(va).length) {
    b.variants = vb;
    a.variants = va;
  }
  return Object.keys(a).length ? { before: b, after: a } : null;
}

@Injectable()
export class ProductsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
    private readonly audit: AuditService,
    private readonly snapshots: AuditSnapshotRegistry,
  ) {}

  onModuleInit(): void {
    this.snapshots.register(PRODUCT_ENTITY, (id) =>
      this.prisma.product.findUnique({ where: { id }, include: PRODUCT_INCLUDE }),
    );
  }

  // ---------- read ----------

  async list(viewer: AuthUser, query: ProductQuery): Promise<Paginated<Product>> {
    const { page, pageSize } = query;
    const where: Prisma.ProductWhereInput = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.categoryId ? { categoryId: { in: await this.categories.subtreeIds(query.categoryId) } } : {}),
      ...(query.q ? { OR: this.searchConditions(query.q) } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items: rows.map((r) => serializeProduct(r, viewer)), total, page, pageSize };
  }

  async get(viewer: AuthUser, id: string): Promise<Product> {
    return serializeProduct(await this.findRow(id), viewer);
  }

  /** Exact barcode lookup for the POS scanner; returns the product and which variant matched. */
  async getByBarcode(viewer: AuthUser, code: string): Promise<Product & { matchedVariantId: string }> {
    const barcode = await this.prisma.barcode.findFirst({
      where: { code: code.trim(), deletedAt: null },
      select: { variantId: true, variant: { select: { productId: true } } },
    });
    if (!barcode) throw notFound(`Không tìm thấy sản phẩm có mã vạch ${code}`);
    const product = await this.get(viewer, barcode.variant.productId);
    return { ...product, matchedVariantId: barcode.variantId };
  }

  private searchConditions(q: string): Prisma.ProductWhereInput[] {
    const text = normalizeSearch(q);
    const sku = q.trim().toUpperCase();
    return [
      { searchText: { contains: text } },
      { sku: { contains: sku } },
      { variants: { some: { OR: [{ searchText: { contains: text } }, { sku: { contains: sku } }] } } },
      { variants: { some: { barcodes: { some: { code: q.trim(), deletedAt: null } } } } },
    ];
  }

  // ---------- write ----------

  async create(actor: AuthUser, dto: CreateProduct, ctx: RequestContext): Promise<Product> {
    const fields: ProductFields = {
      sku: dto.sku,
      name: dto.name,
      categoryId: dto.categoryId,
      unit: dto.unit,
      defaultPrice: dto.defaultPrice,
      costPrice: dto.costPrice,
      minStock: dto.minStock,
      isActive: dto.isActive,
    };
    const row = await this.prisma.$transaction((tx) =>
      this.upsertProduct(tx, null, fields, this.variantsOrDefault(dto, fields)),
    );
    await this.auditPrices(actor, row, null, ctx);
    return serializeProduct(row, actor, priceBelowCostWarnings(row));
  }

  async update(actor: AuthUser, id: string, dto: UpdateProduct, ctx: RequestContext): Promise<Product> {
    const current = await this.findRow(id);
    const fields: ProductFields = {
      sku: dto.sku ?? current.sku,
      name: dto.name ?? current.name,
      categoryId: dto.categoryId !== undefined ? dto.categoryId : current.categoryId,
      unit: dto.unit ?? current.unit,
      defaultPrice: dto.defaultPrice ?? current.defaultPrice,
      costPrice: dto.costPrice ?? current.costPrice,
      minStock: dto.minStock ?? current.minStock,
      isActive: dto.isActive ?? current.isActive,
    };
    const row = await this.prisma.$transaction((tx) => this.upsertProduct(tx, current, fields, dto.variants));
    await this.auditPrices(actor, row, current, ctx);
    return serializeProduct(row, actor, priceBelowCostWarnings(row));
  }

  /**
   * Shared by create, update and CSV import (inside the caller's transaction).
   * `variants` undefined on update = leave variants untouched.
   */
  async upsertProduct(
    tx: Tx,
    current: ProductRow | null,
    fields: ProductFields,
    variants: VariantInput[] | undefined,
  ): Promise<ProductRow> {
    if (fields.categoryId && !(await tx.category.count({ where: { id: fields.categoryId } }))) {
      throw badRequest('Danh mục không tồn tại');
    }
    await this.assertSkusFree(tx, current?.id ?? null, fields.sku, variants ?? []);
    await this.assertBarcodesFree(tx, current?.id ?? null, variants ?? []);

    const data = { ...fields, searchText: productSearchText(fields.name, fields.sku) };
    const product = current
      ? await tx.product.update({ where: { id: current.id }, data })
      : await tx.product.create({ data });

    if (variants) await this.writeVariants(tx, product.id, current, variants);
    return tx.product.findUniqueOrThrow({ where: { id: product.id }, include: PRODUCT_INCLUDE });
  }

  /** Default variant when none is declared (CR-004: every product has ≥ 1 variant). */
  private variantsOrDefault(dto: CreateProduct, fields: ProductFields): VariantInput[] {
    if (dto.variants.length) return dto.variants;
    return [
      {
        sku: fields.sku,
        name: fields.name,
        attributes: {},
        price: null,
        costPrice: null,
        minStock: null,
        isActive: true,
        barcodes: dto.barcodes,
      },
    ];
  }

  private async writeVariants(tx: Tx, productId: string, current: ProductRow | null, inputs: VariantInput[]) {
    const existing = current?.variants ?? [];
    const byId = new Map(existing.map((v) => [v.id, v]));
    const bySku = new Map(existing.map((v) => [v.sku, v]));
    const kept = new Set<string>();

    for (const input of inputs) {
      const match = input.id ? byId.get(input.id) : bySku.get(input.sku);
      if (input.id && !match) throw badRequest(`Biến thể ${input.id} không thuộc sản phẩm này`);
      const data = {
        sku: input.sku,
        name: input.name,
        attributes: input.attributes,
        price: input.price,
        costPrice: input.costPrice,
        minStock: input.minStock,
        isActive: input.isActive,
        searchText: variantSearchText(input),
      };
      const variant = match
        ? await tx.productVariant.update({ where: { id: match.id }, data })
        : await tx.productVariant.create({ data: { ...data, productId } });
      kept.add(variant.id);
      await this.syncBarcodes(tx, variant.id, match?.barcodes.map((b) => b.code) ?? [], input.barcodes);
    }

    // Variants left out of the list are deactivated, never deleted (sales history will reference them).
    const dropped = existing.filter((v) => !kept.has(v.id) && v.isActive).map((v) => v.id);
    if (dropped.length) {
      await tx.productVariant.updateMany({ where: { id: { in: dropped } }, data: { isActive: false } });
    }
    if (kept.size === 0 && existing.every((v) => !v.isActive || dropped.includes(v.id))) {
      throw badRequest('Sản phẩm phải có ít nhất một biến thể');
    }
  }

  private async syncBarcodes(tx: Tx, variantId: string, currentCodes: string[], wanted: string[]) {
    const removed = currentCodes.filter((c) => !wanted.includes(c));
    const added = wanted.filter((c) => !currentCodes.includes(c));
    if (removed.length) {
      await tx.barcode.updateMany({
        where: { variantId, code: { in: removed }, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    }
    for (const code of added) await tx.barcode.create({ data: { variantId, code } });
  }

  private async assertSkusFree(tx: Tx, productId: string | null, sku: string, variants: VariantInput[]) {
    const owner = await tx.product.findUnique({ where: { sku }, select: { id: true } });
    if (owner && owner.id !== productId) throw conflict(`SKU sản phẩm ${sku} đã tồn tại`);
    const skus = variants.map((v) => v.sku);
    if (!skus.length) return;
    const taken = await tx.productVariant.findMany({
      where: { sku: { in: skus }, ...(productId ? { productId: { not: productId } } : {}) },
      select: { sku: true },
    });
    if (taken.length)
      throw conflict(`SKU biến thể đã thuộc sản phẩm khác: ${taken.map((t) => t.sku).join(', ')}`);
  }

  private async assertBarcodesFree(tx: Tx, productId: string | null, variants: VariantInput[]) {
    const codes = variants.flatMap((v) => v.barcodes);
    if (!codes.length) return;
    const taken = await tx.barcode.findMany({
      where: {
        code: { in: codes },
        deletedAt: null,
        ...(productId ? { variant: { productId: { not: productId } } } : {}),
      },
      select: { code: true, variant: { select: { sku: true } } },
    });
    if (taken.length) {
      throw conflict(`Mã vạch đã được dùng: ${taken.map((t) => `${t.code} (${t.variant.sku})`).join(', ')}`);
    }
  }

  async auditPrices(
    actor: Pick<AuthUser, 'id' | 'username'>,
    after: ProductRow,
    before: ProductRow | null,
    ctx: Partial<RequestContext>,
  ): Promise<void> {
    const diff = diffPrices(before ? snapshotPrices(before) : null, snapshotPrices(after));
    if (!diff) return;
    await this.audit.record({
      action: AuditAction.PRICE_CHANGE,
      entity: PRODUCT_ENTITY,
      entityId: after.id,
      actor,
      branchId: null,
      before: before ? diff.before : null,
      after: { sku: after.sku, ...diff.after },
      context: ctx,
    });
  }

  // ---------- used by other modules (pricing, sync, import) ----------

  async findRow(id: string, tx: Tx = this.prisma): Promise<ProductRow> {
    const row = await tx.product.findUnique({ where: { id }, include: PRODUCT_INCLUDE });
    if (!row) throw notFound('Không tìm thấy sản phẩm');
    return row;
  }

  findRowBySku(sku: string, tx: Tx = this.prisma): Promise<ProductRow | null> {
    return tx.product.findUnique({ where: { sku }, include: PRODUCT_INCLUDE });
  }

  /** Base prices for getEffectivePrice (CR-004). */
  async getPricingBase(variantId: string) {
    const v = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: {
        id: true,
        price: true,
        costPrice: true,
        product: { select: { defaultPrice: true, costPrice: true } },
      },
    });
    if (!v) throw notFound('Không tìm thấy biến thể');
    return {
      variantId: v.id,
      variantPrice: v.price,
      productDefaultPrice: v.product.defaultPrice,
      effectiveCost: v.costPrice ?? v.product.costPrice,
    };
  }

  /** sku/name/effective cost of variants, for price list and inventory screens. */
  async describeVariants(ids: string[]) {
    const rows = await this.prisma.productVariant.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        sku: true,
        name: true,
        costPrice: true,
        minStock: true,
        product: {
          select: {
            name: true,
            unit: true,
            costPrice: true,
            minStock: true,
          },
        },
      },
    });
    return new Map(
      rows.map((r) => [
        r.id,
        {
          sku: r.sku,
          name: r.name,
          productName: r.product.name,
          unit: r.product.unit,
          minStock: r.minStock ?? r.product.minStock,
          effectiveCost: r.costPrice ?? r.product.costPrice,
        },
      ]),
    );
  }

  /** Find variant IDs matching a search text (for inventory balance search). */
  async searchVariantIds(q: string): Promise<string[]> {
    const variants = await this.prisma.productVariant.findMany({
      where: {
        OR: [
          { sku: { contains: q, mode: 'insensitive' } },
          { name: { contains: q, mode: 'insensitive' } },
          { product: { name: { contains: q, mode: 'insensitive' } } },
          { product: { sku: { contains: q, mode: 'insensitive' } } },
          { barcodes: { some: { code: { contains: q }, deletedAt: null } } },
        ],
      },
      select: { id: true },
    });
    return variants.map((v) => v.id);
  }

  /** Get all active variants that have minStock > 0, for low stock alerts. */
  async getVariantsWithMinStock(): Promise<
    Array<{ id: string; sku: string; name: string; productName: string; unit: string; minStock: number }>
  > {
    const rows = await this.prisma.productVariant.findMany({
      where: {
        isActive: true,
        product: { isActive: true },
      },
      select: {
        id: true,
        sku: true,
        name: true,
        minStock: true,
        product: {
          select: {
            name: true,
            unit: true,
            minStock: true,
          },
        },
      },
    });
    return rows
      .map((r) => ({
        id: r.id,
        sku: r.sku,
        name: r.name,
        productName: r.product.name,
        unit: r.product.unit,
        minStock: r.minStock ?? r.product.minStock,
      }))
      .filter((r) => r.minStock > 0);
  }

  /** Raw catalog changes for GET /sync/catalog. The sync module strips cost prices before responding. */
  async changedSince(since: Date | undefined, until: Date) {
    const window = { ...(since ? { gt: since } : {}), lte: until };
    const [products, variants, barcodes] = await Promise.all([
      this.prisma.product.findMany({
        where: { updatedAt: window },
        orderBy: { updatedAt: 'asc' },
      }),
      this.prisma.productVariant.findMany({
        where: { updatedAt: window },
        orderBy: { updatedAt: 'asc' },
      }),
      this.prisma.barcode.findMany({ where: { updatedAt: window }, orderBy: { updatedAt: 'asc' } }),
    ]);
    return { products, variants, barcodes };
  }
}
