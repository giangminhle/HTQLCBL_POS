import { ApiProperty } from '@nestjs/swagger';
import type { HealthResponse } from '@retailchain/shared';

export class HealthResponseDto implements HealthResponse {
  @ApiProperty({ enum: ['ok', 'degraded'] })
  status: 'ok' | 'degraded';

  @ApiProperty({ enum: ['up', 'down'] })
  db: 'up' | 'down';

  @ApiProperty({ example: '0.1.0' })
  version: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  timestamp: string;
}
