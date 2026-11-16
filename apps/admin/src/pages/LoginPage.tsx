import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiRequestError, ErrorCode } from '@retailchain/shared';
import { useAuth, useSession } from '../auth/AuthContext';
import { Button, Field, inputClass } from '../components/ui';

export function loginErrorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.isNetworkError) return 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
    if (err.code === ErrorCode.ACCOUNT_LOCKED) {
      const until = (err.details as { lockedUntil?: string } | undefined)?.lockedUntil;
      return until
        ? `Tài khoản tạm khóa đến ${new Date(until).toLocaleTimeString('vi-VN')} do đăng nhập sai nhiều lần.`
        : err.message;
    }
    return err.message;
  }
  return 'Đăng nhập thất bại';
}

export function LoginPage() {
  const auth = useAuth();
  const session = useSession();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session && !busy)
    return <Navigate to={session.user.mustChangePassword ? '/change-password' : from} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const s = await auth.login(username, password);
      navigate(s.user.mustChangePassword ? '/change-password' : from, { replace: true });
    } catch (err) {
      setError(loginErrorMessage(err));
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg bg-white p-6 shadow"
        aria-label="Đăng nhập"
      >
        <div>
          <h1 className="text-xl font-bold text-slate-800">RetailChain</h1>
          <p className="text-sm text-slate-500">Đăng nhập trang quản trị</p>
        </div>
        {error && (
          <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <Field label="Tên đăng nhập">
          {(id) => (
            <input
              id={id}
              className={inputClass}
              autoComplete="username"
              autoFocus
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          )}
        </Field>
        <Field label="Mật khẩu">
          {(id) => (
            <input
              id={id}
              type="password"
              className={inputClass}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </Button>
      </form>
    </main>
  );
}
