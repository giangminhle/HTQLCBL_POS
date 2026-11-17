import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  Role,
  type AuthUser,
  type CloseShiftInput,
  type OpenShiftInput,
  type Paginated,
  type Shift,
  type ShiftQuery,
  type ShiftSummary,
} from '@retailchain/shared';
import { AuditSnapshotRegistry } from '../audit/audit-snapshot.registry';
import { assertBranchAccess, branchFilter } from '../common/authz/branch-scope';
import { badRequest, notFound } from '../common/http-errors';
import { PrismaService } from '../prisma/prisma.service';
import { BranchesService } from '../branches/branches.service';
import { UsersService } from '../users/users.service';

export const SHIFT_ENTITY = 'Shift';

@Injectable()
export class ShiftsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly branches: BranchesService,
    private readonly users: UsersService,
    private readonly snapshots: AuditSnapshotRegistry,
  ) {}

  onModuleInit(): void {
    this.snapshots.register(SHIFT_ENTITY, async (id: string) => {
      const shift = await this.prisma.shift.findUnique({ where: { id } });
      if (!shift) return null;
      return {
        id: shift.id,
        code: shift.code,
        status: shift.status,
        closingCash: shift.closingCash,
        expectedCash: shift.expectedCash,
        difference: shift.difference,
      };
    });
  }

  private async generateShiftCode(branchId: string): Promise<string> {
    const branch = await this.prisma.branch.findUniqueOrThrow({ where: { id: branchId } });
    const cleanBranchCode = branch.code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const datePrefix = `${yy}${mm}${dd}`;

    const countToday = await this.prisma.shift.count({
      where: {
        branchId,
        createdAt: {
          gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        },
      },
    });

    const seq = String(countToday + 1).padStart(3, '0');
    return `CA-${cleanBranchCode}-${datePrefix}-${seq}`;
  }

  async openShift(user: AuthUser, dto: OpenShiftInput): Promise<Shift> {
    const branchId = user.branchId;
    if (!branchId) {
      throw badRequest('Người dùng phải thuộc chi nhánh để mở ca làm việc');
    }

    // Check if cashier already has an OPEN shift
    const existingOpenShift = await this.prisma.shift.findFirst({
      where: {
        cashierId: user.id,
        status: 'OPEN',
      },
    });

    if (existingOpenShift) {
      throw badRequest('Thu ngân đang có một ca làm việc chưa đóng (mã ca: ' + existingOpenShift.code + ')');
    }

    const code = await this.generateShiftCode(branchId);

    const shift = await this.prisma.shift.create({
      data: {
        code,
        branchId,
        cashierId: user.id,
        openingCash: dto.openingCash,
        note: dto.note ?? null,
        status: 'OPEN',
      },
    });

    return this.mapToShift(shift);
  }

  async getCurrentShift(user: AuthUser): Promise<ShiftSummary | null> {
    const shift = await this.prisma.shift.findFirst({
      where: {
        cashierId: user.id,
        status: 'OPEN',
      },
      orderBy: { openedAt: 'desc' },
    });

    if (!shift) {
      return null;
    }

    return this.calculateShiftSummary(shift);
  }

  async closeShift(user: AuthUser, shiftId: string, dto: CloseShiftInput): Promise<Shift> {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
    });

    if (!shift) {
      throw notFound('Không tìm thấy ca làm việc');
    }

    // Only the cashier who opened, or branch manager of that branch, or owner can close
    const isOwner = user.role === Role.OWNER;
    const isCashier = user.id === shift.cashierId;
    const isManager = user.role === Role.BRANCH_MANAGER && user.branchId === shift.branchId;

    if (!isOwner && !isCashier && !isManager) {
      throw badRequest('Bạn không có quyền đóng ca làm việc này');
    }

    if (shift.status !== 'OPEN') {
      throw badRequest('Ca làm việc này đã được đóng trước đó');
    }

    const summary = await this.calculateShiftSummary(shift);
    const expectedCash = summary.expectedCash;
    const difference = dto.closingCash - expectedCash;

    const closed = await this.prisma.shift.update({
      where: { id: shiftId },
      data: {
        closingCash: dto.closingCash,
        expectedCash,
        difference,
        status: 'CLOSED',
        closedAt: new Date(),
        note: dto.note ? `${shift.note ? shift.note + '; ' : ''}${dto.note}` : shift.note,
      },
    });

    return this.mapToShift(closed);
  }

  async getShiftById(user: AuthUser, shiftId: string): Promise<ShiftSummary> {
    const shift = await this.prisma.shift.findUnique({
      where: { id: shiftId },
    });

    if (!shift) {
      throw notFound('Không tìm thấy ca làm việc');
    }

    assertBranchAccess(user, shift.branchId);

    return this.calculateShiftSummary(shift);
  }

  async getShifts(user: AuthUser, query: ShiftQuery): Promise<Paginated<Shift>> {
    const scopedBranchId = branchFilter(user, query.branchId);

    const where = {
      ...(scopedBranchId ? { branchId: scopedBranchId } : {}),
      ...(user.role === Role.CASHIER
        ? { cashierId: user.id }
        : query.cashierId
          ? { cashierId: query.cashierId }
          : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.shift.count({ where }),
      this.prisma.shift.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { openedAt: 'desc' },
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
        ...this.mapToShift(s),
        branchName: branchesMap.get(s.branchId)?.name,
        cashierName: usersMap.get(s.cashierId)?.fullName,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  private async calculateShiftSummary(shift: {
    id: string;
    code: string;
    branchId: string;
    cashierId: string;
    openingCash: number;
    closingCash: number | null;
    expectedCash: number | null;
    difference: number | null;
    status: 'OPEN' | 'CLOSED';
    openedAt: Date;
    closedAt: Date | null;
    note: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Promise<ShiftSummary> {
    // 1. Sum payments for sales completed in this shift
    const payments = await this.prisma.payment.findMany({
      where: {
        sale: {
          shiftId: shift.id,
          status: { not: 'CANCELLED' },
        },
      },
    });

    let cashSales = 0;
    let cardSales = 0;
    let qrSales = 0;

    for (const p of payments) {
      if (p.method === 'CASH') cashSales += p.amount;
      else if (p.method === 'CARD') cardSales += p.amount;
      else if (p.method === 'QR') qrSales += p.amount;
    }

    // 2. Sum refunds done in this shift
    const returns = await this.prisma.saleReturn.findMany({
      where: { shiftId: shift.id },
    });

    const cashRefunds = returns.reduce((acc, r) => acc + r.totalRefund, 0);

    const totalSales = cashSales + cardSales + qrSales;
    const expectedCash = shift.openingCash + cashSales - cashRefunds;

    const [branchesMap, usersMap] = await Promise.all([
      this.branches.describeBranches([shift.branchId]),
      this.users.describeUsers([shift.cashierId]),
    ]);

    return {
      shift: {
        ...this.mapToShift(shift),
        branchName: branchesMap.get(shift.branchId)?.name,
        cashierName: usersMap.get(shift.cashierId)?.fullName,
      },
      cashSales,
      cardSales,
      qrSales,
      cashRefunds,
      totalSales,
      expectedCash,
    };
  }

  private mapToShift(shift: {
    id: string;
    code: string;
    branchId: string;
    cashierId: string;
    openingCash: number;
    closingCash: number | null;
    expectedCash: number | null;
    difference: number | null;
    status: 'OPEN' | 'CLOSED';
    openedAt: Date;
    closedAt: Date | null;
    note: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Shift {
    return {
      id: shift.id,
      code: shift.code,
      branchId: shift.branchId,
      cashierId: shift.cashierId,
      openingCash: shift.openingCash,
      closingCash: shift.closingCash,
      expectedCash: shift.expectedCash,
      difference: shift.difference,
      status: shift.status,
      openedAt: shift.openedAt.toISOString(),
      closedAt: shift.closedAt ? shift.closedAt.toISOString() : null,
      note: shift.note,
      createdAt: shift.createdAt.toISOString(),
      updatedAt: shift.updatedAt.toISOString(),
    };
  }
}
