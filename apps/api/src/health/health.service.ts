import { Injectable, Logger } from '@nestjs/common';
import type { HealthResponse } from '@retailchain/shared';
import { APP_VERSION } from '../common/version';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthResponse> {
    let dbUp = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbUp = true;
    } catch (err) {
      this.logger.warn(`Database check failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return {
      status: dbUp ? 'ok' : 'degraded',
      db: dbUp ? 'up' : 'down',
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
    };
  }
}
