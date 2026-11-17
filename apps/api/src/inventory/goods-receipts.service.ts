import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  GoodsReceiptStatus,
  StockMovementType,
  type AuthUser,
  type CreateGoodsReceipt,
  type GoodsReceipt,
  type GoodsReceiptItem,
  type GoodsReceiptQuery,
  type Paginated,
  type UpdateGoodsReceipt,
} from '@retailchain/shared';
import { AuditSnapshotRegistry } from '../audit/audit-snapshot.registry';
import { assertBranchAccess, branchFilter } from '../common/authz/branch-scope';
import { badRequest, notFound } from '../common/http-errors';
import { PrismaService } from '../prisma/prisma.service';
import { BranchesService } from '../branches/branches.service';
import { ProductsService } from '../products/products.service';
import { UsersService } from '../users/users.service';
import { InventoryService } from './inventory.service';

export const GOODS_RECEIPT_ENTITY = 'GoodsReceipt';

@Injectable()
export class GoodsReceiptsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly branches: BranchesService,
    private readonly products: ProductsService,
    private readonly users: UsersService,
    private readonly snapshots: AuditSnapshotRegistry,
  ) {}

  onModuleInit(): void {
    this.snapshots.register(GOODS_RECEIPT_ENTITY, (id) =>
      this.prisma.goodsReceipt.findUnique({
        where: { id },
        include: { items: true, supplier: true },
      }),
    );
  }

  private async generateCode(): Promise<string> {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.prisma.goodsReceipt.count({
      where: {
        code: { startsWith: `PNK-${dateStr}` },
      },
    });
    return `PNK-${dateStr}-${String(count + 1).padStart(4, '0')}`;
  }

  async list(viewer: AuthUser, query: GoodsReceiptQuery): Promise<Paginated<GoodsReceipt>> {
    const { page, pageSize } = query;
    const scopedBranchId = branchFilter(viewer, query.branchId);

    const where: Prisma.GoodsReceiptWhereInput = {
      ...(scopedBranchId ? { branchId: scopedBranchId } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.status ? { status: query.status as GoodsReceiptStatus } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.goodsReceipt.findMany({
        where,
        include: {
          items: true,
          supplier: { select: { id: true, name: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.goodsReceipt.count({ where }),
    ]);

    const branchMap = await this.branches.describeBranches(rows.map((r) => r.branchId));
    const userMap = await this.users.describeUsers(rows.map((r) => r.createdBy));

    const items: GoodsReceipt[] = rows.map((r) => {
      const branch = branchMap.get(r.branchId);
      const user = userMap.get(r.createdBy);
      const totalQuantity = r.items.reduce((sum, item) => sum + item.quantity, 0);
      const totalCost = r.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);

      return {
        id: r.id,
        code: r.code,
        supplierId: r.supplierId,
        supplierName: r.supplier.name,
        branchId: r.branchId,
        branchName: branch?.name ?? r.branchId,
        note: r.note,
        status: r.status as GoodsReceiptStatus,
        createdBy: r.createdBy,
        createdByName: user?.fullName ?? user?.username,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        totalQuantity,
        totalCost,
        items: r.items.map((i) => ({
          id: i.id,
          receiptId: i.receiptId,
          variantId: i.variantId,
          quantity: i.quantity,
          unitCost: i.unitCost,
        })),
      };
    });

    return { items, total, page, pageSize };
  }

  async get(viewer: AuthUser, id: string): Promise<GoodsReceipt> {
    const row = await this.prisma.goodsReceipt.findUnique({
      where: { id },
      include: {
        items: true,
        supplier: { select: { id: true, name: true, code: true } },
      },
    });

    if (!row) throw notFound('Không tìm thấy phiếu nhập kho');
    assertBranchAccess(viewer, row.branchId);

    const branchMap = await this.branches.describeBranches([row.branchId]);
    const userMap = await this.users.describeUsers([row.createdBy]);
    const variantMap = await this.products.describeVariants(row.items.map((i) => i.variantId));

    const totalQuantity = row.items.reduce((sum, item) => sum + item.quantity, 0);
    const totalCost = row.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);

    const decoratedItems: GoodsReceiptItem[] = row.items.map((i) => {
      const v = variantMap.get(i.variantId);
      return {
        id: i.id,
        receiptId: i.receiptId,
        variantId: i.variantId,
        variantSku: v?.sku,
        variantName: v?.name,
        productName: v?.productName,
        unit: v?.unit,
        quantity: i.quantity,
        unitCost: i.unitCost,
      };
    });

    return {
      id: row.id,
      code: row.code,
      supplierId: row.supplierId,
      supplierName: row.supplier.name,
      branchId: row.branchId,
      branchName: branchMap.get(row.branchId)?.name ?? row.branchId,
      note: row.note,
      status: row.status as GoodsReceiptStatus,
      createdBy: row.createdBy,
      createdByName: userMap.get(row.createdBy)?.fullName ?? row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      totalQuantity,
      totalCost,
      items: decoratedItems,
    };
  }

  async create(viewer: AuthUser, dto: CreateGoodsReceipt): Promise<GoodsReceipt> {
    assertBranchAccess(viewer, dto.branchId);

    const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier || !supplier.isActive) {
      throw badRequest('Nhà cung cấp không tồn tại hoặc đã ngưng hoạt động');
    }

    const code = await this.generateCode();

    const created = await this.prisma.$transaction(async (tx) => {
      const receipt = await tx.goodsReceipt.create({
        data: {
          code,
          supplierId: dto.supplierId,
          branchId: dto.branchId,
          note: dto.note ?? null,
          status: GoodsReceiptStatus.DRAFT,
          createdBy: viewer.id,
          items: {
            create: dto.items.map((item) => ({
              variantId: item.variantId,
              quantity: item.quantity,
              unitCost: item.unitCost,
            })),
          },
        },
        include: { items: true },
      });

      if (dto.complete) {
        // Apply ledger movements immediately
        await this.inventory.applyMovements(
          dto.items.map((item) => ({
            branchId: dto.branchId,
            variantId: item.variantId,
            type: StockMovementType.IMPORT,
            quantity: item.quantity,
            refType: GOODS_RECEIPT_ENTITY,
            refId: receipt.id,
            createdBy: viewer.id,
          })),
          tx,
        );

        await tx.goodsReceipt.update({
          where: { id: receipt.id },
          data: { status: GoodsReceiptStatus.COMPLETED },
        });
      }

      return receipt;
    });

    return this.get(viewer, created.id);
  }

  async update(viewer: AuthUser, id: string, dto: UpdateGoodsReceipt): Promise<GoodsReceipt> {
    const row = await this.prisma.goodsReceipt.findUnique({ where: { id } });
    if (!row) throw notFound('Không tìm thấy phiếu nhập kho');
    assertBranchAccess(viewer, row.branchId);

    if (row.status === GoodsReceiptStatus.COMPLETED) {
      throw badRequest('Không thể chỉnh sửa phiếu nhập đã hoàn thành');
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.items && dto.items.length > 0) {
        await tx.goodsReceiptItem.deleteMany({ where: { receiptId: id } });
        await tx.goodsReceiptItem.createMany({
          data: dto.items.map((item) => ({
            receiptId: id,
            variantId: item.variantId,
            quantity: item.quantity,
            unitCost: item.unitCost,
          })),
        });
      }

      await tx.goodsReceipt.update({
        where: { id },
        data: {
          ...(dto.supplierId ? { supplierId: dto.supplierId } : {}),
          ...(dto.note !== undefined ? { note: dto.note } : {}),
        },
      });
    });

    return this.get(viewer, id);
  }

  async complete(viewer: AuthUser, id: string): Promise<GoodsReceipt> {
    const row = await this.prisma.goodsReceipt.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!row) throw notFound('Không tìm thấy phiếu nhập kho');
    assertBranchAccess(viewer, row.branchId);

    if (row.status === GoodsReceiptStatus.COMPLETED) {
      throw badRequest('Phiếu nhập kho này đã hoàn thành trước đó');
    }

    if (row.items.length === 0) {
      throw badRequest('Phiếu nhập kho không có sản phẩm');
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Mark as completed
      await tx.goodsReceipt.update({
        where: { id },
        data: { status: GoodsReceiptStatus.COMPLETED },
      });

      // 2. Apply movements via InventoryService
      await this.inventory.applyMovements(
        row.items.map((item) => ({
          branchId: row.branchId,
          variantId: item.variantId,
          type: StockMovementType.IMPORT,
          quantity: item.quantity,
          refType: GOODS_RECEIPT_ENTITY,
          refId: row.id,
          createdBy: viewer.id,
        })),
        tx,
      );
    });

    return this.get(viewer, id);
  }
}
