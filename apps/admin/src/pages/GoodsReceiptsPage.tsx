import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  branchPageSchema,
  goodsReceiptPageSchema,
  goodsReceiptSchema,
  GoodsReceiptStatus,
  productPageSchema,
  supplierPageSchema,
  type Branch,
  type GoodsReceipt,
} from '@retailchain/shared';
import { useAuth, useSession } from '../auth/AuthContext';
import {
  Badge,
  Button,
  ErrorBanner,
  Field,
  Modal,
  Pagination,
  formatDateTime,
  inputClass,
} from '../components/ui';
import { formatVnd } from '../lib/format';

export function GoodsReceiptsPage() {
  const { api } = useAuth();
  const session = useSession();
  const user = session?.user;
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(user?.branchId ?? '');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState<GoodsReceipt | null>(null);

  // Load branches for filter
  const { data: branchData } = useQuery({
    queryKey: ['branches-list'],
    queryFn: () => api.get('/branches', branchPageSchema, { query: { pageSize: 100 } }),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['goods-receipts', page, selectedBranchId, statusFilter],
    queryFn: () =>
      api.get('/inventory/goods-receipts', goodsReceiptPageSchema, {
        query: {
          page,
          pageSize: 15,
          branchId: selectedBranchId || undefined,
          status: statusFilter || undefined,
        },
      }),
  });

  const canWrite =
    user?.role === 'OWNER' || user?.role === 'BRANCH_MANAGER' || user?.role === 'WAREHOUSE_KEEPER';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Nhập kho (REQ-INV-01)</h1>
          <p className="text-sm text-slate-500">Quản lý các đợt nhập hàng từ nhà cung cấp vào kho</p>
        </div>

        <div className="flex items-center gap-3">
          {user?.role === 'OWNER' && (
            <select
              value={selectedBranchId}
              onChange={(e) => {
                setSelectedBranchId(e.target.value);
                setPage(1);
              }}
              className={inputClass}
            >
              <option value="">Tất cả chi nhánh</option>
              {branchData?.items.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className={inputClass}
          >
            <option value="">Tất cả trạng thái</option>
            <option value={GoodsReceiptStatus.DRAFT}>Bản nháp (DRAFT)</option>
            <option value={GoodsReceiptStatus.COMPLETED}>Đã hoàn thành</option>
          </select>

          {canWrite && (
            <Button onClick={() => setCreating(true)}>+ Nhập hàng</Button>
          )}
        </div>
      </div>

      <ErrorBanner error={error} />

      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Mã phiếu</th>
              <th className="px-4 py-3">Nhà cung cấp</th>
              <th className="px-4 py-3">Chi nhánh nhập</th>
              <th className="px-4 py-3 text-right">Tổng số lượng</th>
              <th className="px-4 py-3 text-right">Tổng giá vốn</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Người tạo</th>
              <th className="px-4 py-3">Ngày tạo</th>
              <th className="px-4 py-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {isLoading && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
                  Đang tải phiếu nhập kho...
                </td>
              </tr>
            )}
            {!isLoading && data?.items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
                  Chưa có phiếu nhập kho nào
                </td>
              </tr>
            )}
            {data?.items.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono font-medium text-slate-800">{r.code}</td>
                <td className="px-4 py-3 font-medium text-slate-800">{r.supplierName}</td>
                <td className="px-4 py-3 text-slate-700">{r.branchName}</td>
                <td className="px-4 py-3 text-right font-medium">{formatVnd(r.totalQuantity ?? 0)}</td>
                <td className="px-4 py-3 text-right font-medium text-emerald-700">
                  {formatVnd(r.totalCost ?? 0)} đ
                </td>
                <td className="px-4 py-3">
                  <Badge tone={r.status === GoodsReceiptStatus.COMPLETED ? 'green' : 'amber'}>
                    {r.status === GoodsReceiptStatus.COMPLETED ? 'Hoàn thành' : 'Bản nháp'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-slate-600">{r.createdByName}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(r.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <Button variant="secondary" onClick={() => setViewingReceipt(r)}>
                    Chi tiết
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && (
        <Pagination
          page={page}
          pageSize={15}
          total={data.total}
          onPage={(p) => setPage(p)}
        />
      )}

      {creating && (
        <CreateReceiptModal
          branches={branchData?.items ?? []}
          defaultBranchId={selectedBranchId || user?.branchId || ''}
          onClose={() => setCreating(false)}
          onSuccess={() => {
            setCreating(false);
            void qc.invalidateQueries({ queryKey: ['goods-receipts'] });
            void qc.invalidateQueries({ queryKey: ['balances'] });
          }}
        />
      )}

      {viewingReceipt && (
        <ReceiptDetailModal
          receiptId={viewingReceipt.id}
          canWrite={canWrite}
          onClose={() => setViewingReceipt(null)}
          onCompleted={() => {
            setViewingReceipt(null);
            void qc.invalidateQueries({ queryKey: ['goods-receipts'] });
            void qc.invalidateQueries({ queryKey: ['balances'] });
          }}
        />
      )}
    </div>
  );
}

