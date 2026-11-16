import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiRequestError, changePasswordRequestSchema } from '@retailchain/shared';
import { useAuth, useOnline } from '../auth';

/** Forced after a password reset or for a new account (REQ-AUTH-02). Requires network. */
export function ChangePasswordPage() {
  const auth = useAuth();
  const online = useOnline();
  const navigate = useNavigate();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = changePasswordRequestSchema.safeParse(form);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ');
    if (form.newPassword !== form.confirm) return setError('Mật khẩu nhập lại không khớp');
    setBusy(true);
    setError(null);
    try {
      await auth.changePassword(parsed.data);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Không đổi được mật khẩu');
    } finally {
      setBusy(false);
    }
  }

  const input = (k: keyof typeof form, label: string, ac: string) => (
    <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
      {label}
      <input
        type="password"
        autoComplete={ac}
        className="rounded border border-slate-300 px-3 py-2 text-base"
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
      />
    </label>
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl bg-white p-6"
      >
        <h1 className="text-xl font-bold text-slate-800">Đổi mật khẩu</h1>
        <p className="text-sm text-amber-800">Bạn cần đổi mật khẩu tạm trước khi bán hàng.</p>
        {!online && <p className="text-sm text-amber-800">Cần có mạng để đổi mật khẩu.</p>}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        {input('currentPassword', 'Mật khẩu hiện tại', 'current-password')}
        {input('newPassword', 'Mật khẩu mới (≥ 8 ký tự, có chữ và số)', 'new-password')}
        {input('confirm', 'Nhập lại mật khẩu mới', 'new-password')}
        <button
          type="submit"
          disabled={busy || !online}
          className="rounded bg-slate-900 px-4 py-2 font-semibold text-white disabled:bg-slate-400"
        >
          Đổi mật khẩu
        </button>
        <button
          type="button"
          onClick={() => void auth.logout().then(() => navigate('/login'))}
          className="text-sm underline"
        >
          Đăng xuất
        </button>
      </form>
    </main>
  );
}
