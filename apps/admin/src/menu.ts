import { Role } from '@retailchain/shared';

export interface MenuItem {
  to: string;
  label: string;
  roles: readonly Role[];
}

const ALL: readonly Role[] = Object.values(Role);

/** Admin navigation per role (REQ-AUTH-01). Routes use the same lists via RequireAuth. */
export const MENU: readonly MenuItem[] = [
  { to: '/', label: 'Tổng quan', roles: ALL },
  { to: '/branches', label: 'Chi nhánh', roles: [Role.OWNER] },
  { to: '/categories', label: 'Danh mục', roles: [Role.OWNER] },
  {
    to: '/products',
    label: 'Sản phẩm',
    roles: [Role.OWNER, Role.BRANCH_MANAGER, Role.WAREHOUSE_KEEPER, Role.ACCOUNTANT],
  },
  { to: '/products/import', label: 'Nhập sản phẩm (CSV)', roles: [Role.OWNER] },
  { to: '/price-lists', label: 'Bảng giá', roles: [Role.OWNER, Role.BRANCH_MANAGER] },
  { to: '/users', label: 'Người dùng', roles: [Role.OWNER, Role.BRANCH_MANAGER] },
  { to: '/audit-logs', label: 'Nhật ký thao tác', roles: [Role.OWNER, Role.BRANCH_MANAGER] },
  { to: '/change-password', label: 'Đổi mật khẩu', roles: ALL },
];

export function menuFor(role: Role): MenuItem[] {
  return MENU.filter((m) => m.roles.includes(role));
}

export const rolesFor = (path: string): readonly Role[] => MENU.find((m) => m.to === path)?.roles ?? ALL;
