import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { shiftSchema, type Shift } from '@retailchain/shared';
import { useAuth } from '../auth';

export function OpenShiftModal({
  onClose,
  onSuccess,
}: {
  onClose?: () => void;
  onSuccess: (shift: Shift) => void;
}) {
  const { api } = useAuth();
  const qc = useQueryClient();
  const [openingCash, setOpeningCash] = useState('0');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const openMut = useMutation({
    mutationFn: () =>
      api.post('/shifts/open', shiftSchema, {
        openingCash: parseInt(openingCash || '0', 10),
        note: note || null,
      }),
    onSuccess: (newShift) => {
      qc.invalidateQueries({ queryKey: ['current-shift'] });
      onSuccess(newShift);
    },
    onError: (err: { message?: string }) => {
      setError(err?.message || 'Không thể mở ca làm việc');
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    openMut.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-xl font-bold text-gray-900">Mở ca làm việc mới</h2>
        <p className="mt-1 text-sm text-gray-500">
          Vui lòng kiểm đếm tiền mặt đầu ca tại ngăn kéo thu ngân trước khi bắt đầu bán hàng.
        </p>

        {error && (
          <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="openingCashInput" className="block text-sm font-semibold text-gray-700">
              Tiền mặt đầu ca (VNĐ) <span className="text-red-500">*</span>
            </label>
            <input
              id="openingCashInput"
              type="number"
              min="0"
              step="1000"
              required
              autoFocus
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-lg font-semibold text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Ghi chú mở ca</label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú thêm nếu có..."
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="mt-6 flex justify-end gap-3 pt-2 border-t border-gray-100">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Hủy
              </button>
            )}
            <button
              type="submit"
              disabled={openMut.isPending}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow hover:bg-blue-700 disabled:opacity-50"
            >
              {openMut.isPending ? 'Đang mở ca...' : 'Xác nhận mở ca'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
