import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  ErrorCode,
  Role,
  SaleStatus,
  StockMovementType,
  type AuthUser,
  type AuthorizeDiscountInput,
  type CreateSaleInput,
  type CreateSaleReturnInput,
  type Paginated,
  type Sale,
  type SaleDetail,
  type SaleQuery,
  type SaleReturn,
} from '@retailchain/shared';
import { AuditSnapshotRegistry } from '../audit/audit-snapshot.registry';
import { assertBranchAccess, branchFilter } from '../common/authz/branch-scope';
import { badRequest, notFound, unauthorized } from '../common/http-errors';
import { verifyPassword } from '../common/security/password';
import { PrismaService } from '../prisma/prisma.service';
import { BranchesService } from '../branches/branches.service';
import { InventoryService } from '../inventory/inventory.service';
import { ProductsService } from '../products/products.service';
import { UsersService } from '../users/users.service';

export const SALE_ENTITY = 'Sale';
export const SALE_RETURN_ENTITY = 'SaleReturn';
const RETURN_WINDOW_DAYS = 7;

@Injectable()
export class SalesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branches: BranchesService,
    private readonly users: UsersService,
    private readonly products: ProductsService,
    private readonly inventory: InventoryService,
    private readonly snapshots: AuditSnapshotRegistry,
  ) {}

  onModuleInit(): void {
    this.snapshots.register(SALE_ENTITY, async (id: string) => {
      const s = await this.prisma.sale.findUnique({ where: { id } });
      if (!s) return null;
      return { id: s.id, code: s.code, total: s.total, status: s.status };
    });

    this.snapshots.register(SALE_RETURN_ENTITY, async (id: string) => {
      const r = await this.prisma.saleReturn.findUnique({ where: { id } });
      if (!r) return null;
      return { id: r.id, code: r.code, totalRefund: r.totalRefund };
    });
  }

  private async generateSaleCode(branchId: string): Promise<string> {
    const branch = await this.prisma.branch.findUniqueOrThrow({ where: { id: branchId } });
    const cleanBranchCode = branch.code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const datePrefix = `${yy}${mm}${dd}`;

    const countToday = await this.prisma.sale.count({
      where: {
        branchId,
        createdAtServer: {
          gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        },
      },
    });

    const seq = String(countToday + 1).padStart(4, '0');
    return `HD-${cleanBranchCode}-${datePrefix}-${seq}`;
  }

  private async generateReturnCode(branchId: string): Promise<string> {
    const branch = await this.prisma.branch.findUniqueOrThrow({ where: { id: branchId } });
    const cleanBranchCode = branch.code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const datePrefix = `${yy}${mm}${dd}`;

    const countToday = await this.prisma.saleReturn.count({
      where: {
        branchId,
        createdAt: {
          gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        },
      },
    });

    const seq = String(countToday + 1).padStart(4, '0');
    return `TH-${cleanBranchCode}-${datePrefix}-${seq}`;
  }

  async createSale(user: AuthUser, dto: CreateSaleInput): Promise<SaleDetail> {
    // 1. Idempotency check: if sale already created with this ID, return it immediately
    const existing = await this.prisma.sale.findUnique({
      where: { id: dto.id },
    });
    if (existing) {
      return this.getSale(user, dto.id);
    }

    assertBranchAccess(user, dto.branchId);

    // 2. Validate shift
    const shift = await this.prisma.shift.findUnique({
      where: { id: dto.shiftId },
    });
    if (!shift) {
      throw badRequest('Không tìm thấy ca làm việc');
    }
    if (shift.status !== 'OPEN') {
      throw badRequest('Ca làm việc đã đóng, không thể tạo đơn hàng');
    }
    if (shift.branchId !== dto.branchId) {
      throw badRequest('Ca làm việc không thuộc chi nhánh của hóa đơn');
    }

    // 3. Validate math
    let computedSubtotal = 0;
    for (const item of dto.items) {
      const lineExpected = Math.max(0, item.quantity * item.unitPrice - item.discount);
      if (item.lineTotal !== lineExpected) {
        throw badRequest(
          `Thành tiền dòng sản phẩm không khớp: ${item.lineTotal} khác tính toán ${lineExpected}`,
        );
      }
      computedSubtotal += item.lineTotal;
    }

    if (dto.subtotal !== computedSubtotal) {
      throw badRequest(`Tổng tiền phụ không khớp: ${dto.subtotal} khác tính toán ${computedSubtotal}`);
    }

    const computedTotal = Math.max(0, computedSubtotal - dto.discount);
    if (dto.total !== computedTotal) {
      throw badRequest(`Tổng thanh toán không khớp: ${dto.total} khác tính toán ${computedTotal}`);
    }

    const totalPaid = dto.payments.reduce((acc, p) => acc + p.amount, 0);
    if (totalPaid < dto.total) {
      throw badRequest(`Số tiền thanh toán (${totalPaid}) chưa đủ tổng tiền hóa đơn (${dto.total})`);
    }

    // 4. Generate human-readable code
    const code = await this.generateSaleCode(dto.branchId);

    // 5. Atomic persistence: Sale + Items + Payments + Inventory Movement (SALE)
    await this.prisma.$transaction(async (tx) => {
      await tx.sale.create({
        data: {
          id: dto.id,
          code,
          branchId: dto.branchId,
          shiftId: dto.shiftId,
          cashierId: user.id,
          customerId: dto.customerId ?? null,
          subtotal: dto.subtotal,
          discount: dto.discount,
          total: dto.total,
          status: 'COMPLETED',
          note: dto.note ?? null,
          createdAtClient: new Date(dto.createdAtClient),
          items: {
            create: dto.items.map((i) => ({
              variantId: i.variantId,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              discount: i.discount,
              lineTotal: i.lineTotal,
            })),
          },
          payments: {
            create: dto.payments.map((p) => ({
              method: p.method,
              amount: p.amount,
              reference: p.reference ?? null,
            })),
          },
        },
      });

      // Apply inventory movement (negative quantity for sale)
      const movements = dto.items.map((item) => ({
        branchId: dto.branchId,
        variantId: item.variantId,
        type: StockMovementType.SALE,
        quantity: -item.quantity,
        refType: 'Sale',
        refId: dto.id,
        createdBy: user.id,
      }));

      await this.inventory.applyMovements(movements, tx);
    });

    return this.getSale(user, dto.id);
  }

  async createReturn(user: AuthUser, saleId: string, dto: CreateSaleReturnInput): Promise<SaleReturn> {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { items: true },
    });

    if (!sale) {
      throw notFound('Không tìm thấy hóa đơn cần đổi trả');
    }

    assertBranchAccess(user, sale.branchId);

    // Check return window
    const ageMs = Date.now() - sale.createdAtServer.getTime();
    const maxAgeMs = RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    if (ageMs > maxAgeMs) {
      throw badRequest(`Chỉ được đổi trả hàng trong vòng ${RETURN_WINDOW_DAYS} ngày kể từ ngày mua`);
    }

    // Cashier must have an OPEN shift at this branch to perform return
    const currentShift = await this.prisma.shift.findFirst({
      where: {
        cashierId: user.id,
        branchId: sale.branchId,
        status: 'OPEN',
      },
    });

    if (!currentShift) {
      throw badRequest('Thu ngân cần mở ca làm việc trước khi thực hiện đổi trả hàng');
    }

    // Validate return items against sale items
    const saleItemsMap = new Map(sale.items.map((i) => [i.id, i]));
    let totalRefund = 0;

    for (const returnItem of dto.items) {
      const origItem = saleItemsMap.get(returnItem.saleItemId);
      if (!origItem) {
        throw badRequest(`Sản phẩm ${returnItem.saleItemId} không nằm trong hóa đơn gốc`);
      }
      if (origItem.variantId !== returnItem.variantId) {
        throw badRequest(`variantId không khớp với dòng hàng trong hóa đơn gốc`);
      }
      const remaining = origItem.quantity - origItem.returnedQuantity;
      if (returnItem.quantity > remaining) {
        throw badRequest(`Số lượng trả (${returnItem.quantity}) vượt quá số lượng còn lại có thể trả (${remaining})`);
      }
      totalRefund += returnItem.refundAmount;
    }

    const returnCode = await this.generateReturnCode(sale.branchId);

    let returnRecordId = '';

    await this.prisma.$transaction(async (tx) => {
      const createdReturn = await tx.saleReturn.create({
        data: {
          code: returnCode,
          saleId: sale.id,
          branchId: sale.branchId,
          shiftId: currentShift.id,
          cashierId: user.id,
          reason: dto.reason,
          totalRefund,
          items: {
            create: dto.items.map((i) => ({
              saleItemId: i.saleItemId,
              variantId: i.variantId,
              quantity: i.quantity,
              refundAmount: i.refundAmount,
            })),
          },
        },
      });

      returnRecordId = createdReturn.id;

      // Update returnedQuantity on saleItems
      for (const returnItem of dto.items) {
        await tx.saleItem.update({
          where: { id: returnItem.saleItemId },
          data: {
            returnedQuantity: { increment: returnItem.quantity },
          },
        });
      }

      // Check new overall sale return status
      const updatedSaleItems = await tx.saleItem.findMany({
        where: { saleId: sale.id },
      });
      const allFullyReturned = updatedSaleItems.every((i) => i.returnedQuantity >= i.quantity);
      const newStatus = allFullyReturned ? SaleStatus.RETURNED_FULL : SaleStatus.RETURNED_PARTIAL;

      await tx.sale.update({
        where: { id: sale.id },
        data: { status: newStatus },
      });

      // Apply inventory movement (positive quantity for return)
      const movements = dto.items.map((item) => ({
        branchId: sale.branchId,
        variantId: item.variantId,
        type: StockMovementType.RETURN,
        quantity: item.quantity,
        refType: 'SaleReturn',
        refId: createdReturn.id,
        createdBy: user.id,
      }));

      await this.inventory.applyMovements(movements, tx);
    });

    const fullReturn = await this.prisma.saleReturn.findUniqueOrThrow({
      where: { id: returnRecordId },
      include: { items: true },
    });

    const variantIds = fullReturn.items.map((i) => i.variantId);
    const variantsMap = await this.products.describeVariants(variantIds);

    const [branchesMap, usersMap] = await Promise.all([
      this.branches.describeBranches([sale.branchId]),
      this.users.describeUsers([user.id]),
    ]);

    return {
      id: fullReturn.id,
      code: fullReturn.code,
      saleId: fullReturn.saleId,
      saleCode: sale.code,
      branchId: fullReturn.branchId,
      branchName: branchesMap.get(fullReturn.branchId)?.name,
      shiftId: fullReturn.shiftId,
      cashierId: fullReturn.cashierId,
      cashierName: usersMap.get(fullReturn.cashierId)?.fullName,
      reason: fullReturn.reason,
      totalRefund: fullReturn.totalRefund,
      createdAt: fullReturn.createdAt.toISOString(),
      items: fullReturn.items.map((i) => {
        const v = variantsMap.get(i.variantId);
        return {
          id: i.id,
          returnId: i.returnId,
          saleItemId: i.saleItemId,
          variantId: i.variantId,
          variantName: v ? `${v.productName} - ${v.name}` : undefined,
          sku: v?.sku,
          unit: v?.unit,
          quantity: i.quantity,
          refundAmount: i.refundAmount,
        };
      }),
    };
  }

  async authorizeDiscount(user: AuthUser, dto: AuthorizeDiscountInput): Promise<{
    authorized: boolean;
    managerName: string;
    managerRole: Role;
  }> {
    const targetUser = await this.users.findForLogin(dto.username);
    if (!targetUser) {
      throw unauthorized(ErrorCode.INVALID_CREDENTIALS, 'Tên đăng nhập hoặc mật khẩu quản lý không đúng');
    }

    const passwordOk = await verifyPassword(targetUser.passwordHash, dto.password);
    if (!passwordOk) {
      throw unauthorized(ErrorCode.INVALID_CREDENTIALS, 'Tên đăng nhập hoặc mật khẩu quản lý không đúng');
    }

    const isOwner = targetUser.role === Role.OWNER;
    const isBranchManager =
      targetUser.role === Role.BRANCH_MANAGER && (!user.branchId || targetUser.branchId === user.branchId);

    if (!isOwner && !isBranchManager) {
      throw badRequest('Tài khoản này không có quyền phê duyệt giảm giá cho chi nhánh');
    }

    return {
      authorized: true,
      managerName: targetUser.fullName,
      managerRole: targetUser.role as Role,
    };
  }

  async getSale(user: AuthUser, id: string): Promise<SaleDetail> {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        items: true,
        payments: true,
      },
    });

    if (!sale) {
      throw notFound('Không tìm thấy hóa đơn');
    }

    assertBranchAccess(user, sale.branchId);

    const variantIds = sale.items.map((i) => i.variantId);
    const [variantsMap, branchesMap, usersMap] = await Promise.all([
      this.products.describeVariants(variantIds),
      this.branches.describeBranches([sale.branchId]),
      this.users.describeUsers([sale.cashierId]),
    ]);

    return {
      id: sale.id,
      code: sale.code,
      branchId: sale.branchId,
      branchName: branchesMap.get(sale.branchId)?.name,
      shiftId: sale.shiftId,
      cashierId: sale.cashierId,
      cashierName: usersMap.get(sale.cashierId)?.fullName,
      customerId: sale.customerId,
      subtotal: sale.subtotal,
      discount: sale.discount,
      total: sale.total,
      status: sale.status as SaleStatus,
      note: sale.note,
      createdAtClient: sale.createdAtClient.toISOString(),
      createdAtServer: sale.createdAtServer.toISOString(),
      updatedAt: sale.updatedAt.toISOString(),
      itemCount: sale.items.length,
      items: sale.items.map((i) => {
        const v = variantsMap.get(i.variantId);
        return {
          id: i.id,
          saleId: i.saleId,
          variantId: i.variantId,
          variantName: v ? `${v.productName} - ${v.name}` : undefined,
          productName: v?.productName,
          sku: v?.sku,
          unit: v?.unit,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          discount: i.discount,
          lineTotal: i.lineTotal,
          returnedQuantity: i.returnedQuantity,
        };
      }),
      payments: sale.payments.map((p) => ({
        id: p.id,
        saleId: p.saleId,
        method: p.method,
        amount: p.amount,
        reference: p.reference,
        createdAt: p.createdAt.toISOString(),
      })),
    };
  }

  async getSales(user: AuthUser, query: SaleQuery): Promise<Paginated<Sale>> {
    const scopedBranchId = branchFilter(user, query.branchId);

    const where = {
      ...(scopedBranchId ? { branchId: scopedBranchId } : {}),
      ...(query.shiftId ? { shiftId: query.shiftId } : {}),
      ...(query.cashierId ? { cashierId: query.cashierId } : {}),
      ...(query.code ? { code: { contains: query.code } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            createdAtServer: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.sale.count({ where }),
      this.prisma.sale.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAtServer: 'desc' },
        include: {
          _count: { select: { items: true } },
        },
      }),
    ]);

    const branchIds = Array.from(new Set(items.map((s) => s.branchId)));
    const cashierIds = Array.from(new Set(items.map((s) => s.cashierId)));

    const [branchesMap, usersMap] = await Promise.all([
      this.branches.describeBranches(branchIds),
      this.users.describeUsers(cashierIds),
    ]);

    return {
      items: items.map((s) => ({
        id: s.id,
        code: s.code,
        branchId: s.branchId,
        branchName: branchesMap.get(s.branchId)?.name,
        shiftId: s.shiftId,
        cashierId: s.cashierId,
        cashierName: usersMap.get(s.cashierId)?.fullName,
        customerId: s.customerId,
        subtotal: s.subtotal,
        discount: s.discount,
        total: s.total,
        status: s.status as SaleStatus,
        note: s.note,
        createdAtClient: s.createdAtClient.toISOString(),
        createdAtServer: s.createdAtServer.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        itemCount: s._count.items,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}
