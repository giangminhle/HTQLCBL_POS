import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { changePasswordRequestSchema } from '@retailchain/shared';
import { useAuth, useSession } from '../auth/AuthContext';
import { Button, ErrorBanner, Field, inputClass } from '../components/ui';

export function ChangePasswordPage() {
  const auth = useAuth();
  const session = useSession();
  const navigate = useNavigate();
  const forced = session?.user.mustChangePassword ?? false;
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setApiError(null);
    const parsed = changePasswordRequestSchema.safeParse(form);
    const next: Record<string, string> = {};
    if (!parsed.success) {
      for (const i of parsed.error.issues) next[String(i.path[0])] ??= i.message;
    }
    if (form.newPassword !== form.confirm) next.confirm = 'Mật khẩu nhập lại không khớp';
    setErrors(next);
    if (!parsed.success || next.confirm) return;

    setBusy(true);
    try {
      await auth.changePassword(parsed.data);
      setDone(true);
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      if (forced) navigate('/', { replace: true });
    } catch (err) {
      setApiError(err);
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <section className="max-w-md">
      <h1 className="mb-1 text-2xl font-bold text-slate-800">Đổi mật khẩu</h1>
      {forced ? (
        <p role="status" className="mb-4 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Bạn đang dùng mật khẩu tạm hoặc mật khẩu ban đầu. Hãy đổi mật khẩu để tiếp tục sử dụng hệ thống.
        </p>
      ) : (
        <p className="mb-4 text-sm text-slate-500">Sau khi đổi, các thiết bị khác sẽ phải đăng nhập lại.</p>
      )}
      <form
        onSubmit={(e) => void onSubmit(e)}
        className="flex flex-col gap-3 rounded-lg bg-white p-4 shadow-sm"
      >
        <ErrorBanner error={apiError} />
        {done && (
          <p role="status" className="text-sm text-green-700">
            Đã đổi mật khẩu.
          </p>
        )}
        <Field label="Mật khẩu hiện tại" error={errors.currentPassword}>
          {(id) => (
            <input
              id={id}
              type="password"
              autoComplete="current-password"
              className={inputClass}
              value={form.currentPassword}
              onChange={set('currentPassword')}
            />
          )}
        </Field>
        <Field label="Mật khẩu mới (tối thiểu 8 ký tự, có chữ và số)" error={errors.newPassword}>
          {(id) => (
            <input
              id={id}
              type="password"
              autoComplete="new-password"
              className={inputClass}
              value={form.newPassword}
              onChange={set('newPassword')}
            />
          )}
        </Field>
        <Field label="Nhập lại mật khẩu mới" error={errors.confirm}>
          {(id) => (
            <input
              id={id}
              type="password"
              autoComplete="new-password"
              className={inputClass}
              value={form.confirm}
              onChange={set('confirm')}
            />
          )}
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? 'Đang lưu…' : 'Đổi mật khẩu'}
        </Button>
      </form>
    </section>
  );
}
