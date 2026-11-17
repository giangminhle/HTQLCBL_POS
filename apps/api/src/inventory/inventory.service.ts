import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type AuthUser,
  type BalanceQuery,
  type LowStockItem,
  type LowStockQuery,
  type MovementQuery,
  type Paginated,
  type StockBalanceItem,
  type StockMovementItem,
  type StockMovementType,
} from '@retailchain/shared';
import { AuditSnapshotRegistry } from '../audit/audit-snapshot.registry';
import { assertBranchAccess, branchFilter } from '../common/authz/branch-scope';
import { badRequest } from '../common/http-errors';
import { PrismaService } from '../prisma/prisma.service';
import { BranchesService } from '../branches/branches.service';
import { ProductsService } from '../products/products.service';
import { UsersService } from '../users/users.service';

export type Tx = Prisma.TransactionClient;

export interface StockMovementInput {
  branchId: string;
  variantId: string;
  type: StockMovementType;
  /** Signed quantity: positive for inbound, negative for outbound. */
  quantity: number;
  refType?: string;
  refId?: string;
  createdBy: string;
}

@Injectable()
export class InventoryService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly branches: BranchesService,
    private readonly users: UsersService,
    private readonly snapshots: AuditSnapshotRegistry,
  ) {}

  onModuleInit(): void {
    // Audit snapshots for inventory entities will be registered here or in their respective services
  }

  /**
   * The single authoritative ledger update method (CLAUDE.md rule 1).
   * Atomically records movements and updates stock_balances in the same transaction.
   * Acquires a row lock with SELECT ... FOR UPDATE on each balance row to prevent race conditions.
   */
  async applyMovements(movements: StockMovementInput[], externalTx?: Tx): Promise<void> {
    if (movements.length === 0) return;

    for (const m of movements) {
      if (m.quantity === 0) {
        throw badRequest('Số lượng biến động kho không được bằng 0');
      }
    }

    const run = async (tx: Tx) => {
      // Sort movements by branchId + variantId to enforce deterministic lock ordering and prevent deadlocks
      const sorted = [...movements].sort((a, b) =>
        `${a.branchId}:${a.variantId}`.localeCompare(`${b.branchId}:${b.variantId}`),
      );

      for (const m of sorted) {
        // 1. Ensure the balance record exists
        await tx.$executeRaw`
          INSERT INTO stock_balances (branch_id, variant_id, quantity, updated_at)
          VALUES (${m.branchId}::uuid, ${m.variantId}::uuid, 0, NOW())
          ON CONFLICT (branch_id, variant_id) DO NOTHING
        `;

        // 2. Lock the row with SELECT ... FOR UPDATE
        await tx.$queryRaw<{ quantity: number }[]>`
          SELECT quantity FROM stock_balances
          WHERE branch_id = ${m.branchId}::uuid AND variant_id = ${m.variantId}::uuid
          FOR UPDATE
        `;

        // 3. Atomically update the balance
        await tx.$executeRaw`
          UPDATE stock_balances
          SET quantity = quantity + ${m.quantity}, updated_at = NOW()
          WHERE branch_id = ${m.branchId}::uuid AND variant_id = ${m.variantId}::uuid
        `;
      }

      // 4. Record movements
      await tx.stockMovement.createMany({
        data: movements.map((m) => ({
          branchId: m.branchId,
          variantId: m.variantId,
          type: m.type,
          quantity: m.quantity,
          refType: m.refType ?? null,
          refId: m.refId ?? null,
          createdBy: m.createdBy,
        })),
      });
    };

    if (externalTx) {
      await run(externalTx);
    } else {
      await this.prisma.$transaction(run);
    }
  }

  /** Current stock balances with product and branch descriptors. */
  async getBalances(viewer: AuthUser, query: BalanceQuery): Promise<Paginated<StockBalanceItem>> {
    const { page, pageSize } = query;
    const scopedBranchId = branchFilter(viewer, query.branchId);

    let variantIdsFilter: string[] | undefined;
    if (query.q) {
      variantIdsFilter = await this.products.searchVariantIds(query.q);
      if (variantIdsFilter.length === 0) {
        return { items: [], total: 0, page, pageSize };
      }
    }

    const where: Prisma.StockBalanceWhereInput = {
      ...(scopedBranchId ? { branchId: scopedBranchId } : {}),
      ...(query.variantId ? { variantId: query.variantId } : {}),
      ...(variantIdsFilter ? { variantId: { in: variantIdsFilter } } : {}),
    };

    const [balances, total] = await this.prisma.$transaction([
      this.prisma.stockBalance.findMany({
        where,
        orderBy: [{ branchId: 'asc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.stockBalance.count({ where }),
    ]);

    if (balances.length === 0) {
      return { items: [], total: 0, page, pageSize };
    }

    const branchMap = await this.branches.describeBranches(balances.map((b) => b.branchId));
    const variantMap = await this.products.describeVariants(balances.map((b) => b.variantId));

    const items: StockBalanceItem[] = balances.map((b) => {
      const branch = branchMap.get(b.branchId);
      const variant = variantMap.get(b.variantId);
      return {
        branchId: b.branchId,
        branchName: branch?.name ?? b.branchId,
        variantId: b.variantId,
        variantSku: variant?.sku ?? '',
        variantName: variant?.name ?? '',
        productName: variant?.productName ?? '',
        unit: variant?.unit ?? '',
        quantity: b.quantity,
        minStock: variant?.minStock ?? 0,
        updatedAt: b.updatedAt.toISOString(),
      };
    });

    return { items, total, page, pageSize };
  }

  /** Stock card (thẻ kho): movement ledger for a specific variant at a branch. */
  async getMovements(viewer: AuthUser, query: MovementQuery): Promise<Paginated<StockMovementItem>> {
    const { branchId, variantId, page, pageSize } = query;
    assertBranchAccess(viewer, branchId);

    const where: Prisma.StockMovementWhereInput = {
      branchId,
      variantId,
    };

    const [movements, total] = await this.prisma.$transaction([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    const userMap = await this.users.describeUsers(movements.map((m) => m.createdBy));

    const items: StockMovementItem[] = movements.map((m) => {
      const user = userMap.get(m.createdBy);
      return {
        id: m.id,
        branchId: m.branchId,
        variantId: m.variantId,
        type: m.type as StockMovementType,
        quantity: m.quantity,
        refType: m.refType,
        refId: m.refId,
        createdBy: m.createdBy,
        createdByName: user?.fullName ?? user?.username,
        createdAt: m.createdAt.toISOString(),
      };
    });

    return { items, total, page, pageSize };
  }

  /**
   * Low stock alerts (REQ-INV-04): items with quantity < minStock.
   * If a product has minStock > 0 but no stock_balance row exists, quantity is 0 and it alerts.
   */
  async getLowStock(viewer: AuthUser, query: LowStockQuery): Promise<Paginated<LowStockItem>> {
    const { page, pageSize } = query;
    const scopedBranchId = branchFilter(viewer, query.branchId);

    // Get all branches to evaluate
    let targetBranchIds: string[];
    if (scopedBranchId) {
      targetBranchIds = [scopedBranchId];
    } else {
      const branches = await this.branches.list(viewer, { page: 1, pageSize: 100, isActive: true });
      targetBranchIds = branches.items.map((b) => b.id);
    }

    if (targetBranchIds.length === 0) {
      return { items: [], total: 0, page, pageSize };
    }

    const branchMap = await this.branches.describeBranches(targetBranchIds);
    const variantsWithMinStock = await this.products.getVariantsWithMinStock();

    if (variantsWithMinStock.length === 0) {
      return { items: [], total: 0, page, pageSize };
    }

    // Fetch existing balances for these branches and variants
    const balances = await this.prisma.stockBalance.findMany({
      where: {
        branchId: { in: targetBranchIds },
        variantId: { in: variantsWithMinStock.map((v) => v.id) },
      },
    });

    const balanceMap = new Map<string, number>();
    for (const b of balances) {
      balanceMap.set(`${b.branchId}:${b.variantId}`, b.quantity);
    }

    const lowStockAlerts: LowStockItem[] = [];

    for (const branchId of targetBranchIds) {
      const branchName = branchMap.get(branchId)?.name ?? branchId;
      for (const v of variantsWithMinStock) {
        const qty = balanceMap.get(`${branchId}:${v.id}`) ?? 0;
        if (qty < v.minStock) {
          lowStockAlerts.push({
            branchId,
            branchName,
            variantId: v.id,
            variantSku: v.sku,
            variantName: v.name,
            productName: v.productName,
            unit: v.unit,
            quantity: qty,
            minStock: v.minStock,
            deficit: v.minStock - qty,
          });
        }
      }
    }

    // Sort by largest deficit first
    lowStockAlerts.sort((a, b) => b.deficit - a.deficit);

    const total = lowStockAlerts.length;
    const items = lowStockAlerts.slice((page - 1) * pageSize, page * pageSize);

    return { items, total, page, pageSize };
  }
}
