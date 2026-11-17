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

describe('createApiClient auth', () => {
  it('REQ-AUTH-01: sends the Bearer token and JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, ok));
    const api = createApiClient('http://api', { fetchImpl: fetchMock, getAccessToken: () => 'tok' });
    await api.post('/x', healthResponseSchema, { a: 1 }, { query: { page: 2, q: undefined } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api/x?page=2');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(init.body).toBe('{"a":1}');
  });

  it('REQ-AUTH-01: refreshes once on 401 and retries the request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { code: 'TOKEN_EXPIRED', message: 'x' }))
      .mockResolvedValueOnce(jsonResponse(200, ok));
    const onUnauthorized = vi.fn().mockResolvedValue(true);
    const api = createApiClient('http://api', {
      fetchImpl: fetchMock,
      getAccessToken: () => 't',
      onUnauthorized,
    });
    await expect(api.get('/health', healthResponseSchema)).resolves.toEqual(ok);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('REQ-AUTH-01: does not loop when the retry is also 401', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(401, { code: 'INVALID_TOKEN', message: 'x' }));
    const onUnauthorized = vi.fn().mockResolvedValue(true);
    const api = createApiClient('http://api', { fetchImpl: fetchMock, onUnauthorized });
    await expect(api.get('/a', healthResponseSchema)).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('REQ-AUTH-01: skips token and refresh for auth: false requests', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { code: 'INVALID_CREDENTIALS', message: 'x' }));
    const onUnauthorized = vi.fn();
    const api = createApiClient('http://api', {
      fetchImpl: fetchMock,
      getAccessToken: () => 't',
      onUnauthorized,
    });
    await expect(api.post('/auth/login', healthResponseSchema, {}, { auth: false })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

describe('createApiClient upload and text', () => {
  it('REQ-PRD-01: uploads FormData without forcing a JSON content type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, ok));
    const api = createApiClient('http://api', { fetchImpl: fetchMock, getAccessToken: () => 't' });
    const form = new FormData();
    form.append('file', new Blob(['a,b']), 'x.csv');
    await api.upload('/products/import', healthResponseSchema, form, { query: { dryRun: true } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://api/products/import?dryRun=true');
    expect(init.body).toBe(form);
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer t');
  });

  it('REQ-PRD-01: getText returns the raw body; errors still use the unified format', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('product_sku,product_name', { status: 200 }))
      .mockResolvedValueOnce(jsonResponse(403, { code: 'ROLE_FORBIDDEN', message: 'x' }));
    const api = createApiClient('http://api', fetchMock);
    await expect(api.getText('/t')).resolves.toBe('product_sku,product_name');
    await expect(api.getText('/t')).rejects.toMatchObject({ status: 403, code: 'ROLE_FORBIDDEN' });
  });

  it('REQ-PRC-01: put and delete send the right method', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(200, ok));
    const api = createApiClient('http://api', fetchMock);
    await api.put('/a', healthResponseSchema, { x: 1 });
    await api.delete('/a', healthResponseSchema);
    expect(fetchMock.mock.calls.map((c) => (c[1] as RequestInit).method)).toEqual(['PUT', 'DELETE']);
  });
});
