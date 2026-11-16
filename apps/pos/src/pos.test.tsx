import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthSession, memoryStorageAdapter, type StoredSession } from '@retailchain/shared';
import { PosRoutes } from './App';
import { AuthProvider } from './auth';
import { canSell, posSessionStatus } from './lib/pos-session';
import { OFFLINE_LOGOUT_WARNING } from './pages/HomePage';
import { NOT_CASHIER_MESSAGE } from './pages/LoginPage';

const cashier = {
  id: 'u1',
  username: 'cashier01',
  fullName: 'Lê Văn Thu Ngân',
  role: 'CASHIER' as const,
  branchId: 'b1',
  mustChangePassword: false,
};
const session = (overrides: Partial<StoredSession> = {}): StoredSession => ({
  accessToken: 'expired-access-token',
  refreshToken: 'rt',
  refreshTokenExpiresAt: '2030-01-01T00:00:00.000Z',
  user: cashier,
  ...overrides,
});
const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
}

async function renderPos(initial: StoredSession | null, path = '/', fetchImpl = vi.fn()) {
  const storage = memoryStorageAdapter(initial);
  const auth = createAuthSession({
    baseUrl: 'http://api',
    client: 'pos',
    storage,
    onRefreshRejected: 'flag',
    fetchImpl,
  });
  await auth.init();
  render(
    <AuthProvider auth={auth}>
      <MemoryRouter initialEntries={[path]}>
        <PosRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
  return { auth, fetchImpl, storage };
}

afterEach(() => setOnline(true));

describe('posSessionStatus (ADR-001, REQ-POS-05)', () => {
  it('REQ-POS-05: offline with a stored session keeps selling regardless of token expiry', () => {
    expect(posSessionStatus(session(), false)).toBe('offline');
    expect(canSell('offline')).toBe(true);
  });

  it('REQ-POS-05: rejected refresh token → needs-reauth, selling still allowed', () => {
    expect(posSessionStatus(session({ needsReauth: true }), true)).toBe('needs-reauth');
    expect(canSell('needs-reauth')).toBe(true);
  });

  it('REQ-AUTH-02: pending password change blocks selling', () => {
    const s = session({ user: { ...cashier, mustChangePassword: true } });
    expect(posSessionStatus(s, true)).toBe('change-password');
    expect(canSell('change-password')).toBe(false);
  });

  it('REQ-AUTH-01: no session → login', () => {
    expect(posSessionStatus(null, true)).toBe('none');
  });
});

describe('POS screens', () => {
  it('REQ-POS-05: app opened offline with a stored (expired) session goes straight to selling', async () => {
    setOnline(false);
    await renderPos(session());
    expect(screen.getByText('Sẵn sàng bán hàng')).toBeInTheDocument();
    expect(screen.getByLabelText('Trạng thái mạng')).toHaveTextContent('Ngoại tuyến');
  });

  it('REQ-POS-05: needs-reauth shows a banner but keeps the selling screen', async () => {
    await renderPos(session({ needsReauth: true }));
    expect(screen.getByRole('alert')).toHaveTextContent('đăng nhập lại để đồng bộ');
    expect(screen.getByText('Sẵn sàng bán hàng')).toBeInTheDocument();
  });

  it('REQ-AUTH-01: POS login rejects non-cashier accounts and revokes the session it got', async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) =>
      String(url).endsWith('/auth/login')
        ? json(200, {
            accessToken: 'at',
            accessTokenExpiresIn: 900,
            refreshToken: 'rt-manager',
            refreshTokenExpiresAt: '2030-01-01T00:00:00.000Z',
            user: { ...cashier, username: 'manager01', role: 'BRANCH_MANAGER' },
          })
        : json(204),
    );
    const { auth } = await renderPos(null, '/login', fetchImpl);
    fireEvent.change(screen.getByLabelText('Tên đăng nhập'), { target: { value: 'manager01' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'Manager@2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(NOT_CASHIER_MESSAGE);
    expect(auth.getSession()).toBeNull();
    expect(fetchImpl.mock.calls.some(([u]) => String(u).endsWith('/auth/logout'))).toBe(true);
  });

  it('REQ-AUTH-01: cashier login opens the selling screen', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      json(200, {
        accessToken: 'at',
        accessTokenExpiresIn: 900,
        refreshToken: 'rt',
        refreshTokenExpiresAt: '2030-01-01T00:00:00.000Z',
        user: cashier,
      }),
    );
    await renderPos(null, '/login', fetchImpl);
    fireEvent.change(screen.getByLabelText('Tên đăng nhập'), { target: { value: 'cashier01' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'Cashier@2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByText('Sẵn sàng bán hàng')).toBeInTheDocument();
  });

  it('REQ-POS-05: logging out while offline warns "Không thể đăng nhập lại khi mất mạng"; Hủy keeps the session', async () => {
    setOnline(false);
    const { auth } = await renderPos(session());
    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent(OFFLINE_LOGOUT_WARNING);
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(auth.getSession()).not.toBeNull();
  });

  it('REQ-POS-05: confirming the offline logout clears the local session', async () => {
    setOnline(false);
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('offline'));
    const { auth } = await renderPos(session(), '/', fetchImpl);
    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    fireEvent.click(screen.getByRole('button', { name: 'Vẫn đăng xuất' }));
    await waitFor(() => expect(auth.getSession()).toBeNull());
    expect(await screen.findByRole('form', { name: 'Đăng nhập thu ngân' })).toBeInTheDocument();
  });

  it('REQ-POS-05: online logout needs no confirmation', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(204));
    const { auth } = await renderPos(session(), '/', fetchImpl);
    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    await waitFor(() => expect(auth.getSession()).toBeNull());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('REQ-AUTH-02: a pending password change routes to the change-password screen', async () => {
    await renderPos(session({ user: { ...cashier, mustChangePassword: true } }));
    expect(screen.getByRole('heading', { name: 'Đổi mật khẩu' })).toBeInTheDocument();
  });
});
