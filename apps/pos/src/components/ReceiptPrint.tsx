import type { SaleDetail } from '@retailchain/shared';
import { formatDateTime, formatVnd } from '../lib/format';

export function ReceiptPrint({ sale }: { sale: SaleDetail }) {
  const cashPayment = sale.payments.find((p) => p.method === 'CASH')?.amount ?? 0;
  const otherPayments = sale.payments.filter((p) => p.method !== 'CASH');
  const totalPaid = sale.payments.reduce((acc, p) => acc + p.amount, 0);
  const change = Math.max(0, totalPaid - sale.total);

  return (
    <div id="receipt-print-area" className="text-xs text-black">
      <div className="text-center pb-2 border-b border-dashed border-gray-400">
        <h2 className="text-base font-bold uppercase tracking-wider">HỆ THỐNG BÁN LẺ POS</h2>
        <p className="font-medium text-gray-700">{sale.branchName ?? 'Cửa hàng tiện lợi'}</p>
        <p className="text-[10px] text-gray-500">Hotline: 1900 6868</p>
      </div>

      <div className="py-2 border-b border-dashed border-gray-400 space-y-0.5 text-[11px]">
        <div className="flex justify-between">
          <span className="font-bold">Mã HĐ:</span>
          <span className="font-mono font-bold">{sale.code}</span>
        </div>
        <div className="flex justify-between">
          <span>Thời gian:</span>
          <span>{formatDateTime(sale.createdAtServer)}</span>
        </div>
        <div className="flex justify-between">
          <span>Thu ngân:</span>
          <span>{sale.cashierName ?? 'Thu ngân'}</span>
        </div>
      </div>

      {/* Items Table */}
      <table className="w-full my-2 text-[11px]">
        <thead>
          <tr className="border-b border-gray-300 text-left">
            <th className="py-1">Mặt hàng</th>
            <th className="py-1 text-center">SL</th>
            <th className="py-1 text-right">Đơn giá</th>
            <th className="py-1 text-right">T.Tiền</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {sale.items.map((item, idx) => (
            <tr key={idx} className="align-top">
              <td className="py-1">
                <p className="font-medium">{item.variantName ?? item.productName ?? 'Sản phẩm'}</p>
                {item.sku && <p className="text-[10px] text-gray-500">{item.sku}</p>}
                {item.discount > 0 && (
                  <p className="text-[10px] text-red-600">Giảm: -{formatVnd(item.discount)}</p>
                )}
              </td>
              <td className="py-1 text-center font-medium">{item.quantity}</td>
              <td className="py-1 text-right">{formatVnd(item.unitPrice)}</td>
              <td className="py-1 text-right font-semibold">{formatVnd(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary */}
      <div className="pt-2 border-t border-dashed border-gray-400 space-y-1 text-[11px]">
        <div className="flex justify-between">
          <span>Tổng tiền hàng:</span>
          <span>{formatVnd(sale.subtotal)}</span>
        </div>
        {sale.discount > 0 && (
          <div className="flex justify-between text-red-600">
            <span>Chiết khấu đơn:</span>
            <span>-{formatVnd(sale.discount)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-bold pt-1 border-t border-gray-300">
          <span>TỔNG CỘNG:</span>
          <span className="text-base">{formatVnd(sale.total)}</span>
        </div>

        {/* Payments breakdown */}
        <div className="pt-2 space-y-0.5 text-[10px] text-gray-700">
          {cashPayment > 0 && (
            <div className="flex justify-between">
              <span>Tiền mặt:</span>
              <span>{formatVnd(cashPayment)}</span>
            </div>
          )}
          {otherPayments.map((p, idx) => (
            <div key={idx} className="flex justify-between">
              <span>{p.method === 'QR' ? 'Chuyển khoản QR' : 'Thanh toán Thẻ'}:</span>
              <span>{formatVnd(p.amount)}</span>
            </div>
          ))}
          {change > 0 && (
            <div className="flex justify-between font-bold text-gray-900 pt-0.5">
              <span>Tiền thừa trả khách:</span>
              <span>{formatVnd(change)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="text-center pt-4 pb-2 border-t border-dashed border-gray-400 mt-3 space-y-1">
        <p className="font-semibold text-[11px]">CẢM ƠN QUÝ KHÁCH VÀ HẸN GẶP LẠI!</p>
        <p className="text-[10px] text-gray-500">Đổi trả sản phẩm trong vòng 7 ngày (kèm hóa đơn)</p>
      </div>
    </div>
  );
}
