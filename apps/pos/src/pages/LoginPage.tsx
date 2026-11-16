import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiRequestError, ErrorCode } from '@retailchain/shared';
import { useAuth, useOnline, useSession } from '../auth';
import { POS_ROLES } from '../lib/pos-session';

export const NOT_CASHIER_MESSAGE = 'Tài khoản không phải thu ngân. Máy POS chỉ dành cho thu ngân.';

function errorText(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.isNetworkError) return 'Không kết nối được máy chủ. Lần đăng nhập đầu tiên cần có mạng.';
    if (err.code === ErrorCode.ACCOUNT_LOCKED) {
      const until = (err.details as { lockedUntil?: string } | undefined)?.lockedUntil;
      return until ? `Tài khoản tạm khóa đến ${new Date(until).toLocaleTimeString('vi-VN')}.` : err.message;
    }
    return err.message;
  }
  return 'Đăng nhập thất bại';
}

export function LoginPage() {
  const auth = useAuth();
  const session = useSession();
  const online = useOnline();
  const navigate = useNavigate();
  const reauth = session?.needsReauth === true;
  const [username, setUsername] = useState(session?.user.username ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const s = await auth.login(username, password);
      if (!POS_ROLES.includes(s.user.role)) {
        await auth.logout(); // revoke the session that was just created
        setError(NOT_CASHIER_MESSAGE);
        return;
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPassword('');
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <form
        onSubmit={(e) => void onSubmit(e)}
        aria-label="Đăng nhập thu ngân"
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl bg-white p-6 shadow-lg"
      >
        <div>
          <h1 className="text-2xl font-bold text-slate-800">RetailChain POS</h1>
          <p className="text-sm text-slate-500">
            {reauth ? 'Đăng nhập lại để tiếp tục đồng bộ dữ liệu' : 'Đăng nhập thu ngân'}
          </p>
        </div>
        {!online && (
          <p role="status" className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Đang mất mạng: cần có mạng để đăng nhập.
          </p>
        )}
        {error && (
          <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Tên đăng nhập
          <input
            className="rounded border border-slate-300 px-3 py-2 text-base"
            autoComplete="username"
            autoFocus={!reauth}
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Mật khẩu
          <input
            type="password"
            className="rounded border border-slate-300 px-3 py-2 text-base"
            autoComplete="current-password"
            autoFocus={reauth}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={busy || !online}
          className="rounded bg-slate-900 px-4 py-2 font-semibold text-white disabled:bg-slate-400"
        >
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
        {reauth && (
          <button type="button" onClick={() => navigate('/')} className="text-sm text-slate-600 underline">
            Quay lại bán hàng
          </button>
        )}
      </form>
    </main>
  );
}
