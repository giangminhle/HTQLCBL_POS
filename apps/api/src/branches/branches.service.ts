import { Injectable, OnModuleInit } from '@nestjs/common';
import { Branch, Prisma } from '@prisma/client';
import type { AuthUser, BranchQuery, CreateBranch, Paginated, UpdateBranch } from '@retailchain/shared';
import { AuditSnapshotRegistry } from '../audit/audit-snapshot.registry';
import { assertBranchAccess, branchFilter } from '../common/authz/branch-scope';
import { conflict, notFound } from '../common/http-errors';
import { PrismaService } from '../prisma/prisma.service';

export const BRANCH_ENTITY = 'Branch';

@Injectable()
export class BranchesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: AuditSnapshotRegistry,
  ) {}

  onModuleInit(): void {
    this.snapshots.register(BRANCH_ENTITY, (id) => this.prisma.branch.findUnique({ where: { id } }));
  }

  async list(user: AuthUser, query: BranchQuery): Promise<Paginated<Branch>> {
    const { page, pageSize } = query;
    const scopedId = branchFilter(user, undefined);
    const where: Prisma.BranchWhereInput = {
      ...(scopedId ? { id: scopedId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.q
        ? {
            OR: [
              { code: { contains: query.q, mode: 'insensitive' } },
              { name: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.branch.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.branch.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async get(user: AuthUser, id: string): Promise<Branch> {
    assertBranchAccess(user, id);
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) throw notFound('Không tìm thấy chi nhánh');
    return branch;
  }

  async create(dto: CreateBranch): Promise<Branch> {
    try {
      return await this.prisma.branch.create({
        data: { code: dto.code, name: dto.name, address: dto.address ?? null, type: dto.type },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw conflict(`Mã chi nhánh ${dto.code} đã tồn tại`);
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateBranch): Promise<Branch> {
    const exists = await this.prisma.branch.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw notFound('Không tìm thấy chi nhánh');
    return this.prisma.branch.update({ where: { id }, data: dto });
  }

  /** Used by UsersService to validate assignments (modules talk via services, not tables). */
  async isActiveBranch(id: string): Promise<boolean> {
    const branch = await this.prisma.branch.findUnique({ where: { id }, select: { isActive: true } });
    return branch?.isActive === true;
  }

  /** Batch describe branch codes & names for other modules without crossing DB boundaries. */
  async describeBranches(ids: string[]): Promise<Map<string, { code: string; name: string }>> {
    const rows = await this.prisma.branch.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true, name: true },
    });
    return new Map(rows.map((r) => [r.id, { code: r.code, name: r.name }]));
  }
}