function CreateReceiptModal({
  branches,
  defaultBranchId,
  onClose,
  onSuccess,
}: {
  branches: Branch[];
  defaultBranchId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { api } = useAuth();
  const session = useSession();
  const user = session?.user;
  const [branchId, setBranchId] = useState(defaultBranchId || branches[0]?.id || '');
  const [supplierId, setSupplierId] = useState('');
  const [note, setNote] = useState('');
  const [completeNow, setCompleteNow] = useState(true);
  const [items, setItems] = useState<Array<{ variantId: string; quantity: number; unitCost: number }>>([]);
  const [error, setError] = useState<unknown>(null);

  // Load active suppliers
  const { data: supplierData } = useQuery({
    queryKey: ['active-suppliers'],
    queryFn: () => api.get('/suppliers', supplierPageSchema, { query: { pageSize: 100, isActive: 'true' } }),
  });

  // Load catalog products & variants
  const { data: productData } = useQuery({
    queryKey: ['active-products-for-receipt'],
    queryFn: () => api.get('/products', productPageSchema, { query: { pageSize: 100, isActive: 'true' } }),
  });

  // Flatten active variants
  const availableVariants = (productData?.items ?? []).flatMap((p) =>
    p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      name: `${p.name} - ${v.name}`,
      unit: p.unit,
      costPrice: v.costPrice ?? p.costPrice,
    })),
  );

  const addItem = () => {
    if (availableVariants.length > 0) {
      const first = availableVariants[0]!;
      setItems([...items, { variantId: first.id, quantity: 1, unitCost: first.costPrice ?? 0 }]);
    }
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, patch: Partial<{ variantId: string; quantity: number; unitCost: number }>) => {
    setItems(
      items.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, ...patch };
        if (patch.variantId && patch.variantId !== item.variantId) {
          const v = availableVariants.find((x) => x.id === patch.variantId);
          if (v) updated.unitCost = v.costPrice ?? 0;
        }
        return updated;
      }),
    );
  };

  const submitMut = useMutation({
    mutationFn: () =>
      api.post('/inventory/goods-receipts', goodsReceiptSchema, {
        branchId,
        supplierId,
        note: note || null,
        items,
        complete: completeNow,
      }),
    onSuccess,
    onError: (err) => setError(err),
  });

  return (
    <Modal title="Tạo phiếu nhập kho" onClose={onClose} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (items.length === 0) {
            setError(new Error('Vui lòng thêm ít nhất một sản phẩm vào phiếu nhập'));
            return;
          }
          submitMut.mutate();
        }}
        className="flex flex-col gap-4"
      >
        <ErrorBanner error={error} />

        <div className="grid grid-cols-2 gap-4">
          <Field label="Chi nhánh nhập *">
            {(id) => (
              <select
                id={id}
                required
                disabled={user?.role !== 'OWNER'}
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className={inputClass}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            )}
          </Field>

          <Field label="Nhà cung cấp *">
            {(id) => (
              <select
                id={id}
                required
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className={inputClass}
              >
                <option value="">-- Chọn nhà cung cấp --</option>
                {supplierData?.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>

        <Field label="Ghi chú">
          {(id) => (
            <input
              id={id}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Hàng nhập theo đơn đặt hàng số PO-102"
              className={inputClass}
            />
          )}
        </Field>

        {/* Items table */}
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Danh sách sản phẩm nhập</h3>
          <Button variant="secondary" onClick={addItem}>
            + Thêm sản phẩm
          </Button>
        </div>

        <div className="max-h-60 overflow-y-auto rounded border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Sản phẩm / Biến thể</th>
                <th className="px-3 py-2 w-32 text-right">Số lượng</th>
                <th className="px-3 py-2 w-40 text-right">Đơn giá vốn (VND)</th>
                <th className="px-3 py-2 w-36 text-right">Thành tiền</th>
                <th className="px-3 py-2 w-16 text-center">Xóa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-slate-500">
                    Chưa có sản phẩm nào. Nhấp "+ Thêm sản phẩm" ở trên.
                  </td>
                </tr>
              )}
              {items.map((item, idx) => (
                <tr key={idx}>
                  <td className="px-3 py-2">
                    <select
                      value={item.variantId}
                      onChange={(e) => updateItem(idx, { variantId: e.target.value })}
                      className={`${inputClass} w-full`}
                    >
                      {availableVariants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.sku} - {v.name} ({v.unit})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })}
                      className={`${inputClass} w-full text-right`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      step={500}
                      value={item.unitCost}
                      onChange={(e) => updateItem(idx, { unitCost: Number(e.target.value) })}
                      className={`${inputClass} w-full text-right`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {formatVnd(item.quantity * item.unitCost)} đ
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="text-red-500 hover:text-red-700"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={completeNow}
            onChange={(e) => setCompleteNow(e.target.checked)}
          />
          <strong>Hoàn thành và cập nhật sổ cái tồn kho ngay lập tức</strong>
        </label>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" disabled={submitMut.isPending || items.length === 0}>
            {submitMut.isPending ? 'Đang tạo...' : 'Tạo phiếu nhập'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ReceiptDetailModal({
  receiptId,
  canWrite,
  onClose,
  onCompleted,
}: {
  receiptId: string;
  canWrite: boolean;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const { api } = useAuth();
  const [error, setError] = useState<unknown>(null);

  const { data: receipt, isLoading } = useQuery({
    queryKey: ['receipt-detail', receiptId],
    queryFn: () => api.get(`/inventory/goods-receipts/${receiptId}`, goodsReceiptSchema),
  });

  const completeMut = useMutation({
    mutationFn: () => api.post(`/inventory/goods-receipts/${receiptId}/complete`, goodsReceiptSchema),
    onSuccess: onCompleted,
    onError: (err) => setError(err),
  });

  if (isLoading || !receipt) {
    return (
      <Modal title="Chi tiết phiếu nhập" onClose={onClose}>
        <div className="p-6 text-center text-slate-500">Đang tải chi tiết phiếu...</div>
      </Modal>
    );
  }

  return (
    <Modal title={`Phiếu nhập kho: ${receipt.code}`} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <ErrorBanner error={error} />

        <div className="grid grid-cols-3 gap-3 rounded bg-slate-50 p-3 text-sm">
          <div>
            <span className="text-slate-500">Nhà cung cấp: </span>
            <strong className="text-slate-800">{receipt.supplierName}</strong>
          </div>
          <div>
            <span className="text-slate-500">Chi nhánh nhập: </span>
            <strong className="text-slate-800">{receipt.branchName}</strong>
          </div>
          <div>
            <span className="text-slate-500">Trạng thái: </span>
            <Badge tone={receipt.status === GoodsReceiptStatus.COMPLETED ? 'green' : 'amber'}>
              {receipt.status === GoodsReceiptStatus.COMPLETED ? 'Hoàn thành' : 'Bản nháp'}
            </Badge>
          </div>
          <div>
            <span className="text-slate-500">Người tạo: </span>
            <strong className="text-slate-800">{receipt.createdByName}</strong>
          </div>
          <div>
            <span className="text-slate-500">Ngày tạo: </span>
            <span className="text-slate-700">{formatDateTime(receipt.createdAt)}</span>
          </div>
          <div>
            <span className="text-slate-500">Ghi chú: </span>
            <span className="text-slate-700">{receipt.note || '—'}</span>
          </div>
        </div>

        <div className="overflow-x-auto rounded border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Mã SKU</th>
                <th className="px-3 py-2">Sản phẩm</th>
                <th className="px-3 py-2">Biến thể</th>
                <th className="px-3 py-2 text-right">Số lượng</th>
                <th className="px-3 py-2 text-right">Đơn giá vốn</th>
                <th className="px-3 py-2 text-right">Thành tiền</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {receipt.items.map((i) => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-slate-700">{i.variantSku}</td>
                  <td className="px-3 py-2 font-medium text-slate-800">{i.productName}</td>
                  <td className="px-3 py-2 text-slate-600">{i.variantName}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatVnd(i.quantity)} {i.unit}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{formatVnd(i.unitCost)} đ</td>
                  <td className="px-3 py-2 text-right font-bold text-emerald-700">
                    {formatVnd(i.quantity * i.unitCost)} đ
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 font-bold">
              <tr>
                <td colSpan={3} className="px-3 py-2 text-right">
                  Tổng cộng:
                </td>
                <td className="px-3 py-2 text-right">{formatVnd(receipt.totalQuantity ?? 0)}</td>
                <td></td>
                <td className="px-3 py-2 text-right text-emerald-700">
                  {formatVnd(receipt.totalCost ?? 0)} đ
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
          <Button variant="secondary" onClick={onClose}>
            Đóng
          </Button>
          {canWrite && receipt.status === GoodsReceiptStatus.DRAFT && (
            <Button
              onClick={() => completeMut.mutate()}
              disabled={completeMut.isPending}
            >
              {completeMut.isPending ? 'Đang hoàn thành...' : 'Hoàn thành phiếu & Nhập kho'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
