import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AuthUser,
  CreateSupplier,
  Paginated,
  Supplier,
  SupplierQuery,
  UpdateSupplier,
} from '@retailchain/shared';
import { AuditSnapshotRegistry } from '../audit/audit-snapshot.registry';
import { conflict, notFound } from '../common/http-errors';
import { PrismaService } from '../prisma/prisma.service';

export const SUPPLIER_ENTITY = 'Supplier';

@Injectable()
export class SuppliersService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: AuditSnapshotRegistry,
  ) {}

  onModuleInit(): void {
    this.snapshots.register(SUPPLIER_ENTITY, (id) => this.prisma.supplier.findUnique({ where: { id } }));
  }

  async list(viewer: AuthUser, query: SupplierQuery): Promise<Paginated<Supplier>> {
    const { page, pageSize } = query;
    const where: Prisma.SupplierWhereInput = {
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.q
        ? {
            OR: [
              { code: { contains: query.q, mode: 'insensitive' } },
              { name: { contains: query.q, mode: 'insensitive' } },
              { phone: { contains: query.q } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.supplier.count({ where }),
    ]);

    const items: Supplier[] = rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      phone: r.phone,
      email: r.email,
      address: r.address,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    return { items, total, page, pageSize };
  }

  async get(id: string): Promise<Supplier> {
    const r = await this.prisma.supplier.findUnique({ where: { id } });
    if (!r) throw notFound('Không tìm thấy nhà cung cấp');
    return {
      id: r.id,
      code: r.code,
      name: r.name,
      phone: r.phone,
      email: r.email,
      address: r.address,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  async create(viewer: AuthUser, dto: CreateSupplier): Promise<Supplier> {
    const existing = await this.prisma.supplier.findUnique({ where: { code: dto.code } });
    if (existing) {
      throw conflict(`Mã nhà cung cấp ${dto.code} đã tồn tại`);
    }

    const r = await this.prisma.supplier.create({
      data: {
        code: dto.code,
        name: dto.name,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        address: dto.address ?? null,
      },
    });

    return {
      id: r.id,
      code: r.code,
      name: r.name,
      phone: r.phone,
      email: r.email,
      address: r.address,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  async update(viewer: AuthUser, id: string, dto: UpdateSupplier): Promise<Supplier> {
    const existing = await this.prisma.supplier.findUnique({ where: { id } });
    if (!existing) throw notFound('Không tìm thấy nhà cung cấp');

    const r = await this.prisma.supplier.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    return {
      id: r.id,
      code: r.code,
      name: r.name,
      phone: r.phone,
      email: r.email,
      address: r.address,
      isActive: r.isActive,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }
}
