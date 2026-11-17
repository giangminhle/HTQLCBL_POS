import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  PaymentMethod,
  saleDetailSchema,
  uuidv7,
  type CreateSaleInput,
  type PaymentInput,
  type SaleDetail,
} from '@retailchain/shared';
import { useAuth } from '../auth';
import { formatVnd } from '../lib/format';

export interface CartItem {
  variantId: string;
  variantName: string;
  productName: string;
  sku: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  discount: number;
  lineTotal: number;
}

export function PaymentModal({
  branchId,
  shiftId,
  subtotal,
  discount,
  total,
  items,
  note,
  onClose,
  onSuccess,
}: {
  branchId: string;
  shiftId: string;
  subtotal: number;
  discount: number;
  total: number;
  items: CartItem[];
  note?: string;
  onClose: () => void;
  onSuccess: (sale: SaleDetail) => void;
}) {
  const { api } = useAuth();
  const [activeTab, setActiveTab] = useState<'CASH' | 'QR' | 'CARD'>('CASH');

  // Multi-tender state
  const [cashAmount, setCashAmount] = useState<string>(String(total));
  const [cashGiven, setCashGiven] = useState<string>(String(total));
  const [cardAmount, setCardAmount] = useState<string>('0');
  const [cardRef, setCardRef] = useState<string>('');
  const [qrAmount, setQrAmount] = useState<string>('0');
  const [qrRef, setQrRef] = useState<string>('');
  const [qrPaidMock, setQrPaidMock] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const numCash = parseInt(cashAmount || '0', 10);
  const numGiven = parseInt(cashGiven || '0', 10);
  const numCard = parseInt(cardAmount || '0', 10);
  const numQr = parseInt(qrAmount || '0', 10);

  const totalTenders = numCash + numCard + numQr;
  const remaining = Math.max(0, total - totalTenders);
  const change = Math.max(0, numGiven - numCash);

  // Hotkeys: Esc to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const saleMut = useMutation({
    mutationFn: (payload: CreateSaleInput) => api.post('/sales', saleDetailSchema, payload),
    onSuccess: (data) => {
      onSuccess(data);
    },
    onError: (err: { message?: string }) => {
      setError(err?.message || 'Không thể tạo đơn hàng');
    },
  });

  const handleComplete = () => {
    setError(null);
    if (totalTenders < total) {
      setError(`Tổng tiền thanh toán (${formatVnd(totalTenders)}) chưa đủ tổng đơn (${formatVnd(total)})`);
      return;
    }

    const payments: PaymentInput[] = [];
    if (numCash > 0) payments.push({ method: PaymentMethod.CASH, amount: numCash });
    if (numCard > 0) payments.push({ method: PaymentMethod.CARD, amount: numCard, reference: cardRef || null });
    if (numQr > 0) payments.push({ method: PaymentMethod.QR, amount: numQr, reference: qrRef || 'MOCK_QR_PAYMENT' });

    if (payments.length === 0) {
      setError('Cần ít nhất một phương thức thanh toán');
      return;
    }

    const saleId = uuidv7();
    const payload: CreateSaleInput = {
      id: saleId,
      branchId,
      shiftId,
      subtotal,
      discount,
      total,
      note: note || null,
      createdAtClient: new Date().toISOString(),
      items: items.map((i) => ({
        variantId: i.variantId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discount: i.discount,
        lineTotal: i.lineTotal,
      })),
      payments,
    };

    saleMut.mutate(payload);
  };

  const setFullCash = (val: number) => {
    setCashAmount(String(total));
    setCashGiven(String(val));
    setCardAmount('0');
    setQrAmount('0');
  };

  const handleSimulateQr = () => {
    setQrPaidMock(true);
    setQrRef(`VQR-${Date.now().toString().slice(-8)}`);
    setQrAmount(String(total));
    setCashAmount('0');
    setCardAmount('0');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Thanh toán đơn hàng (F9)</h2>
            <p className="text-xs text-gray-500 mt-0.5">{items.length} dòng sản phẩm</p>
          </div>
          <div className="text-right">
            <span className="text-xs text-gray-500">Cần thanh toán</span>
            <p className="text-2xl font-black text-blue-700">{formatVnd(total)}</p>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
            {error}
          </div>
        )}

        {/* Payment tabs */}
        <div className="mt-4 flex rounded-xl bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('CASH')}
            className={`flex-1 rounded-lg py-2 text-sm font-bold transition ${
              activeTab === 'CASH' ? 'bg-white text-blue-700 shadow' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            💵 Tiền mặt
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('QR')}
            className={`flex-1 rounded-lg py-2 text-sm font-bold transition ${
              activeTab === 'QR' ? 'bg-white text-blue-700 shadow' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            📱 Chuyển khoản QR (VietQR)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('CARD')}
            className={`flex-1 rounded-lg py-2 text-sm font-bold transition ${
              activeTab === 'CARD' ? 'bg-white text-blue-700 shadow' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            💳 Thẻ ngân hàng
          </button>
        </div>

        {/* Tab contents */}
        <div className="mt-4 flex-1 overflow-y-auto space-y-4">
          {activeTab === 'CASH' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="cashAmountInput" className="block text-xs font-semibold text-gray-700">Tiền mặt khách trả cho đơn</label>
                  <input
                    id="cashAmountInput"
                    type="number"
                    min="0"
                    step="1000"
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2.5 text-lg font-bold text-gray-900 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="cashGivenInput" className="block text-xs font-semibold text-gray-700">Khách đưa (để tính tiền thừa)</label>
                  <input
                    id="cashGivenInput"
                    type="number"
                    min="0"
                    step="1000"
                    value={cashGiven}
                    onChange={(e) => setCashGiven(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2.5 text-lg font-bold text-gray-900 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Quick cash buttons */}
              <div>
                <span className="text-xs font-medium text-gray-500">Gợi ý số tiền:</span>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setFullCash(total)}
                    className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs font-bold text-gray-700 hover:bg-gray-100"
                  >
                    Đủ tiền ({formatVnd(total)})
                  </button>
                  {[50000, 100000, 200000, 500000, 1000000].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setFullCash(val)}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      {formatVnd(val)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cash change */}
              <div className="rounded-xl bg-blue-50 p-4 border border-blue-200 flex items-center justify-between">
                <span className="text-sm font-medium text-blue-900">Tiền thừa trả khách:</span>
                <span className="text-xl font-black text-blue-800">{formatVnd(change)}</span>
              </div>
            </div>
          )}

          {activeTab === 'QR' && (
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row gap-6 items-center">
                {/* Mock QR display */}
                <div className="w-48 h-48 bg-white border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center p-3 text-center shadow-inner">
                  <div className="w-32 h-32 bg-gray-900 rounded-lg flex items-center justify-center p-2 text-white">
                    <div className="grid grid-cols-4 gap-1 w-full h-full p-1 bg-white">
                      <div className="bg-black col-span-2 row-span-2 rounded-sm" />
                      <div className="bg-black" />
                      <div className="bg-black" />
                      <div className="bg-black" />
                      <div className="bg-black col-span-2 row-span-2 rounded-sm" />
                    </div>
                  </div>
                  <span className="text-[10px] text-gray-500 font-mono mt-1">VietQR - NAPAS 247</span>
                </div>

                <div className="flex-1 space-y-3 w-full">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">Số tiền quét QR (VNĐ)</label>
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={qrAmount}
                      onChange={(e) => setQrAmount(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-lg font-bold text-gray-900 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">Mã tham chiếu / Giao dịch</label>
                    <input
                      type="text"
                      placeholder="Mã giao dịch ngân hàng..."
                      value={qrRef}
                      onChange={(e) => setQrRef(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleSimulateQr}
                    className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 shadow"
                  >
                    {qrPaidMock ? '✓ Đã giả lập thanh toán QR thành công' : '⚡ Giả lập khách đã quét QR thành công'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'CARD' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Số tiền quẹt thẻ (VNĐ)</label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={cardAmount}
                    onChange={(e) => setCardAmount(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2.5 text-lg font-bold text-gray-900 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Mã hóa đơn máy POS quẹt thẻ</label>
                  <input
                    type="text"
                    placeholder="Mã chuẩn chi / Trace ID..."
                    value={cardRef}
                    onChange={(e) => setCardRef(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Multi-tender status summary */}
        <div className="mt-4 pt-3 border-t border-gray-200">
          <div className="flex justify-between text-xs text-gray-600 pb-1">
            <span>Tổng các phương thức đã nhập:</span>
            <span className="font-semibold text-gray-900">{formatVnd(totalTenders)}</span>
          </div>
          {remaining > 0 && (
            <div className="flex justify-between text-xs text-red-600 font-bold">
              <span>Còn thiếu:</span>
              <span>{formatVnd(remaining)}</span>
            </div>
          )}
        </div>

        {/* Modal actions */}
        <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Hủy (Esc)
          </button>
          <button
            type="button"
            onClick={handleComplete}
            disabled={saleMut.isPending || totalTenders < total}
            className="rounded-lg bg-green-600 px-6 py-2.5 text-base font-bold text-white shadow-lg hover:bg-green-700 disabled:opacity-50"
          >
            {saleMut.isPending ? 'Đang thanh toán...' : 'Hoàn tất & In hóa đơn (Enter)'}
          </button>
        </div>
      </div>
    </div>
  );
}
