import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AuthClient as DbAuthClient, RefreshToken } from '@prisma/client';
import type { AuthClient } from '@retailchain/shared';
import type { RequestContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const toDbClient = (c: AuthClient): DbAuthClient =>
  c === 'pos' ? DbAuthClient.POS : DbAuthClient.ADMIN;
export const fromDbClient = (c: DbAuthClient): AuthClient => (c === DbAuthClient.POS ? 'pos' : 'admin');

export interface IssueInput {
  userId: string;
  client: AuthClient;
  tokenVersion: number;
  ttlMs: number;
  context?: Partial<RequestContext>;
}

/** Owns the refresh_tokens table. Only SHA-256 hashes are stored (ADR-001). */
@Injectable()
export class RefreshTokenService {
  constructor(private readonly prisma: PrismaService) {}

  private data(input: IssueInput, now: Date) {
    const token = randomBytes(32).toString('base64url');
    return {
      token,
      row: {
        userId: input.userId,
        tokenHash: hashToken(token),
        client: toDbClient(input.client),
        tokenVersion: input.tokenVersion,
        expiresAt: new Date(now.getTime() + input.ttlMs),
        userAgent: input.context?.userAgent ?? null,
        ip: input.context?.ip ?? null,
      },
    };
  }

  async issue(input: IssueInput, now = new Date()): Promise<{ token: string; expiresAt: Date }> {
    const { token, row } = this.data(input, now);
    await this.prisma.refreshToken.create({ data: row });
    return { token, expiresAt: row.expiresAt };
  }

  findByToken(token: string): Promise<RefreshToken | null> {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(token) } });
  }

  /**
   * Atomically revokes `old` and issues its replacement. Returns null when `old` was already revoked
   * by a concurrent request — the caller treats that as reuse.
   */
  async rotate(old: RefreshToken, input: IssueInput, now = new Date()) {
    const { token, row } = this.data(input, now);
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.refreshToken.create({ data: row });
      const { count } = await tx.refreshToken.updateMany({
        where: { id: old.id, revokedAt: null },
        data: { revokedAt: now, replacedById: created.id },
      });
      if (count === 0) throw new ConcurrentRotationError();
      return { token, expiresAt: row.expiresAt };
    });
  }

  async revoke(id: string, now = new Date()): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: now } });
  }

  async revokeAllForUser(userId: string, now = new Date()): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
  }
}

export class ConcurrentRotationError extends Error {
  constructor() {
    super('Refresh token was rotated concurrently');
  }
}
