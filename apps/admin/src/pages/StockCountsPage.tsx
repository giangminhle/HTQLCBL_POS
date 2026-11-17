import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  branchPageSchema,
  productPageSchema,
  stockCountPageSchema,
  stockCountSchema,
  StockCountStatus,
  type Branch,
  type StockCount,
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

export function StockCountsPage() {
  const { api } = useAuth();
  const session = useSession();
  const user = session?.user;
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(user?.branchId ?? '');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [viewingCount, setViewingCount] = useState<StockCount | null>(null);
  const [editingCount, setEditingCount] = useState<StockCount | null>(null);

  const { data: branchData } = useQuery({
    queryKey: ['branches-list'],
    queryFn: () => api.get('/branches', branchPageSchema, { query: { pageSize: 100 } }),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['stock-counts', page, selectedBranchId, statusFilter],
    queryFn: () =>
      api.get('/inventory/stock-counts', stockCountPageSchema, {
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
          <h1 className="text-xl font-bold text-slate-800">Kiểm kê & Điều chỉnh tồn (REQ-INV-03)</h1>
          <p className="text-sm text-slate-500">Đối soát tồn kho sổ sách với số lượng thực tế tại quầy/kho</p>
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
            <option value={StockCountStatus.DRAFT}>Đang kiểm kê (DRAFT)</option>
            <option value={StockCountStatus.COMPLETED}>Đã chốt (COMPLETED)</option>
          </select>

          {canWrite && (
            <Button onClick={() => setCreating(true)}>+ Tạo đợt kiểm kê</Button>
          )}
        </div>
      </div>

      <ErrorBanner error={error} />

      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Mã đợt</th>
              <th className="px-4 py-3">Chi nhánh</th>
              <th className="px-4 py-3">Ghi chú</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Người tạo</th>
              <th className="px-4 py-3">Người chốt</th>
              <th className="px-4 py-3">Ngày tạo</th>
              <th className="px-4 py-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  Đang tải danh sách đợt kiểm kê...
                </td>
              </tr>
            )}
            {!isLoading && data?.items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  Chưa có đợt kiểm kê nào
                </td>
              </tr>
            )}
            {data?.items.map((c) => {
              const isDraft = c.status === StockCountStatus.DRAFT;
              return (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-medium text-slate-800">{c.code}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{c.branchName}</td>
                  <td className="px-4 py-3 text-slate-600">{c.note || '—'}</td>
                  <td className="px-4 py-3">
                    <Badge tone={isDraft ? 'amber' : 'green'}>
                      {isDraft ? 'Đang kiểm đếm' : 'Đã chốt cân kho'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{c.createdByName}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {c.completedByName ? `${c.completedByName} (${formatDateTime(c.completedAt)})` : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(c.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="secondary" onClick={() => setViewingCount(c)}>
                        Chi tiết
                      </Button>
                      {canWrite && isDraft && (
                        <Button variant="primary" onClick={() => setEditingCount(c)}>
                          Nhập số đếm
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

      {data && (
        <Pagination
          page={page}
          pageSize={15}
          total={data.total}
          onPage={(p) => setPage(p)}
        />
      )}

      {creating && (
        <CreateCountModal
          branches={branchData?.items ?? []}
          userBranchId={user?.branchId ?? ''}
          isOwner={user?.role === 'OWNER'}
          onClose={() => setCreating(false)}
          onSuccess={() => {
            setCreating(false);
            void qc.invalidateQueries({ queryKey: ['stock-counts'] });
          }}
        />
      )}

      {editingCount && (
        <CountEntryModal
          countId={editingCount.id}
          onClose={() => setEditingCount(null)}
          onSuccess={() => {
            setEditingCount(null);
            void qc.invalidateQueries({ queryKey: ['stock-counts'] });
            void qc.invalidateQueries({ queryKey: ['balances'] });
          }}
        />
      )}

      {viewingCount && (
        <CountDetailModal
          countId={viewingCount.id}
          onClose={() => setViewingCount(null)}
        />
      )}
    </div>
  );
}

function CreateCountModal({
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
  const [branchId, setBranchId] = useState(userBranchId || branches[0]?.id || '');
  const [note, setNote] = useState('');
  const [selectedVariants, setSelectedVariants] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);

  const { data: productData } = useQuery({
    queryKey: ['active-products-for-count'],
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

  const toggleVariant = (id: string) => {
    setSelectedVariants((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const selectAll = () => {
    setSelectedVariants(availableVariants.map((v) => v.id));
  };

  const clearAll = () => {
    setSelectedVariants([]);
  };

  const submitMut = useMutation({
    mutationFn: () =>
      api.post('/inventory/stock-counts', stockCountSchema, {
        branchId,
        note: note || null,
        items: selectedVariants.map((vId) => ({ variantId: vId })),
      }),
    onSuccess,
    onError: (err) => setError(err),
  });

  return (
    <Modal title="Tạo đợt kiểm kê mới" onClose={onClose} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (selectedVariants.length === 0) {
            setError(new Error('Vui lòng chọn ít nhất một sản phẩm để kiểm kê'));
            return;
          }
          submitMut.mutate();
        }}
        className="flex flex-col gap-4"
      >
        <ErrorBanner error={error} />

        <div className="grid grid-cols-2 gap-4">
          <Field label="Chi nhánh kiểm kê *">
            {(id) => (
              <select
                id={id}
                required
                disabled={!isOwner}
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

          <Field label="Ghi chú đợt kiểm kê">
            {(id) => (
              <input
                id={id}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="VD: Kiểm kê định kỳ cuối tháng"
                className={inputClass}
              />
            )}
          </Field>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 pt-3">
          <span className="text-sm font-semibold text-slate-800">
            Chọn danh sách mặt hàng kiểm đếm ({selectedVariants.length} đã chọn)
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={selectAll}>
              Chọn tất cả
            </Button>
            <Button variant="secondary" onClick={clearAll}>
              Bỏ chọn
            </Button>
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto rounded border border-slate-200 p-2">
          <div className="grid grid-cols-2 gap-2">
            {availableVariants.map((v) => {
              const checked = selectedVariants.includes(v.id);
              return (
                <label
                  key={v.id}
                  className={`flex cursor-pointer items-center gap-2 rounded border p-2 text-xs transition ${
                    checked ? 'border-slate-800 bg-slate-50' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleVariant(v.id)}
                  />
                  <div>
                    <strong className="block text-slate-800">{v.name}</strong>
                    <span className="text-slate-500 font-mono">{v.sku} ({v.unit})</span>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" disabled={submitMut.isPending || selectedVariants.length === 0}>
            {submitMut.isPending ? 'Đang tạo...' : 'Khởi tạo đợt kiểm kê'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CountEntryModal({
  countId,
  onClose,
  onSuccess,
}: {
  countId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { api } = useAuth();
  const [items, setItems] = useState<Array<{ itemId: string; actualQuantity: number }>>([]);
  const [error, setError] = useState<unknown>(null);

  const { data: count, isLoading } = useQuery({
    queryKey: ['count-to-edit', countId],
    queryFn: async () => {
      const c = await api.get(`/inventory/stock-counts/${countId}`, stockCountSchema);
      setItems(
        c.items.map((i) => ({
          itemId: i.id,
          actualQuantity: i.actualQuantity ?? i.systemQuantity,
        })),
      );
      return c;
    },
  });

  const updateActual = (itemId: string, qty: number) => {
    setItems(items.map((i) => (i.itemId === itemId ? { ...i, actualQuantity: qty } : i)));
  };

  const saveMut = useMutation({
    mutationFn: () =>
      api.patch(`/inventory/stock-counts/${countId}`, stockCountSchema, {
        items,
      }),
    onSuccess: () => {
      // after saving draft numbers, prompt complete
    },
    onError: (err) => setError(err),
  });

  const completeMut = useMutation({
    mutationFn: async () => {
      // Save numbers first
      await api.patch(`/inventory/stock-counts/${countId}`, stockCountSchema, { items });
      // Complete & apply adjustments
      return api.post(`/inventory/stock-counts/${countId}/complete`, stockCountSchema);
    },
    onSuccess,
    onError: (err) => setError(err),
  });

  if (isLoading || !count) {
    return (
      <Modal title="Nhập số kiểm đếm" onClose={onClose}>
        <div className="p-6 text-center text-slate-500">Đang tải...</div>
      </Modal>
    );
  }

  return (
    <Modal title={`Nhập số kiểm đếm: ${count.code}`} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <ErrorBanner error={error} />

        <div className="rounded bg-slate-50 p-3 text-sm">
          Nhập số lượng kiểm đếm thực tế của từng sản phẩm. Khi bấm <strong>"Chốt đợt kiểm kê & Cân tồn"</strong>, hệ thống sẽ tự động tạo phiếu điều chỉnh (ADJUSTMENT) tương ứng với độ chênh lệch.
        </div>

        <div className="max-h-72 overflow-y-auto rounded border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="sticky top-0 bg-slate-100 text-left text-xs font-semibold uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2">Sản phẩm</th>
                <th className="px-3 py-2 text-right">Tồn sổ sách</th>
                <th className="px-3 py-2 w-44 text-right">Số đếm thực tế</th>
                <th className="px-3 py-2 text-right">Chênh lệch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {count.items.map((item) => {
                const actual = items.find((x) => x.itemId === item.id)?.actualQuantity ?? item.systemQuantity;
                const diff = actual - item.systemQuantity;
                return (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-800">{item.productName}</div>
                      <div className="text-xs text-slate-500">{item.variantSku} - {item.variantName}</div>
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-slate-600">
                      {formatVnd(item.systemQuantity)} {item.unit}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        value={actual}
                        onChange={(e) => updateActual(item.id, Number(e.target.value))}
                        className={`${inputClass} w-full text-right font-bold`}
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-bold">
                      {diff === 0 ? (
                        <span className="text-slate-500">Khớp (0)</span>
                      ) : diff > 0 ? (
                        <span className="text-emerald-600">Thừa +{diff}</span>
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

        <div className="flex items-center justify-between border-t border-slate-200 pt-3">
          <Button
            variant="secondary"
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
          >
            {saveMut.isPending ? 'Đang lưu nháp...' : 'Lưu tạm thời'}
          </Button>

          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Đóng
            </Button>
            <Button
              variant="primary"
              onClick={() => completeMut.mutate()}
              disabled={completeMut.isPending}
            >
              {completeMut.isPending ? 'Đang cân tồn...' : 'Chốt đợt kiểm kê & Cân tồn'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function CountDetailModal({
  countId,
  onClose,
}: {
  countId: string;
  onClose: () => void;
}) {
  const { api } = useAuth();
  const { data: count, isLoading } = useQuery({
    queryKey: ['count-detail', countId],
    queryFn: () => api.get(`/inventory/stock-counts/${countId}`, stockCountSchema),
  });

  if (isLoading || !count) {
    return (
      <Modal title="Chi tiết đợt kiểm kê" onClose={onClose}>
        <div className="p-6 text-center text-slate-500">Đang tải...</div>
      </Modal>
    );
  }

  return (
    <Modal title={`Đợt kiểm kê: ${count.code}`} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 rounded bg-slate-50 p-3 text-sm">
          <div>
            <span className="text-slate-500">Chi nhánh: </span>
            <strong className="text-slate-800">{count.branchName}</strong>
          </div>
          <div>
            <span className="text-slate-500">Trạng thái: </span>
            <Badge tone={count.status === StockCountStatus.COMPLETED ? 'green' : 'amber'}>
              {count.status === StockCountStatus.COMPLETED ? 'Đã chốt cân tồn' : 'Đang kiểm đếm'}
            </Badge>
          </div>
          <div>
            <span className="text-slate-500">Người tạo: </span>
            <span className="text-slate-700">{count.createdByName}</span>
          </div>
          <div>
            <span className="text-slate-500">Người chốt: </span>
            <span className="text-slate-700">
              {count.completedByName ? `${count.completedByName} (${formatDateTime(count.completedAt)})` : '—'}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto rounded border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Mã SKU</th>
                <th className="px-3 py-2">Sản phẩm</th>
                <th className="px-3 py-2">Biến thể</th>
                <th className="px-3 py-2 text-right">Tồn hệ thống</th>
                <th className="px-3 py-2 text-right">Thực đếm</th>
                <th className="px-3 py-2 text-right">Chênh lệch điều chỉnh</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {count.items.map((i) => {
                const diff = i.actualQuantity !== null ? i.actualQuantity - i.systemQuantity : null;
                return (
                  <tr key={i.id}>
                    <td className="px-3 py-2 font-mono text-slate-700">{i.variantSku}</td>
                    <td className="px-3 py-2 font-medium text-slate-800">{i.productName}</td>
                    <td className="px-3 py-2 text-slate-600">{i.variantName}</td>
                    <td className="px-3 py-2 text-right">{formatVnd(i.systemQuantity)} {i.unit}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {i.actualQuantity !== null ? `${formatVnd(i.actualQuantity)} ${i.unit}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right font-bold">
                      {diff === null ? (
                        '—'
                      ) : diff === 0 ? (
                        <span className="text-slate-500">0</span>
                      ) : diff > 0 ? (
                        <span className="text-emerald-600">+{diff}</span>
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
