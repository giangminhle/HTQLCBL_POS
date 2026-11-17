import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ROLE_LABELS } from '@retailchain/shared';
import { useAuth, useSession } from '../auth/AuthContext';
import { menuFor } from '../menu';

export function Layout() {
  const session = useSession();
  const auth = useAuth();
  const navigate = useNavigate();
  if (!session) return null;
  const { user } = session;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-4">
          <p className="font-bold text-slate-800">RetailChain</p>
          <p className="text-xs text-slate-500">Trang quản trị</p>
        </div>
        <nav aria-label="Menu chính" className="flex flex-col gap-1 p-2">
          {menuFor(user.role)
            .filter((m) => !user.mustChangePassword || m.to === '/change-password')
            .map((m) => (
              <NavLink
                key={m.to}
                to={m.to}
                end
                className={({ isActive }) =>
                  `rounded px-3 py-2 text-sm ${isActive ? 'bg-slate-800 text-white' : 'text-slate-700 hover:bg-slate-100'}`
                }
              >
                {m.label}
              </NavLink>
            ))}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end gap-4 border-b border-slate-200 bg-white px-6 py-3">
          <div className="text-right text-sm">
            <p className="font-medium text-slate-800">{user.fullName}</p>
            <p className="text-xs text-slate-500">{ROLE_LABELS[user.role]}</p>
          </div>
          <button
            type="button"
            onClick={() => void auth.logout().then(() => navigate('/login', { replace: true }))}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
          >
            Đăng xuất
          </button>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
