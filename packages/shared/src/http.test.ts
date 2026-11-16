import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError, createApiClient, healthResponseSchema } from './index';

const ok = { status: 'ok', db: 'up', version: '0.1.0', timestamp: '2026-01-01T00:00:00.000Z' };
const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('createApiClient', () => {
  it('REQ-NFR-01: returns parsed data on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, ok));
    const api = createApiClient('http://api/', fetchMock);
    await expect(api.get('/health', healthResponseSchema)).resolves.toEqual(ok);
    expect(fetchMock).toHaveBeenCalledWith('http://api/health', expect.anything());
  });

  it('REQ-NFR-01: surfaces the unified error body', async () => {
    const api = createApiClient(
      'http://api',
      vi.fn().mockResolvedValue(jsonResponse(404, { code: 'NOT_FOUND', message: 'x' })),
    );
    await expect(api.get('/a', healthResponseSchema)).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });

  it('REQ-NFR-01: maps network failure to status 0', async () => {
    const api = createApiClient('http://api', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const err = await api.get('/health', healthResponseSchema).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiRequestError);
    expect((err as ApiRequestError).status).toBe(0);
  });
});
