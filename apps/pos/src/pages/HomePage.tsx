import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useOnline, useSession } from '../auth';
import { posSessionStatus } from '../lib/pos-session';

export const OFFLINE_LOGOUT_WARNING = 'Không thể đăng nhập lại khi mất mạng';

/** Sprint 1: session/shift shell. The selling screen arrives with REQ-POS-01. */
export function HomePage() {
  const auth = useAuth();
  const session = useSession();
  const online = useOnline();
  const navigate = useNavigate();
  const [confirmOffline, setConfirmOffline] = useState(false);
  if (!session) return null;
  const status = posSessionStatus(session, online);

  async function logout() {
    setConfirmOffline(false);
    await auth.logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <header className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white">
        <div>
          <p className="font-semibold">{session.user.fullName}</p>
          <p className="text-xs text-slate-300">Thu ngân · {session.user.username}</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            role="status"
            aria-label="Trạng thái mạng"
            className={`rounded-full px-3 py-1 text-xs font-semibold ${online ? 'bg-green-500' : 'bg-amber-500'}`}
          >
            {online ? 'Trực tuyến' : 'Ngoại tuyến'}
          </span>
          <button
            type="button"
            onClick={() => (online ? void logout() : setConfirmOffline(true))}
            className="rounded border border-slate-500 px-3 py-1 text-sm hover:bg-slate-800"
          >
            Đăng xuất
          </button>
        </div>
      </header>

      {status === 'needs-reauth' && (
        <div
          role="alert"
          className="flex items-center justify-between bg-amber-100 px-4 py-2 text-sm text-amber-900"
        >
          <span>
            Phiên đăng nhập đã hết hạn. Bạn vẫn bán hàng được; hãy đăng nhập lại để đồng bộ dữ liệu.
          </span>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="rounded bg-amber-600 px-3 py-1 font-semibold text-white"
          >
            Đăng nhập lại
          </button>
        </div>
      )}
      {status === 'offline' && (
        <div className="bg-slate-200 px-4 py-2 text-sm text-slate-700">
          Đang mất mạng. Vẫn bán hàng bình thường; dữ liệu sẽ tự đồng bộ khi có mạng.
        </div>
      )}

      <main className="flex flex-1 items-center justify-center p-6">
        <div className="rounded-xl bg-white p-8 text-center shadow">
          <h1 className="text-2xl font-bold text-slate-800">Sẵn sàng bán hàng</h1>
          <p className="mt-2 text-slate-500">Màn hình bán hàng sẽ có ở sprint POS (REQ-POS-01).</p>
        </div>
      </main>

      {confirmOffline && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-900/50 p-4">
          <div
            role="alertdialog"
            aria-labelledby="offline-logout-title"
            className="max-w-sm rounded-xl bg-white p-6 shadow-xl"
          >
            <h2 id="offline-logout-title" className="text-lg font-bold text-slate-800">
              {OFFLINE_LOGOUT_WARNING}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Máy đang mất mạng. Nếu đăng xuất bây giờ, không ai đăng nhập lại được cho đến khi có mạng và máy
              POS không bán được hàng.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmOffline(false)}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white"
              >
                Vẫn đăng xuất
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
