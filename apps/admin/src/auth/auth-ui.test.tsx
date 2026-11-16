import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Role } from '@retailchain/shared';
import { Layout } from '../components/Layout';
import { menuFor } from '../menu';
import { canManage } from '../pages/UsersPage';
import { LoginPage } from '../pages/LoginPage';
import { jsonResponse, makeAuth, makeSession, makeUser, renderRoutes } from '../test/utils';
import { RequireAuth } from './RequireAuth';

const loginBody = (overrides = {}) => ({
  accessToken: 'at',
  accessTokenExpiresIn: 900,
  refreshToken: 'rt',
  refreshTokenExpiresAt: '2030-01-01T00:00:00.000Z',
  user: makeUser(overrides),
});

describe('role-based menu (REQ-AUTH-01)', () => {
  const labels = (role: Role) => menuFor(role).map((m) => m.label);

  it('REQ-AUTH-01: OWNER sees branches, users and audit log', () => {
    expect(labels(Role.OWNER)).toEqual([
      'Tổng quan',
      'Chi nhánh',
      'Người dùng',
      'Nhật ký thao tác',
      'Đổi mật khẩu',
    ]);
  });

  it('REQ-AUTH-01: BRANCH_MANAGER sees users and audit log but not branches', () => {
    expect(labels(Role.BRANCH_MANAGER)).toEqual([
      'Tổng quan',
      'Người dùng',
      'Nhật ký thao tác',
      'Đổi mật khẩu',
    ]);
  });

  it('REQ-AUTH-01: CASHIER, WAREHOUSE_KEEPER, ACCOUNTANT see only overview and change password', () => {
    for (const r of [Role.CASHIER, Role.WAREHOUSE_KEEPER, Role.ACCOUNTANT]) {
      expect(labels(r)).toEqual(['Tổng quan', 'Đổi mật khẩu']);
    }
  });

  it('REQ-AUTH-01: the layout renders the menu of the logged-in role', async () => {
    const { auth } = await makeAuth(makeSession({ role: 'BRANCH_MANAGER', branchId: 'b1' }));
    renderRoutes(auth, [{ path: '/', element: <Layout /> }], '/');
    const nav = screen.getByRole('navigation', { name: 'Menu chính' });
    expect(within(nav).getByText('Người dùng')).toBeInTheDocument();
    expect(within(nav).queryByText('Chi nhánh')).not.toBeInTheDocument();
  });
});

describe('RequireAuth', () => {
  const routes = (roles?: Role[]) => [
    { path: '/login', element: <p>LOGIN PAGE</p> },
    { path: '/change-password', element: <p>CHANGE PASSWORD PAGE</p> },
    {
      path: '/users',
      element: (
        <RequireAuth roles={roles}>
          <p>USERS PAGE</p>
        </RequireAuth>
      ),
    },
  ];

  it('REQ-AUTH-01: redirects to /login without a session', async () => {
    const { auth } = await makeAuth(null);
    renderRoutes(auth, routes(), '/users');
    expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument();
  });

  it('REQ-AUTH-01: mustChangePassword forces the change-password page', async () => {
    const { auth } = await makeAuth(makeSession({ mustChangePassword: true }));
    renderRoutes(auth, routes(), '/users');
    expect(screen.getByText('CHANGE PASSWORD PAGE')).toBeInTheDocument();
  });

  it('REQ-AUTH-01: wrong role sees a "no permission" page', async () => {
    const { auth } = await makeAuth(makeSession({ role: 'CASHIER', branchId: 'b1' }));
    renderRoutes(auth, routes([Role.OWNER, Role.BRANCH_MANAGER]), '/users');
    expect(screen.getByText('Không có quyền truy cập')).toBeInTheDocument();
  });
});

describe('LoginPage', () => {
  const routes = [
    { path: '/login', element: <LoginPage /> },
    { path: '/', element: <p>HOME</p> },
    { path: '/change-password', element: <p>CHANGE PASSWORD PAGE</p> },
  ];

  function submit(username: string, password: string) {
    fireEvent.change(screen.getByLabelText('Tên đăng nhập'), { target: { value: username } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: password } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
  }

  it('REQ-AUTH-01: logs in and opens the dashboard', async () => {
    const { auth, fetchImpl } = await makeAuth(null);
    fetchImpl.mockResolvedValue(jsonResponse(200, loginBody()));
    renderRoutes(auth, routes, '/login');
    submit('owner', 'Owner@2026');
    expect(await screen.findByText('HOME')).toBeInTheDocument();
    expect(auth.getSession()?.user.username).toBe('owner');
  });

  it('REQ-AUTH-01: shows the lock time when the account is locked', async () => {
    const { auth, fetchImpl } = await makeAuth(null);
    fetchImpl.mockResolvedValue(
      jsonResponse(423, {
        code: 'ACCOUNT_LOCKED',
        message: 'locked',
        details: { lockedUntil: '2030-01-01T08:15:00.000Z' },
      }),
    );
    renderRoutes(auth, routes, '/login');
    submit('cashier01', 'bad');
    expect(await screen.findByRole('alert')).toHaveTextContent('Tài khoản tạm khóa đến');
  });

  it('REQ-AUTH-02: a temporary password sends the user to change-password', async () => {
    const { auth, fetchImpl } = await makeAuth(null);
    fetchImpl.mockResolvedValue(jsonResponse(200, loginBody({ mustChangePassword: true })));
    renderRoutes(auth, routes, '/login');
    submit('cashier01', 'TempPass23x');
    await waitFor(() => expect(screen.getByText('CHANGE PASSWORD PAGE')).toBeInTheDocument());
  });
});

describe('UsersPage permissions mirror (REQ-AUTH-02)', () => {
  const manager = makeUser({ id: 'm1', role: 'BRANCH_MANAGER', branchId: 'A' });

  it('REQ-AUTH-02: manager may reset staff of own branch only, never peers, owner or self', () => {
    expect(canManage(manager, { id: 'c1', role: 'CASHIER', branchId: 'A' })).toBe(true);
    expect(canManage(manager, { id: 'c2', role: 'CASHIER', branchId: 'B' })).toBe(false);
    expect(canManage(manager, { id: 'm2', role: 'BRANCH_MANAGER', branchId: 'A' })).toBe(false);
    expect(canManage(manager, { id: 'o1', role: 'OWNER', branchId: null })).toBe(false);
    expect(canManage(manager, { id: 'm1', role: 'BRANCH_MANAGER', branchId: 'A' })).toBe(false);
    expect(canManage(makeUser(), { id: 'm2', role: 'BRANCH_MANAGER', branchId: 'B' })).toBe(true);
  });
});
