import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  saleDetailSchema,
  salePageSchema,
  saleReturnSchema,
  type SaleDetail,
  type SaleReturn,
} from '@retailchain/shared';
import { useAuth } from '../auth';
import { formatDateTime, formatVnd } from '../lib/format';

export function ReturnsPage({ onBack }: { onBack: () => void }) {
  const { api } = useAuth();
  const [searchCode, setSearchCode] = useState('');
  const [selectedSale, setSelectedSale] = useState<SaleDetail | null>(null);
  const [returnItems, setReturnItems] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('Khách đổi ý / hàng lỗi');
  const [completedReturn, setCompletedReturn] = useState<SaleReturn | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Search invoice
  const searchMut = useMutation({
    mutationFn: async (code: string) => {
      const res = await api.get('/sales', salePageSchema, { query: { code: code.trim(), pageSize: 1 } });
      if (res.items.length === 0) {
        throw new Error('Không tìm thấy hóa đơn với mã này');
      }
      return api.get(`/sales/${res.items[0]!.id}`, saleDetailSchema);
    },
    onSuccess: (sale) => {
      setSelectedSale(sale);
      setCompletedReturn(null);
      setError(null);
      // Init return quantities
      const initial: Record<string, number> = {};
      for (const item of sale.items) {
        initial[item.id] = 0;
      }
      setReturnItems(initial);
    },
    onError: (err: { message?: string }) => {
      setError(err?.message || 'Không tìm thấy hóa đơn');
      setSelectedSale(null);
    },
  });

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    if (!searchCode.trim()) return;
    searchMut.mutate(searchCode);
  };

  const handleQtyChange = (itemId: string, maxQty: number, val: string) => {
    const qty = Math.max(0, Math.min(maxQty, parseInt(val || '0', 10)));
    setReturnItems((prev) => ({ ...prev, [itemId]: qty }));
  };

  // Calculate refund
  const totalRefund = selectedSale
    ? selectedSale.items.reduce((sum, item) => {
        const qty = returnItems[item.id] ?? 0;
        return sum + qty * item.unitPrice;
      }, 0)
    : 0;

  const returnMut = useMutation({
    mutationFn: async () => {
      if (!selectedSale) return;
      const itemsToReturn = selectedSale.items
        .filter((item) => (returnItems[item.id] ?? 0) > 0)
        .map((item) => ({
          saleItemId: item.id,
          variantId: item.variantId,
          quantity: returnItems[item.id]!,
          refundAmount: returnItems[item.id]! * item.unitPrice,
        }));

      if (itemsToReturn.length === 0) {
        throw new Error('Vui lòng chọn ít nhất 1 sản phẩm để trả lại');
      }

      return api.post(`/sales/${selectedSale.id}/returns`, saleReturnSchema, {
        reason,
        items: itemsToReturn,
      });
    },
    onSuccess: (data) => {
      setCompletedReturn(data as SaleReturn);
      setError(null);
    },
    onError: (err: { message?: string }) => {
      setError(err?.message || 'Không thể tạo phiếu đổi trả');
    },
  });

  return (
    <div className="flex flex-col min-h-screen bg-slate-100">
      <header className="flex items-center justify-between bg-slate-900 px-6 py-3 text-white">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold hover:bg-slate-700"
          >
            ← Quay lại Bán hàng
          </button>
          <h1 className="text-lg font-bold">Đổi trả hàng (REQ-POS-04)</h1>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-4xl mx-auto w-full space-y-6">
        {/* Search invoice card */}
        <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-200">
          <h2 className="text-base font-bold text-gray-900 mb-2">Tra cứu hóa đơn mua hàng</h2>
          <form onSubmit={handleSearch} className="flex gap-3">
            <input
              type="text"
              autoFocus
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value)}
              placeholder="Nhập mã hóa đơn (VD: HD-CH01-261120-0001)..."
              className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={searchMut.isPending}
              className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {searchMut.isPending ? 'Đang tìm...' : 'Tìm kiếm'}
            </button>
          </form>

          {error && (
            <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 border border-red-200">
              {error}
            </div>
          )}
        </div>

        {/* Success message */}
        {completedReturn && (
          <div className="rounded-2xl bg-green-50 p-6 border border-green-200 shadow-sm text-center space-y-2">
            <span className="text-3xl">🎉</span>
            <h3 className="text-lg font-bold text-green-900">Đổi trả hàng thành công!</h3>
            <p className="text-sm text-green-800">
              Mã phiếu hoàn: <span className="font-mono font-bold">{completedReturn.code}</span>
            </p>
            <p className="text-base font-bold text-green-900">
              Số tiền hoàn trả khách: {formatVnd(completedReturn.totalRefund)}
            </p>
            <div className="pt-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedSale(null);
                  setCompletedReturn(null);
                  setSearchCode('');
                }}
                className="rounded-xl bg-green-700 px-5 py-2 text-sm font-bold text-white hover:bg-green-800"
              >
                Tiếp tục đổi trả đơn khác
              </button>
            </div>
          </div>
        )}

        {/* Sale details & items selection */}
        {selectedSale && !completedReturn && (
          <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-200 space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div>
                <span className="text-xs text-gray-500">Mã hóa đơn:</span>
                <p className="text-lg font-bold text-gray-900 font-mono">{selectedSale.code}</p>
                <p className="text-xs text-gray-500">
                  Ngày mua: {formatDateTime(selectedSale.createdAtServer)} · Thu ngân:{' '}
                  {selectedSale.cashierName ?? '-'}
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs text-gray-500">Tổng tiền đơn gốc:</span>
                <p className="text-lg font-black text-gray-900">{formatVnd(selectedSale.total)}</p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-gray-800 mb-3">Chọn số lượng sản phẩm trả lại</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-gray-500 text-xs text-left">
                    <th className="pb-2">Sản phẩm</th>
                    <th className="pb-2 text-right">Đơn giá</th>
                    <th className="pb-2 text-center">Đã mua</th>
                    <th className="pb-2 text-center">Đã trả</th>
                    <th className="pb-2 text-center">Còn lại</th>
                    <th className="pb-2 text-right w-28">SL trả lại</th>
                    <th className="pb-2 text-right">Tiền hoàn</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedSale.items.map((item) => {
                    const remaining = item.quantity - item.returnedQuantity;
                    const returnQty = returnItems[item.id] ?? 0;
                    return (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="py-3 font-medium text-gray-900">
                          {item.variantName ?? item.productName ?? 'Sản phẩm'}
                          {item.sku && <p className="text-xs text-gray-400 font-mono">{item.sku}</p>}
                        </td>
                        <td className="py-3 text-right">{formatVnd(item.unitPrice)}</td>
                        <td className="py-3 text-center">{item.quantity}</td>
                        <td className="py-3 text-center text-red-500">{item.returnedQuantity}</td>
                        <td className="py-3 text-center font-bold text-blue-700">{remaining}</td>
                        <td className="py-3 text-right">
                          <input
                            type="number"
                            min="0"
                            max={remaining}
                            disabled={remaining <= 0}
                            value={returnQty}
                            onChange={(e) => handleQtyChange(item.id, remaining, e.target.value)}
                            className="w-20 rounded-lg border border-gray-300 p-1.5 text-center text-sm font-bold text-gray-900 focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
                          />
                        </td>
                        <td className="py-3 text-right font-bold text-gray-900">
                          {formatVnd(returnQty * item.unitPrice)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pt-4 border-t border-gray-100 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700">Lý do đổi trả</label>
                <input
                  type="text"
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Lý do đổi trả hàng..."
                  className="mt-1 w-full rounded-xl border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div>
                  <span className="text-xs text-gray-500">Tổng tiền hoàn trả khách:</span>
                  <p className="text-2xl font-black text-red-600">{formatVnd(totalRefund)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => returnMut.mutate()}
                  disabled={returnMut.isPending || totalRefund <= 0}
                  className="rounded-xl bg-red-600 px-6 py-3 text-base font-bold text-white shadow-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {returnMut.isPending ? 'Đang xử lý...' : 'Xác nhận hoàn tiền & Nhập lại kho'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
