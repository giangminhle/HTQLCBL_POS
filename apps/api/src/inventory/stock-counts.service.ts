import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  StockCountStatus,
  StockMovementType,
  type AuthUser,
  type CreateStockCount,
  type Paginated,
  type StockCount,
  type StockCountItem,
  type StockCountQuery,
  type UpdateStockCount,
} from '@retailchain/shared';
import { AuditSnapshotRegistry } from '../audit/audit-snapshot.registry';
import { assertBranchAccess, branchFilter } from '../common/authz/branch-scope';
import { badRequest, notFound } from '../common/http-errors';
import { PrismaService } from '../prisma/prisma.service';
import { BranchesService } from '../branches/branches.service';
import { ProductsService } from '../products/products.service';
import { UsersService } from '../users/users.service';
import { InventoryService } from './inventory.service';

export const STOCK_COUNT_ENTITY = 'StockCount';

@Injectable()
export class StockCountsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly branches: BranchesService,
    private readonly products: ProductsService,
    private readonly users: UsersService,
    private readonly snapshots: AuditSnapshotRegistry,
  ) {}

  onModuleInit(): void {
    this.snapshots.register(STOCK_COUNT_ENTITY, (id) =>
      this.prisma.stockCount.findUnique({
        where: { id },
        include: { items: true },
      }),
    );
  }

  private async generateCode(): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.prisma.stockCount.count({
      where: {
        code: { startsWith: `PKK-${dateStr}` },
      },
    });
    return `PKK-${dateStr}-${String(count + 1).padStart(4, '0')}`;
  }

  async list(viewer: AuthUser, query: StockCountQuery): Promise<Paginated<StockCount>> {
    const { page, pageSize } = query;
    const scopedBranchId = branchFilter(viewer, query.branchId);

    const where: Prisma.StockCountWhereInput = {
      ...(scopedBranchId ? { branchId: scopedBranchId } : {}),
      ...(query.status ? { status: query.status as StockCountStatus } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stockCount.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.stockCount.count({ where }),
    ]);

    const branchMap = await this.branches.describeBranches(rows.map((r) => r.branchId));
    const userIds = new Set<string>();
    for (const r of rows) {
      userIds.add(r.createdBy);
      if (r.completedBy) userIds.add(r.completedBy);
    }
    const userMap = await this.users.describeUsers([...userIds]);

    const items: StockCount[] = rows.map((r) => ({
      id: r.id,
      code: r.code,
      branchId: r.branchId,
      branchName: branchMap.get(r.branchId)?.name ?? r.branchId,
      note: r.note,
      status: r.status as StockCountStatus,
      createdBy: r.createdBy,
      createdByName: userMap.get(r.createdBy)?.fullName ?? r.createdBy,
      completedBy: r.completedBy,
      completedByName: r.completedBy ? userMap.get(r.completedBy)?.fullName ?? r.completedBy : null,
      completedAt: r.completedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      items: r.items.map((i) => ({
        id: i.id,
        countId: i.countId,
        variantId: i.variantId,
        systemQuantity: i.systemQuantity,
        actualQuantity: i.actualQuantity,
      })),
    }));

    return { items, total, page, pageSize };
  }

  async get(viewer: AuthUser, id: string): Promise<StockCount> {
    const row = await this.prisma.stockCount.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!row) throw notFound('Không tìm thấy phiếu kiểm kê');
    assertBranchAccess(viewer, row.branchId);

    const branchMap = await this.branches.describeBranches([row.branchId]);
    const userIds = [row.createdBy, row.completedBy].filter(Boolean) as string[];
    const userMap = await this.users.describeUsers(userIds);
    const variantMap = await this.products.describeVariants(row.items.map((i) => i.variantId));

    const items: StockCountItem[] = row.items.map((i) => {
      const v = variantMap.get(i.variantId);
      return {
        id: i.id,
        countId: i.countId,
        variantId: i.variantId,
        variantSku: v?.sku,
        variantName: v?.name,
        productName: v?.productName,
        unit: v?.unit,
        systemQuantity: i.systemQuantity,
        actualQuantity: i.actualQuantity,
      };
    });

    return {
      id: row.id,
      code: row.code,
      branchId: row.branchId,
      branchName: branchMap.get(row.branchId)?.name ?? row.branchId,
      note: row.note,
      status: row.status as StockCountStatus,
      createdBy: row.createdBy,
      createdByName: userMap.get(row.createdBy)?.fullName ?? row.createdBy,
      completedBy: row.completedBy,
      completedByName: row.completedBy ? userMap.get(row.completedBy)?.fullName ?? row.completedBy : null,
      completedAt: row.completedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      items,
    };
  }

  async create(viewer: AuthUser, dto: CreateStockCount): Promise<StockCount> {
    assertBranchAccess(viewer, dto.branchId);

    const code = await this.generateCode();

    // Snapshot current system stock for items
    const balances = await this.prisma.stockBalance.findMany({
      where: {
        branchId: dto.branchId,
        variantId: { in: dto.items.map((i) => i.variantId) },
      },
    });
    const balanceMap = new Map(balances.map((b) => [b.variantId, b.quantity]));

    const created = await this.prisma.stockCount.create({
      data: {
        code,
        branchId: dto.branchId,
        note: dto.note ?? null,
        status: StockCountStatus.DRAFT,
        createdBy: viewer.id,
        items: {
          create: dto.items.map((item) => ({
            variantId: item.variantId,
            systemQuantity: balanceMap.get(item.variantId) ?? 0,
            actualQuantity: null,
          })),
        },
      },
    });

    return this.get(viewer, created.id);
  }

  async update(viewer: AuthUser, id: string, dto: UpdateStockCount): Promise<StockCount> {
    const row = await this.prisma.stockCount.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!row) throw notFound('Không tìm thấy phiếu kiểm kê');
    assertBranchAccess(viewer, row.branchId);

    if (row.status !== StockCountStatus.DRAFT) {
      throw badRequest('Chỉ có thể cập nhật phiếu kiểm kê ở trạng thái DRAFT');
    }

    const itemMap = new Map(row.items.map((i) => [i.id, i]));
    for (const item of dto.items) {
      if (!itemMap.has(item.itemId)) {
        throw badRequest(`Sản phẩm kiểm kê không hợp lệ: ${item.itemId}`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        await tx.stockCountItem.update({
          where: { id: item.itemId },
          data: { actualQuantity: item.actualQuantity },
        });
      }
    });

    return this.get(viewer, id);
  }

  async complete(viewer: AuthUser, id: string): Promise<StockCount> {
    const row = await this.prisma.stockCount.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!row) throw notFound('Không tìm thấy phiếu kiểm kê');
    assertBranchAccess(viewer, row.branchId);

    if (row.status !== StockCountStatus.DRAFT) {
      throw badRequest('Chỉ có thể chốt phiếu kiểm kê ở trạng thái DRAFT');
    }

    for (const item of row.items) {
      if (item.actualQuantity === null || item.actualQuantity === undefined) {
        throw badRequest('Chưa nhập đủ số lượng thực tế cho toàn bộ sản phẩm kiểm kê');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Mark as COMPLETED
      await tx.stockCount.update({
        where: { id },
        data: {
          status: StockCountStatus.COMPLETED,
          completedBy: viewer.id,
          completedAt: new Date(),
        },
      });

      // 2. Calculate adjustments
      const adjustments = row.items
        .map((item) => {
          const delta = item.actualQuantity! - item.systemQuantity;
          return {
            branchId: row.branchId,
            variantId: item.variantId,
            type: StockMovementType.ADJUSTMENT,
            quantity: delta,
            refType: STOCK_COUNT_ENTITY,
            refId: row.id,
            createdBy: viewer.id,
          };
        })
        .filter((adj) => adj.quantity !== 0);

      if (adjustments.length > 0) {
        await this.inventory.applyMovements(adjustments, tx);
      }
    });

    return this.get(viewer, id);
  }
}
