import { HttpStatus, Injectable, OnModuleInit } from '@nestjs/common';
import { PriceList, Prisma } from '@prisma/client';
import {
  AuditAction,
  ErrorCode,
  resolveEffectivePrice,
  type AuthUser,
  type CreatePriceList,
  type EffectivePriceResponse,
  type Paginated,
  type PriceListQuery,
  type PriceWarning,
  type UpdatePriceList,
} from '@retailchain/shared';
import { AuditSnapshotRegistry } from '../audit/audit-snapshot.registry';
import { AuditService } from '../audit/audit.service';
import { BranchesService } from '../branches/branches.service';
import { assertBranchAccess, branchFilter } from '../common/authz/branch-scope';
import { apiError, badRequest, notFound } from '../common/http-errors';
import type { RequestContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsService } from '../products/products.service';

export const PRICE_LIST_ENTITY = 'PriceList';

type Tx = Prisma.TransactionClient;
type ItemInput = { variantId: string; price: number };

/** True when the error is the DB exclusion constraint "price_lists_no_overlap" (SQLSTATE 23P01). */
export function isOverlapViolation(err: unknown): boolean {
  const text =
    err instanceof Error ? `${err.message} ${JSON.stringify((err as { meta?: unknown }).meta ?? '')}` : '';
  return /23P01|price_lists_no_overlap|exclusion constraint/i.test(text);
}

