import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { shiftSchema, type Shift, type ShiftSummary } from '@retailchain/shared';
import { useAuth } from '../auth';
import { formatDateTime, formatVnd } from '../lib/format';

export function CloseShiftModal({
  summary,
  onClose,
  onSuccess,
}: {
  summary: ShiftSummary;
  onClose: () => void;
  onSuccess: (shift: Shift) => void;
}) {
  const { api } = useAuth();
  const qc = useQueryClient();
  const [closingCash, setClosingCash] = useState(String(summary.expectedCash));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const parsedClosing = parseInt(closingCash || '0', 10);
  const diff = parsedClosing - summary.expectedCash;

  const closeMut = useMutation({
    mutationFn: () =>
      api.post(`/shifts/${summary.shift.id}/close`, shiftSchema, {
        closingCash: parsedClosing,
        note: note || null,
      }),
    onSuccess: (closedShift) => {
      qc.invalidateQueries({ queryKey: ['current-shift'] });
      onSuccess(closedShift);
    },
    onError: (err: { message?: string }) => {
      setError(err?.message || 'Không thể chốt ca làm việc');
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    closeMut.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b pb-3 border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Chốt ca làm việc</h2>
            <p className="text-xs text-gray-500 font-mono mt-0.5">{summary.shift.code}</p>
          </div>
          <span className="text-xs text-gray-500">Mở lúc: {formatDateTime(summary.shift.openedAt)}</span>
        </div>

        {error && (
          <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Summary table */}
          <div className="rounded-xl bg-gray-50 p-4 border border-gray-200 space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Tiền mặt đầu ca:</span>
              <span className="font-semibold text-gray-900">{formatVnd(summary.shift.openingCash)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Doanh thu tiền mặt (+):</span>
              <span className="font-semibold text-green-700">+{formatVnd(summary.cashSales)}</span>
            </div>
            {summary.cashRefunds > 0 && (
              <div className="flex justify-between text-gray-600">
                <span>Hoàn tiền mặt đổi trả (-):</span>
                <span className="font-semibold text-red-600">-{formatVnd(summary.cashRefunds)}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-500 text-xs pt-1 border-t border-gray-200">
              <span>Doanh thu không dùng tiền mặt (Thẻ + QR):</span>
              <span className="font-medium text-gray-700">
                {formatVnd(summary.cardSales + summary.qrSales)}
              </span>
            </div>
            <div className="flex justify-between text-base font-bold text-blue-900 pt-2 border-t border-gray-300">
              <span>TIỀN MẶT DỰ KIẾN TRONG KÉT:</span>
              <span className="text-lg">{formatVnd(summary.expectedCash)}</span>
            </div>
          </div>

          <div>
            <label htmlFor="closingCashInput" className="block text-sm font-semibold text-gray-700">
              Tiền mặt đếm thực tế (VNĐ) <span className="text-red-500">*</span>
            </label>
            <input
              id="closingCashInput"
              type="number"
              min="0"
              step="1000"
              required
              autoFocus
              value={closingCash}
              onChange={(e) => setClosingCash(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-xl font-bold text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Difference indicator */}
          <div
            className={`rounded-lg p-3 text-sm font-semibold flex items-center justify-between ${
              diff === 0
                ? 'bg-green-50 text-green-800 border border-green-200'
                : diff > 0
                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                  : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            <span>
              {diff === 0
                ? '✓ Tiền đếm khớp 100% với hệ thống'
                : diff > 0
                  ? '⚠ Tiền thực tế thừa so với dự kiến'
                  : '⚠ Tiền thực tế thiếu so với dự kiến'}
            </span>
            <span className="text-base font-bold font-mono">
              {diff > 0 ? `+${formatVnd(diff)}` : diff < 0 ? formatVnd(diff) : '0 đ'}
            </span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Ghi chú đối soát</label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Giải trình nguyên nhân chênh lệch (nếu có)..."
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="mt-6 flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={closeMut.isPending}
              className="rounded-lg bg-red-600 px-5 py-2 text-sm font-bold text-white shadow hover:bg-red-700 disabled:opacity-50"
            >
              {closeMut.isPending ? 'Đang chốt ca...' : 'Xác nhận chốt ca'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
