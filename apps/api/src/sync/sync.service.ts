import { Injectable } from '@nestjs/common';
import type { AuthUser, SyncCatalogQuery, SyncCatalogResponse } from '@retailchain/shared';
import { assertBranchAccess } from '../common/authz/branch-scope';
import { PriceListsService } from '../pricing/price-lists.service';
import { CategoriesService } from '../products/categories.service';
import { ProductsService } from '../products/products.service';

/**
 * Rows committed by transactions that started before `until` but finished after it would be missed if the
 * client asked again with since = until. Handing back a slightly earlier `nextSince` re-sends a few rows
 * (the POS upserts by id, so duplicates are harmless) and never loses any.
 */
export const SYNC_OVERLAP_MS = 5_000;

const iso = (d: Date) => d.toISOString();

/**
 * GET /sync/catalog (prepares REQ-POS-05, used by the POS in Sprint 5). Delta of everything the till needs
 * to sell offline: categories, products, variants, barcodes (incl. deleted), and the branch's price lists
 * with their validity windows so the POS can resolve prices locally with the shared resolveEffectivePrice.
 * Cost prices are never included.
 */
@Injectable()
export class SyncService {
  constructor(
    private readonly products: ProductsService,
    private readonly categories: CategoriesService,
    private readonly priceLists: PriceListsService,
  ) {}

  async catalog(user: AuthUser, query: SyncCatalogQuery, now = new Date()): Promise<SyncCatalogResponse> {
    assertBranchAccess(user, query.branchId);
    const until = now;
    const since = query.since;

    const [categories, catalog, pricing] = await Promise.all([
      this.categories.changedSince(since, until),
      this.products.changedSince(since, until),
      this.priceLists.changedSince(query.branchId, since, until),
    ]);

    return {
      branchId: query.branchId,
      since: since ? iso(since) : null,
      serverTime: iso(until),
      nextSince: iso(new Date(until.getTime() - SYNC_OVERLAP_MS)),
      categories: categories.map((c) => ({ ...c, createdAt: iso(c.createdAt), updatedAt: iso(c.updatedAt) })),
      products: catalog.products.map((p) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        categoryId: p.categoryId,
        unit: p.unit,
        defaultPrice: p.defaultPrice,
        minStock: p.minStock,
        isActive: p.isActive,
        createdAt: iso(p.createdAt),
        updatedAt: iso(p.updatedAt),
      })),
      variants: catalog.variants.map((v) => ({
        id: v.id,
        productId: v.productId,
        sku: v.sku,
        name: v.name,
        attributes: (v.attributes ?? {}) as Record<string, string>,
        price: v.price,
        minStock: v.minStock,
        isActive: v.isActive,
        updatedAt: iso(v.updatedAt),
      })),
      barcodes: catalog.barcodes.map((b) => ({
        id: b.id,
        variantId: b.variantId,
        code: b.code,
        deleted: b.deletedAt !== null,
        updatedAt: iso(b.updatedAt),
      })),
      priceLists: pricing.priceLists.map((l) => ({
        id: l.id,
        branchId: l.branchId,
        name: l.name,
        effectiveFrom: iso(l.effectiveFrom),
        effectiveTo: l.effectiveTo ? iso(l.effectiveTo) : null,
        isActive: l.isActive,
        createdAt: iso(l.createdAt),
        updatedAt: iso(l.updatedAt),
      })),
      priceListItems: pricing.items.map((i) => ({
        id: i.id,
        priceListId: i.priceListId,
        variantId: i.variantId,
        price: i.price,
        deleted: i.deletedAt !== null,
        updatedAt: iso(i.updatedAt),
      })),
    };
  }
}
