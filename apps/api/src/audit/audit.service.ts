import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuditQuery, AuthUser, Paginated } from '@retailchain/shared';
import { branchFilter } from '../common/authz/branch-scope';
import type { RequestContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { redact } from './redact';

export interface AuditEntry {
  action: string;
  entity: string;
  entityId?: string | null;
  actor?: Pick<AuthUser, 'id' | 'username'> | null;
  branchId?: string | null;
  before?: unknown;
  after?: unknown;
  context?: Partial<RequestContext>;
}

export interface AuditLogRow {
  id: string;
  userId: string | null;
  username: string | null;
  branchId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  requestId: string | null;
  createdAt: Date;
}

const toJson = (v: unknown) =>
  v === undefined || v === null ? Prisma.JsonNull : (redact(v) as Prisma.InputJsonValue);

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Never throws: a failed audit write is logged as an error but does not undo the business action. */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          userId: entry.actor?.id ?? null,
          username: entry.actor?.username ?? null,
          branchId: entry.branchId ?? null,
          before: toJson(entry.before),
          after: toJson(entry.after),
          ip: entry.context?.ip ?? null,
          requestId: entry.context?.requestId ?? null,
        },
      });
    } catch (err) {
      this.logger.error(
        { err, entry: { ...entry, before: undefined, after: undefined } },
        'Audit write failed',
      );
    }
  }

  async list(user: AuthUser, query: AuditQuery): Promise<Paginated<AuditLogRow>> {
    const { page, pageSize } = query;
    const branchId = branchFilter(user, query.branchId);
    const where: Prisma.AuditLogWhereInput = {
      ...(branchId ? { branchId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.from || query.to
        ? {
            createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) },
          }
        : {}),
    };
    // Non-OWNER callers are forced to their branch; OWNER-account events have no branch so stay hidden from them.
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }
}