@Injectable()
export class PriceListsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly branches: BranchesService,
    private readonly audit: AuditService,
    private readonly snapshots: AuditSnapshotRegistry,
  ) {}

  onModuleInit(): void {
    this.snapshots.register(PRICE_LIST_ENTITY, (id) => this.prisma.priceList.findUnique({ where: { id } }));
  }

  async list(user: AuthUser, query: PriceListQuery): Promise<Paginated<PriceList & { itemCount: number }>> {
    const { page, pageSize } = query;
    const branchId = branchFilter(user, query.branchId);
    const where: Prisma.PriceListWhereInput = {
      ...(branchId ? { branchId } : {}),
      ...(query.activeAt
        ? {
            isActive: true,
            effectiveFrom: { lte: query.activeAt },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: query.activeAt } }],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.priceList.findMany({
        where,
        orderBy: [{ branchId: 'asc' }, { effectiveFrom: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { items: { where: { deletedAt: null } } } } },
      }),
      this.prisma.priceList.count({ where }),
    ]);
    return {
      items: rows.map(({ _count, ...l }) => ({ ...l, itemCount: _count.items })),
      total,
      page,
      pageSize,
    };
  }

  async get(user: AuthUser, id: string): Promise<PriceList> {
    const list = await this.prisma.priceList.findUnique({ where: { id } });
    if (!list) throw notFound('Không tìm thấy bảng giá');
    assertBranchAccess(user, list.branchId);
    return list;
  }

  async create(user: AuthUser, dto: CreatePriceList, ctx: RequestContext) {
    assertBranchAccess(user, dto.branchId);
    if (!(await this.branches.isActiveBranch(dto.branchId))) {
      throw badRequest('Chi nhánh không tồn tại hoặc đã ngưng hoạt động');
    }
    const described = await this.describe(dto.items);
    await this.assertNoOverlap(null, dto.branchId, dto.effectiveFrom, dto.effectiveTo);

    const list = await this.withOverlapMapping(dto.branchId, dto.effectiveFrom, dto.effectiveTo, null, () =>
      this.prisma.$transaction(async (tx) => {
        const created = await tx.priceList.create({
          data: {
            branchId: dto.branchId,
            name: dto.name,
            effectiveFrom: dto.effectiveFrom,
            effectiveTo: dto.effectiveTo,
          },
        });
        if (dto.items.length) {
          await tx.priceListItem.createMany({
            data: dto.items.map((i) => ({ priceListId: created.id, variantId: i.variantId, price: i.price })),
          });
        }
        return created;
      }),
    );

    if (dto.items.length) {
      await this.auditItems(
        user,
        list,
        dto.items.map((i) => ({ ...i, before: null })),
        ctx,
      );
    }
    return { ...list, warnings: this.belowCost(dto.items, described) };
  }

  async update(user: AuthUser, id: string, dto: UpdatePriceList): Promise<PriceList> {
    const current = await this.get(user, id);
    const from = dto.effectiveFrom ?? current.effectiveFrom;
    const to = dto.effectiveTo !== undefined ? dto.effectiveTo : current.effectiveTo;
    if (to && to <= from) throw badRequest('Ngày kết thúc phải sau ngày bắt đầu');
    if (dto.isActive !== false) await this.assertNoOverlap(id, current.branchId, from, to);
    return this.withOverlapMapping(current.branchId, from, to, id, () =>
      this.prisma.priceList.update({ where: { id }, data: dto }),
    );
  }

  /** "End the current price list on day X": sets the exclusive end of the window. */
  async end(user: AuthUser, id: string, endAt: Date): Promise<PriceList> {
    const current = await this.get(user, id);
    if (endAt <= current.effectiveFrom) {
      throw badRequest('Ngày kết thúc phải sau ngày bắt đầu của bảng giá');
    }
    return this.update(user, id, { effectiveTo: endAt });
  }

  async listItems(user: AuthUser, id: string) {
    await this.get(user, id);
    const rows = await this.prisma.priceListItem.findMany({ where: { priceListId: id, deletedAt: null } });
    // Variant labels come from the products module's service (no direct access to its tables).
    const variants = await this.products.describeVariants(rows.map((r) => r.variantId));
    return rows
      .map((r) => ({
        id: r.id,
        priceListId: r.priceListId,
        variantId: r.variantId,
        price: r.price,
        variantSku: variants.get(r.variantId)?.sku ?? '?',
        variantName: variants.get(r.variantId)?.name ?? '?',
        updatedAt: r.updatedAt.toISOString(),
      }))
      .sort((a, b) => a.variantSku.localeCompare(b.variantSku));
  }

  /** Create or change prices; each change is audited as PRICE_CHANGE with before/after. */
  async upsertItems(user: AuthUser, id: string, items: ItemInput[], ctx: RequestContext) {
    const list = await this.get(user, id);
    const described = await this.describe(items);
    const changes = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.priceListItem.findMany({
        where: { priceListId: id, variantId: { in: items.map((i) => i.variantId) } },
      });
      const byVariant = new Map(existing.map((e) => [e.variantId, e]));
      const out: (ItemInput & { before: number | null })[] = [];
      for (const item of items) {
        const old = byVariant.get(item.variantId);
        const before = old && !old.deletedAt ? old.price : null;
        if (before === item.price) continue;
        await this.upsertItem(tx, id, item, old?.id);
        out.push({ ...item, before });
      }
      return out;
    });
    await this.auditItems(user, list, changes, ctx);
    return { items: await this.listItems(user, id), warnings: this.belowCost(items, described) };
  }

  async removeItem(user: AuthUser, id: string, variantId: string, ctx: RequestContext) {
    const list = await this.get(user, id);
    const item = await this.prisma.priceListItem.findUnique({
      where: { priceListId_variantId: { priceListId: id, variantId } },
    });
    if (!item || item.deletedAt) throw notFound('Biến thể không có trong bảng giá');
    await this.prisma.priceListItem.update({ where: { id: item.id }, data: { deletedAt: new Date() } });
    await this.auditItems(user, list, [{ variantId, price: null, before: item.price }], ctx);
    return { items: await this.listItems(user, id), warnings: [] };
  }

  /** REQ-PRC-01: getEffectivePrice(variantId, branchId, at) — rule 5 as amended by CR-004. */
  async getEffectivePrice(
    variantId: string,
    branchId: string,
    at: Date = new Date(),
  ): Promise<EffectivePriceResponse> {
    const base = await this.products.getPricingBase(variantId);
    const lists = await this.prisma.priceList.findMany({
      where: {
        branchId,
        isActive: true,
        effectiveFrom: { lte: at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
      },
    });
    const entries = await this.prisma.priceListItem.findMany({
      where: { variantId, priceListId: { in: lists.map((l) => l.id) }, deletedAt: null },
    });
    const r = resolveEffectivePrice({
      variantId,
      branchId,
      at,
      variantPrice: base.variantPrice,
      productDefaultPrice: base.productDefaultPrice,
      priceLists: lists,
      entries,
    });
    return { variantId, branchId, at: at.toISOString(), ...r };
  }

  async getEffectivePriceFor(user: AuthUser, variantId: string, branchId: string, at?: Date) {
    assertBranchAccess(user, branchId);
    return this.getEffectivePrice(variantId, branchId, at);
  }

  /** Price lists and items of a branch changed in (since, until], for GET /sync/catalog. */
  async changedSince(branchId: string, since: Date | undefined, until: Date) {
    const window = { ...(since ? { gt: since } : {}), lte: until };
    const [priceLists, items] = await Promise.all([
      this.prisma.priceList.findMany({
        where: { branchId, updatedAt: window },
        orderBy: { updatedAt: 'asc' },
      }),
      this.prisma.priceListItem.findMany({
        where: { priceList: { branchId }, updatedAt: window },
        orderBy: { updatedAt: 'asc' },
      }),
    ]);
    return { priceLists, items };
  }

  // ---------- helpers ----------

  private async upsertItem(tx: Tx, priceListId: string, item: ItemInput, existingId?: string) {
    if (existingId) {
      await tx.priceListItem.update({
        where: { id: existingId },
        data: { price: item.price, deletedAt: null },
      });
    } else {
      await tx.priceListItem.create({ data: { priceListId, variantId: item.variantId, price: item.price } });
    }
  }

  private async describe(items: ItemInput[]) {
    const described = await this.products.describeVariants(items.map((i) => i.variantId));
    const missing = items.filter((i) => !described.has(i.variantId)).map((i) => i.variantId);
    if (missing.length) throw badRequest(`Không tìm thấy biến thể: ${missing.join(', ')}`);
    return described;
  }

  private belowCost(items: ItemInput[], described: Awaited<ReturnType<ProductsService['describeVariants']>>) {
    const out: PriceWarning[] = [];
    for (const i of items) {
      const v = described.get(i.variantId);
      if (v && v.effectiveCost > 0 && i.price < v.effectiveCost) {
        out.push({
          code: 'PRICE_BELOW_COST',
          message: `Giá ${i.price.toLocaleString('vi-VN')}đ của ${v.sku} thấp hơn giá vốn ${v.effectiveCost.toLocaleString('vi-VN')}đ`,
          variantId: i.variantId,
          sku: v.sku,
          price: i.price,
          costPrice: v.effectiveCost,
        });
      }
    }
    return out;
  }

  private async auditItems(
    user: AuthUser,
    list: PriceList,
    changes: { variantId: string; price: number | null; before: number | null }[],
    ctx: RequestContext,
  ) {
    if (!changes.length) return;
    await this.audit.record({
      action: AuditAction.PRICE_CHANGE,
      entity: PRICE_LIST_ENTITY,
      entityId: list.id,
      actor: user,
      branchId: list.branchId,
      before: { items: changes.map((c) => ({ variantId: c.variantId, price: c.before })) },
      after: {
        priceList: list.name,
        items: changes.map((c) => ({ variantId: c.variantId, price: c.price })),
      },
      context: ctx,
    });
  }

  /** Friendly pre-check; the DB exclusion constraint remains the authority (concurrent requests). */
  private async assertNoOverlap(excludeId: string | null, branchId: string, from: Date, to: Date | null) {
    const conflicts = await this.findOverlaps(excludeId, branchId, from, to);
    if (conflicts.length) throw this.overlapError(conflicts);
  }

  private findOverlaps(excludeId: string | null, branchId: string, from: Date, to: Date | null) {
    // [from, to) overlaps [f2, t2) ⇔ f2 < to AND (t2 IS NULL OR t2 > from)
    return this.prisma.priceList.findMany({
      where: {
        branchId,
        isActive: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        ...(to ? { effectiveFrom: { lt: to } } : {}),
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: from } }],
      },
      select: { id: true, name: true, effectiveFrom: true, effectiveTo: true },
    });
  }

  private overlapError(
    conflicts: { id: string; name: string; effectiveFrom: Date; effectiveTo: Date | null }[],
  ) {
    const names = conflicts.map((c) => `"${c.name}"`).join(', ');
    return apiError(
      HttpStatus.CONFLICT,
      ErrorCode.PRICE_LIST_OVERLAP,
      `Khoảng hiệu lực bị chồng với bảng giá ${names} của cùng chi nhánh`,
      { conflicts },
    );
  }

  private async withOverlapMapping<T>(
    branchId: string,
    from: Date,
    to: Date | null,
    excludeId: string | null,
    fn: () => Promise<T>,
  ): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (!isOverlapViolation(err)) throw err;
      const conflicts = await this.findOverlaps(excludeId, branchId, from, to);
      throw this.overlapError(conflicts);
    }
  }
}
