import { useState, useRef, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  calculateCartSummary,
  calculateLineTotal,
  isDiscountOverLimit,
  productPageSchema,
  shiftSummarySchema,
  type SaleDetail,
  type ShiftSummary,
} from '@retailchain/shared';
import { useAuth, useOnline, useSession } from '../auth';
import { posSessionStatus } from '../lib/pos-session';
import { formatVnd } from '../lib/format';
import { OpenShiftModal } from '../components/OpenShiftModal';
import { CloseShiftModal } from '../components/CloseShiftModal';
import { ProductSearchModal, type SelectedVariant } from '../components/ProductSearchModal';
import { PaymentModal, type CartItem } from '../components/PaymentModal';
import { ManagerApprovalModal } from '../components/ManagerApprovalModal';
import { ReceiptPrint } from '../components/ReceiptPrint';
import { ReturnsPage } from './ReturnsPage';

export const OFFLINE_LOGOUT_WARNING = 'Không thể đăng nhập lại khi mất mạng';

export function HomePage() {
  const auth = useAuth();
  const session = useSession();
  const online = useOnline();
  const navigate = useNavigate();

  // Mode: 'pos' or 'returns'
  const [view, setView] = useState<'pos' | 'returns'>('pos');
  const [confirmOffline, setConfirmOffline] = useState(false);

  // Modals state
  const [openShiftOpen, setOpenShiftOpen] = useState(false);
  const [closeShiftOpen, setCloseShiftOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [approvalModal, setApprovalModal] = useState<{
    type: 'item' | 'order';
    variantId?: string;
    discountAmount: number;
  } | null>(null);
  const [printedSale, setPrintedSale] = useState<SaleDetail | null>(null);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderDiscount, setOrderDiscount] = useState<number>(0);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeError, setBarcodeError] = useState<string | null>(null);

  const barcodeRef = useRef<HTMLInputElement>(null);

  // Load current shift
  const { data: shiftSummary, refetch: refetchShift } = useQuery<ShiftSummary | null>({
    queryKey: ['current-shift'],
    queryFn: async () => {
      try {
        return await auth.api.get('/shifts/current', shiftSummarySchema);
      } catch {
        return null;
      }
    },
    enabled: !!session && online,
  });

  const currentShift = shiftSummary?.shift;

  // Keep barcode input focused
  useEffect(() => {
    if (
      view === 'pos' &&
      !searchModalOpen &&
      !paymentModalOpen &&
      !openShiftOpen &&
      !closeShiftOpen &&
      !approvalModal &&
      !printedSale
    ) {
      barcodeRef.current?.focus();
    }
  }, [view, searchModalOpen, paymentModalOpen, openShiftOpen, closeShiftOpen, approvalModal, printedSale]);

  // Global Keyboard Shortcuts (F2, F4, F9, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (view !== 'pos') return;

      if (e.key === 'F2') {
        e.preventDefault();
        setSearchModalOpen(true);
      } else if (e.key === 'F9') {
        e.preventDefault();
        if (cart.length > 0) {
          if (!currentShift) {
            setOpenShiftOpen(true);
          } else {
            setPaymentModalOpen(true);
          }
        }
      } else if (e.key === 'Escape') {
        if (!searchModalOpen && !paymentModalOpen && !openShiftOpen && !closeShiftOpen && !approvalModal) {
          if (cart.length > 0) {
            if (window.confirm('Bạn có chắc chắn muốn hủy giỏ hàng hiện tại?')) {
              setCart([]);
              setOrderDiscount(0);
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view, cart.length, currentShift, searchModalOpen, paymentModalOpen, openShiftOpen, closeShiftOpen, approvalModal]);

  if (!session) return null;
  const status = posSessionStatus(session, online);

  async function logout() {
    setConfirmOffline(false);
    await auth.logout();
    navigate('/login', { replace: true });
  }

  // Cart operations
  const addVariantToCart = (v: SelectedVariant) => {
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.variantId === v.variantId);
      if (idx >= 0) {
        const item = prev[idx]!;
        const newQty = item.quantity + 1;
        const lineTotal = calculateLineTotal(newQty, item.unitPrice, item.discount);
        const updated = [...prev];
        updated[idx] = { ...item, quantity: newQty, lineTotal };
        return updated;
      }
      return [
        ...prev,
        {
          variantId: v.variantId,
          variantName: v.variantName,
          productName: v.productName,
          sku: v.sku,
          unit: v.unit,
          unitPrice: v.price,
          quantity: 1,
          discount: 0,
          lineTotal: v.price,
        },
      ];
    });
    setBarcodeError(null);
  };

  const handleBarcodeSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;

    setBarcodeError(null);
    try {
      // 1. Search by barcode code or SKU
      const res = await auth.api.get('/products', productPageSchema, {
        query: { q: code, pageSize: 5 },
      });

      if (res.items.length === 0) {
        setBarcodeError(`Không tìm thấy sản phẩm có mã "${code}"`);
        return;
      }

      // Find matching variant
      let foundVariant: SelectedVariant | null = null;
      for (const p of res.items) {
        for (const v of p.variants) {
          if (v.sku.toLowerCase() === code.toLowerCase() || (v.barcodes && v.barcodes.some((b) => b.code === code))) {
            foundVariant = {
              variantId: v.id,
              variantName: v.name,
              productName: p.name,
              sku: v.sku,
              unit: p.unit,
              price: v.price ?? p.defaultPrice,
            };
            break;
          }
        }
        if (foundVariant) break;
      }

      // If exact SKU/barcode not found, pick the first variant of first product match
      if (!foundVariant && res.items[0]?.variants[0]) {
        const p = res.items[0];
        const v = p.variants[0]!;
        foundVariant = {
          variantId: v.id,
          variantName: v.name,
          productName: p.name,
          sku: v.sku,
          unit: p.unit,
          price: v.price ?? p.defaultPrice,
        };
      }

      if (foundVariant) {
        addVariantToCart(foundVariant);
        setBarcodeInput('');
      } else {
        setBarcodeError(`Không tìm thấy sản phẩm với mã "${code}"`);
      }
    } catch (err: unknown) {
      setBarcodeError(err instanceof Error ? err.message : 'Lỗi tra cứu sản phẩm');
    }
  };

  const updateQuantity = (variantId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(variantId);
      return;
    }
    setCart((prev) =>
      prev.map((i) =>
        i.variantId === variantId
          ? {
              ...i,
              quantity,
              lineTotal: calculateLineTotal(quantity, i.unitPrice, i.discount),
            }
          : i,
      ),
    );
  };

  const removeFromCart = (variantId: string) => {
    setCart((prev) => prev.filter((i) => i.variantId !== variantId));
  };

  const setItemDiscount = (variantId: string, discount: number) => {
    const item = cart.find((i) => i.variantId === variantId);
    if (!item) return;

    const baseAmount = item.quantity * item.unitPrice;
    // Check if discount > 10%
    if (isDiscountOverLimit(discount, baseAmount, 10)) {
      setApprovalModal({ type: 'item', variantId, discountAmount: discount });
      return;
    }

    applyItemDiscount(variantId, discount);
  };

  const applyItemDiscount = (variantId: string, discount: number) => {
    setCart((prev) =>
      prev.map((i) =>
        i.variantId === variantId
          ? {
              ...i,
              discount,
              lineTotal: calculateLineTotal(i.quantity, i.unitPrice, discount),
            }
          : i,
      ),
    );
  };

  const handleSetOrderDiscount = (discount: number) => {
    const summary = calculateCartSummary(cart, 0);
    const netSubtotal = summary.subtotal - summary.itemsDiscount;

    if (isDiscountOverLimit(discount, netSubtotal, 10)) {
      setApprovalModal({ type: 'order', discountAmount: discount });
      return;
    }

    setOrderDiscount(discount);
  };

  const summary = calculateCartSummary(cart, orderDiscount);

  if (view === 'returns') {
    return <ReturnsPage onBack={() => setView('pos')} />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      {/* Top Header */}
      <header className="flex items-center justify-between bg-slate-900 px-4 py-2.5 text-white shadow">
        <div className="flex items-center gap-6">
          <div>
            <span className="text-base font-black tracking-wide text-blue-400">RETAILCHAIN POS</span>
            <p className="text-[11px] text-slate-400">
              {session.user.fullName} · {session.user.username}
            </p>
          </div>

          {/* Shift status pill */}
          <div className="flex items-center gap-2">
            {currentShift ? (
              <div className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-1 text-xs border border-slate-700">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="font-semibold text-emerald-300">Ca: {currentShift.code}</span>
                <button
                  type="button"
                  onClick={() => setCloseShiftOpen(true)}
                  className="ml-2 rounded bg-red-600/80 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-red-600"
                >
                  Chốt ca
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg bg-amber-950/80 px-3 py-1 text-xs border border-amber-800 text-amber-200">
                <span>⚠ Chưa mở ca</span>
                <button
                  type="button"
                  onClick={() => setOpenShiftOpen(true)}
                  className="ml-1 rounded bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-slate-950 hover:bg-amber-400"
                >
                  Mở ca ngay
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setView('returns')}
            className="rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200"
          >
            🔄 Đổi trả hàng
          </button>
          <span
            role="status"
            aria-label="Trạng thái mạng"
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
              online ? 'bg-emerald-500 text-slate-950' : 'bg-amber-500 text-slate-950'
            }`}
          >
            {online ? 'Trực tuyến' : 'Ngoại tuyến'}
          </span>
          <button
            type="button"
            onClick={() => (online ? void logout() : setConfirmOffline(true))}
            className="rounded border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            Đăng xuất
          </button>
        </div>
      </header>

      {/* Offline warning alerts */}
      {status === 'needs-reauth' && (
        <div
          role="alert"
          className="flex items-center justify-between bg-amber-100 px-4 py-2 text-sm text-amber-900 border-b border-amber-200"
        >
          <span>Phiên đăng nhập đã hết hạn. Bạn vẫn bán hàng được; hãy đăng nhập lại để đồng bộ dữ liệu.</span>
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="rounded bg-amber-600 px-3 py-1 font-semibold text-white"
          >
            Đăng nhập lại
          </button>
        </div>
      )}
      {status === 'offline' && (
        <div className="bg-amber-50 px-4 py-1.5 text-xs font-medium text-amber-900 border-b border-amber-200 text-center">
          ⚡ Đang mất mạng. Vẫn quét mã và bán hàng bình thường; dữ liệu sẽ tự đồng bộ khi có mạng lại.
        </div>
      )}

      {/* Main selling workspace */}
      <div className="flex flex-1 flex-col lg:flex-row overflow-hidden">
        {/* Left: Barcode scan bar + Cart Table */}
        <div className="flex flex-1 flex-col p-4 space-y-4 overflow-hidden">
          {/* Barcode scan input */}
          <div className="rounded-2xl bg-white p-3 shadow-sm border border-gray-200">
            <form onSubmit={handleBarcodeSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <input
                  ref={barcodeRef}
                  type="text"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  placeholder="Quét mã vạch (EAN-13) hoặc gõ SKU rồi nhấn Enter..."
                  className="w-full rounded-xl border-2 border-blue-500 bg-blue-50/20 px-4 py-2.5 text-base font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
              </div>
              <button
                type="button"
                onClick={() => setSearchModalOpen(true)}
                className="rounded-xl border border-gray-300 bg-gray-50 px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-gray-100"
              >
                🔍 Tìm sản phẩm (F2)
              </button>
            </form>

            {barcodeError && (
              <p className="mt-2 text-xs font-semibold text-red-600 flex items-center gap-1">
                <span>⚠</span> {barcodeError}
              </p>
            )}
          </div>

          {/* Cart Table */}
          <div className="flex-1 rounded-2xl bg-white shadow-sm border border-gray-200 flex flex-col overflow-hidden">
            <div className="border-b border-gray-200 px-4 py-3 bg-gray-50 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-800">
                Giỏ hàng <span className="text-gray-500 font-normal">({cart.length} món)</span>
              </h2>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Xóa toàn bộ giỏ hàng?')) {
                      setCart([]);
                      setOrderDiscount(0);
                    }
                  }}
                  className="text-xs text-red-600 hover:underline font-semibold"
                >
                  Xóa giỏ (Esc)
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center text-gray-400">
                  <span className="text-4xl mb-2">🛒</span>
                  <h1 className="font-bold text-gray-700 text-lg">Sẵn sàng bán hàng</h1>
                  <p className="text-xs text-gray-500 mt-1">Quét mã vạch hoặc nhấn F2 để tìm kiếm sản phẩm</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-gray-500 text-left bg-gray-50/50">
                      <th className="py-2.5 px-4">#</th>
                      <th className="py-2.5 px-2">Tên sản phẩm</th>
                      <th className="py-2.5 px-2 text-right">Đơn giá</th>
                      <th className="py-2.5 px-2 text-center w-32">Số lượng</th>
                      <th className="py-2.5 px-2 text-right">Giảm giá</th>
                      <th className="py-2.5 px-4 text-right">Thành tiền</th>
                      <th className="py-2.5 px-2 text-center">Xóa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {cart.map((item, idx) => (
                      <tr key={item.variantId} className="hover:bg-blue-50/30">
                        <td className="py-3 px-4 text-xs text-gray-400">{idx + 1}</td>
                        <td className="py-3 px-2">
                          <p className="font-semibold text-gray-900">{item.productName}</p>
                          <p className="text-xs text-gray-500 font-mono">
                            {item.variantName} · {item.sku}
                          </p>
                        </td>
                        <td className="py-3 px-2 text-right text-gray-800">{formatVnd(item.unitPrice)}</td>
                        <td className="py-3 px-2 text-center">
                          <div className="inline-flex items-center border border-gray-300 rounded-lg">
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                              className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded-l-lg"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) =>
                                updateQuantity(item.variantId, parseInt(e.target.value || '1', 10))
                              }
                              className="w-12 text-center font-bold text-gray-900 border-x border-gray-200 py-1 text-xs focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                              className="px-2 py-1 text-gray-600 hover:bg-gray-100 rounded-r-lg"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              const val = prompt(
                                `Nhập số tiền giảm giá cho ${item.productName} (VNĐ):`,
                                String(item.discount || 0),
                              );
                              if (val !== null) {
                                setItemDiscount(item.variantId, Math.max(0, parseInt(val || '0', 10)));
                              }
                            }}
                            className={`text-xs px-2 py-1 rounded font-medium border ${
                              item.discount > 0
                                ? 'bg-red-50 text-red-700 border-red-200 font-bold'
                                : 'text-gray-500 border-dashed border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            {item.discount > 0 ? `-${formatVnd(item.discount)}` : '+ Giảm giá'}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-gray-900">
                          {formatVnd(item.lineTotal)}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.variantId)}
                            className="text-red-500 hover:text-red-700 text-lg px-2"
                            title="Xóa dòng"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Right: Cart Summary Panel & Actions */}
        <div className="w-full lg:w-96 p-4 lg:pl-0 flex flex-col space-y-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm border border-gray-200 flex-1 flex flex-col justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900 pb-3 border-b border-gray-100">
                Tổng kết hóa đơn
              </h2>

              <div className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Tổng tiền hàng ({summary.totalQuantity} món):</span>
                  <span className="font-semibold text-gray-900">{formatVnd(summary.subtotal)}</span>
                </div>

                {summary.itemsDiscount > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Tổng giảm trên dòng:</span>
                    <span className="font-semibold">-{formatVnd(summary.itemsDiscount)}</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-gray-600 pt-2 border-t border-gray-100">
                  <span className="text-xs font-semibold">Chiết khấu đơn:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const val = prompt('Nhập số tiền chiết khấu toàn đơn (VNĐ):', String(orderDiscount));
                      if (val !== null) {
                        handleSetOrderDiscount(Math.max(0, parseInt(val || '0', 10)));
                      }
                    }}
                    className={`text-xs px-2.5 py-1 rounded font-bold border ${
                      orderDiscount > 0
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : 'text-blue-600 border-dashed border-blue-300 hover:bg-blue-50'
                    }`}
                  >
                    {orderDiscount > 0 ? `-${formatVnd(orderDiscount)}` : '+ Thêm chiết khấu'}
                  </button>
                </div>

                <div className="pt-4 border-t-2 border-gray-200">
                  <span className="text-xs uppercase font-bold text-gray-500">Khách cần thanh toán:</span>
                  <p className="text-3xl font-black text-blue-700 mt-1">{formatVnd(summary.total)}</p>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100 space-y-2">
              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => {
                  if (!currentShift) {
                    setOpenShiftOpen(true);
                  } else {
                    setPaymentModalOpen(true);
                  }
                }}
                className="w-full rounded-2xl bg-blue-600 py-4 text-center text-lg font-black text-white shadow-xl hover:bg-blue-700 disabled:opacity-40 transition active:scale-[0.99]"
              >
                THANH TOÁN (F9)
              </button>

              <div className="flex justify-between text-xs text-gray-400 px-1 pt-1 font-mono">
                <span>F2: Tìm kiếm</span>
                <span>F9: Thanh toán</span>
                <span>Esc: Hủy</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Offline logout warning dialog */}
      {confirmOffline && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div
            role="alertdialog"
            aria-labelledby="offline-logout-title"
            className="max-w-sm rounded-xl bg-white p-6 shadow-xl"
          >
            <h2 id="offline-logout-title" className="text-lg font-bold text-slate-800">
              {OFFLINE_LOGOUT_WARNING}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Máy đang mất mạng. Nếu đăng xuất bây giờ, không ai đăng nhập lại được cho đến khi có mạng và máy
              POS không bán được hàng.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmOffline(false)}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                className="rounded bg-red-600 px-3 py-1.5 text-sm font-semibold text-white"
              >
                Vẫn đăng xuất
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {openShiftOpen && (
        <OpenShiftModal
          onClose={() => setOpenShiftOpen(false)}
          onSuccess={() => {
            setOpenShiftOpen(false);
            refetchShift();
          }}
        />
      )}

      {closeShiftOpen && shiftSummary && (
        <CloseShiftModal
          summary={shiftSummary}
          onClose={() => setCloseShiftOpen(false)}
          onSuccess={() => {
            setCloseShiftOpen(false);
            refetchShift();
          }}
        />
      )}

      {searchModalOpen && (
        <ProductSearchModal
          onClose={() => setSearchModalOpen(false)}
          onSelect={(v) => addVariantToCart(v)}
        />
      )}

      {paymentModalOpen && currentShift && (
        <PaymentModal
          branchId={session.user.branchId ?? ''}
          shiftId={currentShift.id}
          subtotal={summary.subtotal}
          discount={summary.totalDiscount}
          total={summary.total}
          items={cart}
          onClose={() => setPaymentModalOpen(false)}
          onSuccess={(createdSale) => {
            setPaymentModalOpen(false);
            setCart([]);
            setOrderDiscount(0);
            setPrintedSale(createdSale);
            refetchShift();
          }}
        />
      )}

      {approvalModal && (
        <ManagerApprovalModal
          onClose={() => setApprovalModal(null)}
          onApproved={(mgr) => {
            alert(`Đã được Quản lý ${mgr} phê duyệt chiết khấu!`);
            if (approvalModal.type === 'item' && approvalModal.variantId) {
              applyItemDiscount(approvalModal.variantId, approvalModal.discountAmount);
            } else if (approvalModal.type === 'order') {
              setOrderDiscount(approvalModal.discountAmount);
            }
          }}
        />
      )}

      {/* Receipt print dialog */}
      {printedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl flex flex-col max-h-[90vh]">
            <h3 className="text-base font-bold text-gray-900 pb-2 border-b">Hóa đơn bán hàng đã tạo</h3>
            <div className="flex-1 overflow-y-auto py-2">
              <ReceiptPrint sale={printedSale} />
            </div>
            <div className="pt-4 border-t flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPrintedSale(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 shadow"
              >
                🖨 In lại hóa đơn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
