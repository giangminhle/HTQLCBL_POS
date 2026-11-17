import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  branchPageSchema,
  productPageSchema,
  stockTransferPageSchema,
  stockTransferSchema,
  StockTransferStatus,
  type Branch,
  type StockTransfer,
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

const STATUS_CONFIG: Record<StockTransferStatus, { label: string; tone: 'gray' | 'amber' | 'green' }> = {
  [StockTransferStatus.DRAFT]: { label: 'Bản nháp', tone: 'gray' },
  [StockTransferStatus.SENT]: { label: 'Đang chuyển (SENT)', tone: 'amber' },
  [StockTransferStatus.RECEIVED]: { label: 'Đã nhận đủ/chốt (RECEIVED)', tone: 'green' },
};

export function StockTransfersPage() {
  const { api } = useAuth();
  const session = useSession();
  const user = session?.user;
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(user?.branchId ?? '');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [viewingTransfer, setViewingTransfer] = useState<StockTransfer | null>(null);
  const [receivingTransfer, setReceivingTransfer] = useState<StockTransfer | null>(null);

  const { data: branchData } = useQuery({
    queryKey: ['branches-list'],
    queryFn: () => api.get('/branches', branchPageSchema, { query: { pageSize: 100 } }),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['stock-transfers', page, selectedBranchId, statusFilter],
    queryFn: () =>
      api.get('/inventory/stock-transfers', stockTransferPageSchema, {
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

  const sendMut = useMutation({
    mutationFn: (id: string) => api.post(`/inventory/stock-transfers/${id}/send`, stockTransferSchema),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['stock-transfers'] });
      void qc.invalidateQueries({ queryKey: ['balances'] });
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Chuyển kho (REQ-INV-02)</h1>
          <p className="text-sm text-slate-500">
            Điều phối và luân chuyển hàng hóa giữa các kho và chi nhánh
          </p>
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
            <option value={StockTransferStatus.DRAFT}>Bản nháp</option>
            <option value={StockTransferStatus.SENT}>Đang chuyển</option>
            <option value={StockTransferStatus.RECEIVED}>Đã nhận hàng</option>
          </select>

          {canWrite && <Button onClick={() => setCreating(true)}>+ Chuyển kho</Button>}
        </div>
      </div>

      <ErrorBanner error={error || sendMut.error} />

      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Mã phiếu</th>
              <th className="px-4 py-3">Chi nhánh gửi</th>
              <th className="px-4 py-3">Chi nhánh nhận</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Người gửi</th>
              <th className="px-4 py-3">Người nhận</th>
              <th className="px-4 py-3">Ngày tạo</th>
              <th className="px-4 py-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  Đang tải phiếu chuyển kho...
                </td>
              </tr>
            )}
            {!isLoading && data?.items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  Chưa có phiếu chuyển kho nào
                </td>
              </tr>
            )}
            {data?.items.map((t) => {
              const conf = STATUS_CONFIG[t.status] ?? { label: t.status, tone: 'gray' };
              const isSender = user?.role === 'OWNER' || user?.branchId === t.fromBranchId;
              const isReceiver = user?.role === 'OWNER' || user?.branchId === t.toBranchId;

              return (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-medium text-slate-800">{t.code}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{t.fromBranchName}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{t.toBranchName}</td>
                  <td className="px-4 py-3">
                    <Badge tone={conf.tone}>{conf.label}</Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {t.sentByName ? `${t.sentByName} (${formatDateTime(t.sentAt)})` : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {t.receivedByName ? `${t.receivedByName} (${formatDateTime(t.receivedAt)})` : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(t.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="secondary" onClick={() => setViewingTransfer(t)}>
                        Chi tiết
                      </Button>
                      {canWrite && t.status === StockTransferStatus.DRAFT && isSender && (
                        <Button onClick={() => sendMut.mutate(t.id)} disabled={sendMut.isPending}>
                          Gửi hàng
                        </Button>
                      )}
                      {canWrite && t.status === StockTransferStatus.SENT && isReceiver && (
                        <Button variant="primary" onClick={() => setReceivingTransfer(t)}>
                          Nhận hàng
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data && <Pagination page={page} pageSize={15} total={data.total} onPage={(p) => setPage(p)} />}

      {creating && (
        <CreateTransferModal
          branches={branchData?.items ?? []}
          userBranchId={user?.branchId ?? ''}
          isOwner={user?.role === 'OWNER'}
          onClose={() => setCreating(false)}
          onSuccess={() => {
            setCreating(false);
            void qc.invalidateQueries({ queryKey: ['stock-transfers'] });
            void qc.invalidateQueries({ queryKey: ['balances'] });
          }}
        />
      )}

      {receivingTransfer && (
        <ReceiveTransferModal
          transferId={receivingTransfer.id}
          onClose={() => setReceivingTransfer(null)}
          onSuccess={() => {
            setReceivingTransfer(null);
            void qc.invalidateQueries({ queryKey: ['stock-transfers'] });
            void qc.invalidateQueries({ queryKey: ['balances'] });
          }}
        />
      )}

      {viewingTransfer && (
        <TransferDetailModal transferId={viewingTransfer.id} onClose={() => setViewingTransfer(null)} />
      )}
    </div>
  );
}

function CreateTransferModal({
  branches,
  userBranchId,
  isOwner,
  onClose,
  onSuccess,
}: {
  branches: Branch[];
  userBranchId: string;
  isOwner: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { api } = useAuth();
  const [fromBranchId, setFromBranchId] = useState(userBranchId || branches[0]?.id || '');
  const [toBranchId, setToBranchId] = useState(
    branches.find((b) => b.id !== (userBranchId || branches[0]?.id))?.id || '',
  );
  const [note, setNote] = useState('');
  const [items, setItems] = useState<Array<{ variantId: string; sentQuantity: number }>>([]);
  const [error, setError] = useState<unknown>(null);

  const { data: productData } = useQuery({
    queryKey: ['active-products-for-transfer'],
    queryFn: () => api.get('/products', productPageSchema, { query: { pageSize: 100, isActive: 'true' } }),
  });

  const availableVariants = (productData?.items ?? []).flatMap((p) =>
    p.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      name: `${p.name} - ${v.name}`,
      unit: p.unit,
    })),
  );

  const addItem = () => {
    if (availableVariants.length > 0) {
      setItems([...items, { variantId: availableVariants[0]!.id, sentQuantity: 1 }]);
    }
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, patch: Partial<{ variantId: string; sentQuantity: number }>) => {
    setItems(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const submitMut = useMutation({
    mutationFn: () =>
      api.post('/inventory/stock-transfers', stockTransferSchema, {
        fromBranchId,
        toBranchId,
        note: note || null,
        items,
      }),
    onSuccess,
    onError: (err) => setError(err),
  });

  return (
    <Modal title="Tạo phiếu chuyển kho" onClose={onClose} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (fromBranchId === toBranchId) {
            setError(new Error('Chi nhánh gửi và chi nhánh nhận không được trùng nhau'));
            return;
          }
          if (items.length === 0) {
            setError(new Error('Vui lòng thêm ít nhất một sản phẩm'));
            return;
          }
          submitMut.mutate();
        }}
        className="flex flex-col gap-4"
      >
        <ErrorBanner error={error} />

        <div className="grid grid-cols-2 gap-4">
          <Field label="Chi nhánh gửi *">
            {(id) => (
              <select
                id={id}
                required
                disabled={!isOwner}
                value={fromBranchId}
                onChange={(e) => setFromBranchId(e.target.value)}
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

          <Field label="Chi nhánh nhận *">
            {(id) => (
              <select
                id={id}
                required
                value={toBranchId}
                onChange={(e) => setToBranchId(e.target.value)}
                className={inputClass}
              >
                {branches
                  .filter((b) => b.id !== fromBranchId)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
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
              placeholder="VD: Điều chuyển theo yêu cầu chi nhánh"
              className={inputClass}
            />
          )}
        </Field>

        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Sản phẩm chuyển</h3>
          <Button variant="secondary" onClick={addItem}>
            + Thêm dòng
          </Button>
        </div>

        <div className="max-h-60 overflow-y-auto rounded border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Sản phẩm / Biến thể</th>
                <th className="px-3 py-2 w-36 text-right">Số lượng chuyển</th>
                <th className="px-3 py-2 w-16 text-center">Xóa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {items.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-center text-slate-500">
                    Chưa có sản phẩm nào.
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
                      value={item.sentQuantity}
                      onChange={(e) => updateItem(idx, { sentQuantity: Number(e.target.value) })}
                      className={`${inputClass} w-full text-right`}
                    />
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

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" disabled={submitMut.isPending || items.length === 0}>
            {submitMut.isPending ? 'Đang tạo...' : 'Tạo phiếu chuyển'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ReceiveTransferModal({
  transferId,
  onClose,
  onSuccess,
}: {
  transferId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { api } = useAuth();
  const [items, setItems] = useState<Array<{ itemId: string; receivedQuantity: number }>>([]);
  const [error, setError] = useState<unknown>(null);

  const { data: transfer, isLoading } = useQuery({
    queryKey: ['transfer-to-receive', transferId],
    queryFn: async () => {
      const t = await api.get(`/inventory/stock-transfers/${transferId}`, stockTransferSchema);
      setItems(t.items.map((i) => ({ itemId: i.id, receivedQuantity: i.sentQuantity })));
      return t;
    },
  });

  const updateReceived = (itemId: string, qty: number) => {
    setItems(items.map((i) => (i.itemId === itemId ? { ...i, receivedQuantity: qty } : i)));
  };

  const receiveMut = useMutation({
    mutationFn: () =>
      api.post(`/inventory/stock-transfers/${transferId}/receive`, stockTransferSchema, {
        items,
      }),
    onSuccess,
    onError: (err) => setError(err),
  });

  if (isLoading || !transfer) {
    return (
      <Modal title="Nhận hàng chuyển kho" onClose={onClose}>
        <div className="p-6 text-center text-slate-500">Đang tải...</div>
      </Modal>
    );
  }

  return (
    <Modal title={`Xác nhận nhận hàng: ${transfer.code}`} onClose={onClose} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          receiveMut.mutate();
        }}
        className="flex flex-col gap-4"
      >
        <ErrorBanner error={error} />
        <div className="rounded bg-amber-50 p-3 text-sm text-amber-800">
          Vui lòng kiểm đếm số lượng thực nhận. Nếu nhận thiếu so với số gửi, hệ thống sẽ ghi nhận chênh lệch.
        </div>

        <div className="overflow-x-auto rounded border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Sản phẩm</th>
                <th className="px-3 py-2 text-right">Số lượng gửi</th>
                <th className="px-3 py-2 w-40 text-right">Số lượng thực nhận</th>
                <th className="px-3 py-2 text-right">Chênh lệch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {transfer.items.map((item) => {
                const cur = items.find((x) => x.itemId === item.id)?.receivedQuantity ?? item.sentQuantity;
                const diff = cur - item.sentQuantity;
                return (
                  <tr key={item.id}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{item.productName}</div>
                      <div className="text-xs text-slate-500">
                        {item.variantSku} - {item.variantName}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {formatVnd(item.sentQuantity)} {item.unit}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={item.sentQuantity}
                        value={cur}
                        onChange={(e) => updateReceived(item.id, Number(e.target.value))}
                        className={`${inputClass} w-full text-right`}
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-bold">
                      {diff === 0 ? (
                        <span className="text-emerald-600">Đủ (0)</span>
                      ) : (
                        <span className="text-red-600">Thiếu {diff}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" disabled={receiveMut.isPending}>
            {receiveMut.isPending ? 'Đang xử lý...' : 'Xác nhận nhập kho'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TransferDetailModal({ transferId, onClose }: { transferId: string; onClose: () => void }) {
  const { api } = useAuth();
  const { data: transfer, isLoading } = useQuery({
    queryKey: ['transfer-detail', transferId],
    queryFn: () => api.get(`/inventory/stock-transfers/${transferId}`, stockTransferSchema),
  });

  if (isLoading || !transfer) {
    return (
      <Modal title="Chi tiết phiếu chuyển" onClose={onClose}>
        <div className="p-6 text-center text-slate-500">Đang tải...</div>
      </Modal>
    );
  }

  return (
    <Modal title={`Phiếu chuyển kho: ${transfer.code}`} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 rounded bg-slate-50 p-3 text-sm">
          <div>
            <span className="text-slate-500">Chi nhánh gửi: </span>
            <strong className="text-slate-800">{transfer.fromBranchName}</strong>
          </div>
          <div>
            <span className="text-slate-500">Chi nhánh nhận: </span>
            <strong className="text-slate-800">{transfer.toBranchName}</strong>
          </div>
          <div>
            <span className="text-slate-500">Trạng thái: </span>
            <Badge tone={STATUS_CONFIG[transfer.status]?.tone ?? 'gray'}>
              {STATUS_CONFIG[transfer.status]?.label ?? transfer.status}
            </Badge>
          </div>
          <div>
            <span className="text-slate-500">Người tạo: </span>
            <span className="text-slate-700">{transfer.createdByName}</span>
          </div>
          <div>
            <span className="text-slate-500">Gửi lúc: </span>
            <span className="text-slate-700">{formatDateTime(transfer.sentAt)}</span>
          </div>
          <div>
            <span className="text-slate-500">Nhận lúc: </span>
            <span className="text-slate-700">{formatDateTime(transfer.receivedAt)}</span>
          </div>
        </div>

        <div className="overflow-x-auto rounded border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Mã SKU</th>
                <th className="px-3 py-2">Sản phẩm</th>
                <th className="px-3 py-2">Biến thể</th>
                <th className="px-3 py-2 text-right">SL gửi</th>
                <th className="px-3 py-2 text-right">SL nhận</th>
                <th className="px-3 py-2 text-right">Chênh lệch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {transfer.items.map((i) => {
                const diff = i.receivedQuantity !== null ? i.receivedQuantity - i.sentQuantity : null;
                return (
                  <tr key={i.id}>
                    <td className="px-3 py-2 font-mono text-slate-700">{i.variantSku}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">{i.productName}</td>
                    <td className="px-3 py-2 text-slate-600">{i.variantName}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {formatVnd(i.sentQuantity)} {i.unit}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {i.receivedQuantity !== null ? `${formatVnd(i.receivedQuantity)} ${i.unit}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-bold">
                      {diff === null ? (
                        '—'
                      ) : diff === 0 ? (
                        <span className="text-emerald-600">0</span>
                      ) : (
                        <span className="text-red-600">{diff}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end border-t border-slate-200 pt-3">
          <Button variant="secondary" onClick={onClose}>
            Đóng
          </Button>
        </div>
      </div>
    </Modal>
  );
}
