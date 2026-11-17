import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { useAuth } from '../auth';

const authResponseSchema = z.object({
  authorized: z.boolean(),
  managerName: z.string(),
  managerRole: z.string(),
  approvalToken: z.string(),
});

export function ManagerApprovalModal({
  title = 'Yêu cầu Quản lý phê duyệt chiết khấu > 10%',
  onClose,
  onApproved,
}: {
  title?: string;
  onClose: () => void;
  onApproved: (managerName: string, approvalToken: string) => void;
}) {
  const { api } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const authMut = useMutation({
    mutationFn: () =>
      api.post('/sales/authorize-discount', authResponseSchema, {
        username,
        password,
      }),
    onSuccess: (data) => {
      onApproved(data.managerName, data.approvalToken);
      onClose();
    },
    onError: (err: { message?: string }) => {
      setError(err?.message || 'Tài khoản không đúng hoặc không đủ thẩm quyền duyệt');
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    authMut.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        <p className="mt-1 text-xs text-gray-500">
          Chỉ Quản lý chi nhánh (BRANCH_MANAGER) hoặc Chủ chuỗi (OWNER) mới có quyền duyệt chiết khấu vượt hạn
          mức.
        </p>

        {error && (
          <div className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-700">Tên đăng nhập quản lý</label>
            <input
              type="text"
              required
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700">Mật khẩu</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="mt-5 flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={authMut.isPending}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white shadow hover:bg-blue-700 disabled:opacity-50"
            >
              {authMut.isPending ? 'Đang xác thực...' : 'Phê duyệt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
