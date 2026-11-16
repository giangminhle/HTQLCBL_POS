import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import {
  createAuthSession,
  memoryStorageAdapter,
  type AuthUser,
  type StoredSession,
} from '@retailchain/shared';
import { AuthProvider } from '../auth/AuthContext';

export const makeUser = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: 'u1',
  username: 'owner',
  fullName: 'Nguyễn Văn Chủ',
  role: 'OWNER',
  branchId: null,
  mustChangePassword: false,
  ...overrides,
});

export const makeSession = (user: Partial<AuthUser> = {}): StoredSession => ({
  accessToken: 'at',
  refreshToken: 'rt',
  refreshTokenExpiresAt: '2030-01-01T00:00:00.000Z',
  user: makeUser(user),
});

export const jsonResponse = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** Real auth session over an in-memory store and a mocked fetch. */
export async function makeAuth(session: StoredSession | null, fetchImpl = vi.fn()) {
  const auth = createAuthSession({
    baseUrl: 'http://api',
    client: 'admin',
    storage: memoryStorageAdapter(session),
    onRefreshRejected: 'clear',
    fetchImpl,
  });
  await auth.init();
  return { auth, fetchImpl };
}

export function renderRoutes(
  auth: Awaited<ReturnType<typeof makeAuth>>['auth'],
  routes: { path: string; element: ReactNode }[],
  initialPath: string,
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <AuthProvider auth={auth}>
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            {routes.map((r) => (
              <Route key={r.path} path={r.path} element={r.element} />
            ))}
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </AuthProvider>,
  );
}
