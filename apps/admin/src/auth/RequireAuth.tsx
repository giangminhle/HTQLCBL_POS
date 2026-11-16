import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { Role } from '@retailchain/shared';
import { useSession } from './AuthContext';

/**
 * UX-only route guard. The API enforces permissions; this just avoids showing screens that would fail.
 * Order: not logged in → /login; must change password → /change-password; wrong role → forbidden.
 */
export function RequireAuth({ roles, children }: { roles?: readonly Role[]; children: ReactNode }) {
  const session = useSession();
  const location = useLocation();

  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (session.user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  if (roles && !roles.includes(session.user.role)) {
    return (
      <div className="p-8">
        <h1 className="text-xl font-semibold text-slate-800">Không có quyền truy cập</h1>
        <p className="mt-2 text-slate-600">Vai trò của bạn không được phép xem trang này.</p>
      </div>
    );
  }
  return <>{children}</>;
}
