import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, OnModuleInit } from '@nestjs/common';
import { Category, Prisma } from '@prisma/client';
import { ErrorCode, type CreateCategory, type UpdateCategory } from '@retailchain/shared';
import { AuditSnapshotRegistry } from '../audit/audit-snapshot.registry';
import { apiError, notFound } from '../common/http-errors';
import { PrismaService } from '../prisma/prisma.service';

export const CATEGORY_ENTITY = 'Category';

/** True when `candidateParentPath` is the category itself or inside its subtree (would create a cycle). */
export function wouldCreateCycle(categoryPath: string, candidateParentPath: string): boolean {
  return candidateParentPath.startsWith(categoryPath);
}

@Injectable()
export class CategoriesService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: AuditSnapshotRegistry,
  ) {}

  onModuleInit(): void {
    this.snapshots.register(CATEGORY_ENTITY, (id) => this.prisma.category.findUnique({ where: { id } }));
  }

  /** Whole tree, flat, ordered so that parents come before children. */
  list(): Promise<Category[]> {
    return this.prisma.category.findMany({ orderBy: [{ path: 'asc' }, { sortOrder: 'asc' }] });
  }

  async create(dto: CreateCategory): Promise<Category> {
    const id = randomUUID();
    const parentPath = dto.parentId ? (await this.find(dto.parentId)).path : '/';
    return this.prisma.category.create({
      data: {
        id,
        name: dto.name,
        parentId: dto.parentId,
        sortOrder: dto.sortOrder,
        path: `${parentPath}${id}/`,
      },
    });
  }

  async update(id: string, dto: UpdateCategory): Promise<Category> {
    const current = await this.find(id);
    const moving = dto.parentId !== undefined && dto.parentId !== current.parentId;

    return this.prisma.$transaction(async (tx) => {
      let path = current.path;
      if (moving) {
        const parentPath = dto.parentId ? (await this.find(dto.parentId, tx)).path : '/';
        if (wouldCreateCycle(current.path, parentPath)) {
          throw apiError(
            HttpStatus.BAD_REQUEST,
            ErrorCode.CATEGORY_CYCLE,
            'Không thể chuyển danh mục vào chính nó hoặc danh mục con của nó',
          );
        }
        path = `${parentPath}${id}/`;
        // Re-root the whole subtree: replace the old prefix with the new one.
        await tx.$executeRaw`
          UPDATE "categories"
          SET "path" = ${path}::text || substring("path" from ${current.path.length + 1}::int), "updated_at" = now()
          WHERE "path" LIKE ${current.path + '%'}::text AND "id" <> ${id}::uuid`;
      }
      return tx.category.update({ where: { id }, data: { ...dto, path } });
    });
  }

  /** Only empty categories can be deleted; otherwise deactivate them. */
  async remove(id: string): Promise<Category> {
    const category = await this.find(id);
    const [children, products] = await Promise.all([
      this.prisma.category.count({ where: { parentId: id } }),
      this.prisma.product.count({ where: { categoryId: id } }),
    ]);
    if (children > 0 || products > 0) {
      throw apiError(
        HttpStatus.CONFLICT,
        ErrorCode.CATEGORY_NOT_EMPTY,
        `Danh mục còn ${children} danh mục con và ${products} sản phẩm; hãy chuyển chúng đi hoặc ngưng hoạt động danh mục`,
        { children, products },
      );
    }
    await this.prisma.category.delete({ where: { id } });
    return category;
  }

  /** Ids of a category and all its descendants (for "filter by category incl. sub-categories"). */
  async subtreeIds(id: string): Promise<string[]> {
    const root = await this.find(id);
    const rows = await this.prisma.category.findMany({
      where: { path: { startsWith: root.path } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /** "Mỹ phẩm > Dầu gội" → id, used by CSV import. Matches names case-insensitively along the path. */
  async resolvePathByNames(): Promise<Map<string, string>> {
    const all = await this.list();
    const byId = new Map(all.map((c) => [c.id, c]));
    const map = new Map<string, string>();
    for (const c of all) {
      const names = c.path
        .split('/')
        .filter(Boolean)
        .map((pid) => byId.get(pid)?.name ?? '?');
      map.set(names.join(' > ').toLowerCase(), c.id);
    }
    return map;
  }

  async exists(id: string): Promise<boolean> {
    return (await this.prisma.category.count({ where: { id } })) > 0;
  }

  changedSince(since: Date | undefined, until: Date): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { updatedAt: { ...(since ? { gt: since } : {}), lte: until } },
      orderBy: { path: 'asc' },
    });
  }

  private async find(id: string, tx: Prisma.TransactionClient = this.prisma): Promise<Category> {
    const c = await tx.category.findUnique({ where: { id } });
    if (!c) throw notFound('Không tìm thấy danh mục');
    return c;
  }
}
