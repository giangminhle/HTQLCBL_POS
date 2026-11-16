import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiClient, ApiRequestError } from '@retailchain/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HelloPage } from './HelloPage';

function renderWith(api: ApiClient) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HelloPage api={api} appName="Admin" />
    </QueryClientProvider>,
  );
}

describe('HelloPage', () => {
  it('REQ-NFR-01: shows API and DB status from /health', async () => {
    const api: ApiClient = {
      get: vi.fn().mockResolvedValue({ status: 'ok', db: 'up', version: '0.1.0', timestamp: 'now' }),
    };
    renderWith(api);
    expect(await screen.findByText('Hoạt động')).toBeInTheDocument();
    expect(screen.getByText('Đã kết nối')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/health', expect.anything());
  });

  it('REQ-NFR-01: shows an error when the API is unreachable', async () => {
    const api: ApiClient = {
      get: vi
        .fn()
        .mockRejectedValue(
          new ApiRequestError(0, { code: 'SERVICE_UNAVAILABLE', message: 'Không kết nối được máy chủ' }),
        ),
    };
    renderWith(api);
    expect(await screen.findByRole('alert')).toHaveTextContent('SERVICE_UNAVAILABLE');
  });
});
