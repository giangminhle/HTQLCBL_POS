import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  StockMovementType,
  StockTransferStatus,
  type AuthUser,
  type CreateStockTransfer,
  type Paginated,
  type ReceiveStockTransfer,
  type StockTransfer,
  type StockTransferItem,
  type StockTransferQuery,
} from '@retailchain/shared';
import { AuditSnapshotRegistry } from '../audit/audit-snapshot.registry';
import { assertBranchAccess, canAccessBranch } from '../common/authz/branch-scope';
import { badRequest, notFound } from '../common/http-errors';
import { PrismaService } from '../prisma/prisma.service';
import { BranchesService } from '../branches/branches.service';
import { ProductsService } from '../products/products.service';
import { UsersService } from '../users/users.service';
import { InventoryService } from './inventory.service';

export const STOCK_TRANSFER_ENTITY = 'StockTransfer';

@Injectable()
export class StockTransfersService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly branches: BranchesService,
    private readonly products: ProductsService,
    private readonly users: UsersService,
    private readonly snapshots: AuditSnapshotRegistry,
  ) {}

  onModuleInit(): void {
    this.snapshots.register(STOCK_TRANSFER_ENTITY, (id) =>
      this.prisma.stockTransfer.findUnique({
        where: { id },
        include: { items: true },
      }),
    );
  }

  private async generateCode(): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.prisma.stockTransfer.count({
      where: {
        code: { startsWith: `PCK-${dateStr}` },
      },
    });
    return `PCK-${dateStr}-${String(count + 1).padStart(4, '0')}`;
  }

  async list(viewer: AuthUser, query: StockTransferQuery): Promise<Paginated<StockTransfer>> {
    const { page, pageSize } = query;

    const where: Prisma.StockTransferWhereInput = {
      ...(query.status ? { status: query.status as StockTransferStatus } : {}),
      ...(viewer.role === 'OWNER'
        ? query.branchId
          ? { OR: [{ fromBranchId: query.branchId }, { toBranchId: query.branchId }] }
          : {}
        : {
            OR: [{ fromBranchId: viewer.branchId ?? '' }, { toBranchId: viewer.branchId ?? '' }],
          }),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stockTransfer.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.stockTransfer.count({ where }),
    ]);

    const branchIds = new Set<string>();
    const userIds = new Set<string>();
    for (const r of rows) {
      branchIds.add(r.fromBranchId);
      branchIds.add(r.toBranchId);
      userIds.add(r.createdBy);
      if (r.sentBy) userIds.add(r.sentBy);
      if (r.receivedBy) userIds.add(r.receivedBy);
    }

    const branchMap = await this.branches.describeBranches([...branchIds]);
    const userMap = await this.users.describeUsers([...userIds]);

    const items: StockTransfer[] = rows.map((r) => ({
      id: r.id,
      code: r.code,
      fromBranchId: r.fromBranchId,
      fromBranchName: branchMap.get(r.fromBranchId)?.name ?? r.fromBranchId,
      toBranchId: r.toBranchId,
      toBranchName: branchMap.get(r.toBranchId)?.name ?? r.toBranchId,
      note: r.note,
      status: r.status as StockTransferStatus,
      sentBy: r.sentBy,
      sentByName: r.sentBy ? (userMap.get(r.sentBy)?.fullName ?? r.sentBy) : null,
      sentAt: r.sentAt?.toISOString() ?? null,
      receivedBy: r.receivedBy,
      receivedByName: r.receivedBy ? (userMap.get(r.receivedBy)?.fullName ?? r.receivedBy) : null,
      receivedAt: r.receivedAt?.toISOString() ?? null,
      createdBy: r.createdBy,
      createdByName: userMap.get(r.createdBy)?.fullName ?? r.createdBy,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      items: r.items.map((i) => ({
        id: i.id,
        transferId: i.transferId,
        variantId: i.variantId,
        sentQuantity: i.sentQuantity,
        receivedQuantity: i.receivedQuantity,
      })),
    }));

    return { items, total, page, pageSize };
  }

  async get(viewer: AuthUser, id: string): Promise<StockTransfer> {
    const row = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!row) throw notFound('Không tìm thấy phiếu chuyển kho');

    if (
      !canAccessBranch(viewer, row.fromBranchId) &&
      !canAccessBranch(viewer, row.toBranchId) &&
      viewer.role !== 'OWNER'
    ) {
      throw notFound('Không tìm thấy phiếu chuyển kho');
    }

    const branchMap = await this.branches.describeBranches([row.fromBranchId, row.toBranchId]);
    const userIds = [row.createdBy, row.sentBy, row.receivedBy].filter(Boolean) as string[];
    const userMap = await this.users.describeUsers(userIds);
    const variantMap = await this.products.describeVariants(row.items.map((i) => i.variantId));

    const items: StockTransferItem[] = row.items.map((i) => {
      const v = variantMap.get(i.variantId);
      return {
        id: i.id,
        transferId: i.transferId,
        variantId: i.variantId,
        variantSku: v?.sku,
        variantName: v?.name,
        productName: v?.productName,
        unit: v?.unit,
        sentQuantity: i.sentQuantity,
        receivedQuantity: i.receivedQuantity,
      };
    });

    return {
      id: row.id,
      code: row.code,
      fromBranchId: row.fromBranchId,
      fromBranchName: branchMap.get(row.fromBranchId)?.name ?? row.fromBranchId,
      toBranchId: row.toBranchId,
      toBranchName: branchMap.get(row.toBranchId)?.name ?? row.toBranchId,
      note: row.note,
      status: row.status as StockTransferStatus,
      sentBy: row.sentBy,
      sentByName: row.sentBy ? (userMap.get(row.sentBy)?.fullName ?? row.sentBy) : null,
      sentAt: row.sentAt?.toISOString() ?? null,
      receivedBy: row.receivedBy,
      receivedByName: row.receivedBy ? (userMap.get(row.receivedBy)?.fullName ?? row.receivedBy) : null,
      receivedAt: row.receivedAt?.toISOString() ?? null,
      createdBy: row.createdBy,
      createdByName: userMap.get(row.createdBy)?.fullName ?? row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      items,
    };
  }

  async create(viewer: AuthUser, dto: CreateStockTransfer): Promise<StockTransfer> {
    if (dto.fromBranchId === dto.toBranchId) {
      throw badRequest('Chi nhánh gửi và chi nhánh nhận không được trùng nhau');
    }

    assertBranchAccess(viewer, dto.fromBranchId);

    const [fromBranch, toBranch] = await Promise.all([
      this.branches.isActiveBranch(dto.fromBranchId),
      this.branches.isActiveBranch(dto.toBranchId),
    ]);

    if (!fromBranch || !toBranch) {
      throw badRequest('Chi nhánh gửi hoặc chi nhánh nhận không tồn tại hoặc đã ngưng hoạt động');
    }

    const code = await this.generateCode();

    const created = await this.prisma.stockTransfer.create({
      data: {
        code,
        fromBranchId: dto.fromBranchId,
        toBranchId: dto.toBranchId,
        note: dto.note ?? null,
        status: StockTransferStatus.DRAFT,
        createdBy: viewer.id,
        items: {
          create: dto.items.map((item) => ({
            variantId: item.variantId,
            sentQuantity: item.sentQuantity,
          })),
        },
      },
    });

    return this.get(viewer, created.id);
  }

  async send(viewer: AuthUser, id: string): Promise<StockTransfer> {
    const row = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!row) throw notFound('Không tìm thấy phiếu chuyển kho');
    assertBranchAccess(viewer, row.fromBranchId);

    if (row.status !== StockTransferStatus.DRAFT) {
      throw badRequest('Chỉ có thể gửi hàng đối với phiếu chuyển đang ở trạng thái DRAFT');
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Verify stock availability at sending branch
      const balances = await tx.stockBalance.findMany({
        where: {
          branchId: row.fromBranchId,
          variantId: { in: row.items.map((i) => i.variantId) },
        },
      });
      const balanceMap = new Map(balances.map((b) => [b.variantId, b.quantity]));

      for (const item of row.items) {
        const available = balanceMap.get(item.variantId) ?? 0;
        if (available < item.sentQuantity) {
          throw badRequest(
            `Tồn kho tại chi nhánh gửi không đủ (hiện có: ${available}, yêu cầu: ${item.sentQuantity})`,
          );
        }
      }

      // 2. Mark as SENT
      await tx.stockTransfer.update({
        where: { id },
        data: {
          status: StockTransferStatus.SENT,
          sentBy: viewer.id,
          sentAt: new Date(),
        },
      });

      // 3. Apply TRANSFER_OUT movement (negative quantity)
      await this.inventory.applyMovements(
        row.items.map((item) => ({
          branchId: row.fromBranchId,
          variantId: item.variantId,
          type: StockMovementType.TRANSFER_OUT,
          quantity: -item.sentQuantity,
          refType: STOCK_TRANSFER_ENTITY,
          refId: row.id,
          createdBy: viewer.id,
        })),
        tx,
      );
    });

    return this.get(viewer, id);
  }

  async receive(viewer: AuthUser, id: string, dto: ReceiveStockTransfer): Promise<StockTransfer> {
    const row = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!row) throw notFound('Không tìm thấy phiếu chuyển kho');
    assertBranchAccess(viewer, row.toBranchId);

    if (row.status !== StockTransferStatus.SENT) {
      throw badRequest('Chỉ có thể nhận hàng đối với phiếu chuyển đang ở trạng thái SENT');
    }

    const itemMap = new Map(row.items.map((i) => [i.id, i]));
    for (const rItem of dto.items) {
      if (!itemMap.has(rItem.itemId)) {
        throw badRequest(`Sản phẩm chuyển kho không hợp lệ: ${rItem.itemId}`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Update receivedQuantity for each item
      for (const rItem of dto.items) {
        await tx.stockTransferItem.update({
          where: { id: rItem.itemId },
          data: { receivedQuantity: rItem.receivedQuantity },
        });
      }

      // 2. Mark as RECEIVED
      await tx.stockTransfer.update({
        where: { id },
        data: {
          status: StockTransferStatus.RECEIVED,
          receivedBy: viewer.id,
          receivedAt: new Date(),
        },
      });

      // 3. Apply TRANSFER_IN movements at toBranchId for actual received quantities > 0
      const movements = dto.items
        .map((rItem) => {
          const original = itemMap.get(rItem.itemId)!;
          return {
            branchId: row.toBranchId,
            variantId: original.variantId,
            type: StockMovementType.TRANSFER_IN,
            quantity: rItem.receivedQuantity,
            refType: STOCK_TRANSFER_ENTITY,
            refId: row.id,
            createdBy: viewer.id,
          };
        })
        .filter((m) => m.quantity > 0);

      if (movements.length > 0) {
        await this.inventory.applyMovements(movements, tx);
      }
    });

    return this.get(viewer, id);
  }
}
