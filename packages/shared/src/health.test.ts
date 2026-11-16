import { describe, expect, it } from 'vitest';
import { apiErrorSchema, healthResponseSchema } from './index';

describe('shared schemas', () => {
  it('REQ-NFR-01: accepts a valid health response', () => {
    const parsed = healthResponseSchema.parse({
      status: 'ok',
      db: 'up',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    });
    expect(parsed.status).toBe('ok');
  });

  it('REQ-NFR-01: rejects an unknown health status', () => {
    expect(
      healthResponseSchema.safeParse({ status: 'bad', db: 'up', version: 'x', timestamp: 'y' }).success,
    ).toBe(false);
  });

  it('REQ-NFR-01: error body has code, message, optional details', () => {
    expect(apiErrorSchema.safeParse({ code: 'NOT_FOUND', message: 'x' }).success).toBe(true);
    expect(apiErrorSchema.safeParse({ message: 'x' }).success).toBe(false);
  });
});
