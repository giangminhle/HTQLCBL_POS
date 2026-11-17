import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  branchPageSchema,
  lowStockPageSchema,
  stockBalancePageSchema,
  stockMovementPageSchema,
  StockMovementType,
  type StockBalanceItem,
} from '@retailchain/shared';
import { useAuth, useSession } from '../auth/AuthContext';
import { Badge, Button, ErrorBanner, Modal, Pagination, formatDateTime, inputClass } from '../components/ui';
import { formatVnd } from '../lib/format';

const MOVEMENT_LABELS: Record<
  StockMovementType,
  { label: string; tone: 'green' | 'red' | 'amber' | 'gray' }
> = {
  [StockMovementType.IMPORT]: { label: 'Nhập hàng', tone: 'green' },
  [StockMovementType.SALE]: { label: 'Bán hàng', tone: 'red' },
  [StockMovementType.RETURN]: { label: 'Trả hàng', tone: 'green' },
  [StockMovementType.TRANSFER_OUT]: { label: 'Chuyển đi', tone: 'red' },
  [StockMovementType.TRANSFER_IN]: { label: 'Chuyển đến', tone: 'green' },
  [StockMovementType.ADJUSTMENT]: { label: 'Kiểm kê', tone: 'amber' },
};

export function BalancesPage() {
  const { api } = useAuth();
  const session = useSession();
  const user = session?.user;
  const [activeTab, setActiveTab] = useState<'balances' | 'lowStock'>('balances');
  const [selectedBranchId, setSelectedBranchId] = useState<string>(user?.branchId ?? '');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [stockCardTarget, setStockCardTarget] = useState<StockBalanceItem | null>(null);

  // Load branches for filter
  const { data: branchData } = useQuery({
    queryKey: ['branches-list'],
    queryFn: () => api.get('/branches', branchPageSchema, { query: { pageSize: 100 } }),
  });

  // Load balances
  const {
    data: balanceData,
    isLoading: balancesLoading,
    error: balanceError,
  } = useQuery({
    queryKey: ['balances', selectedBranchId, search, page],
    queryFn: () =>
      api.get('/inventory/balances', stockBalancePageSchema, {
        query: {
          page,
          pageSize: 15,
          branchId: selectedBranchId || undefined,
          q: search || undefined,
        },
      }),
    enabled: activeTab === 'balances',
  });

  // Load low stock alerts
  const {
    data: lowStockData,
    isLoading: lowStockLoading,
    error: lowStockError,
  } = useQuery({
    queryKey: ['low-stock', selectedBranchId, page],
    queryFn: () =>
      api.get('/inventory/low-stock', lowStockPageSchema, {
        query: {
          page,
          pageSize: 15,
          branchId: selectedBranchId || undefined,
        },
      }),
    enabled: activeTab === 'lowStock',
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Tồn kho & Thẻ kho</h1>
          <p className="text-sm text-slate-500">
            Tra cứu tồn kho thực tế, lịch sử xuất nhập và cảnh báo tồn tối thiểu
          </p>
        </div>

        <div className="flex items-center gap-2">
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
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          )}

          {activeTab === 'balances' && (
            <input
              type="search"
              placeholder="Tìm theo SKU, tên sản phẩm..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className={`${inputClass} w-64`}
            />
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          type="button"
          onClick={() => {
            setActiveTab('balances');
            setPage(1);
          }}
          className={`border-b-2 px-4 py-2 text-sm font-medium ${
            activeTab === 'balances'
              ? 'border-slate-800 text-slate-800'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Tồn kho hiện tại
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('lowStock');
            setPage(1);
          }}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium ${
            activeTab === 'lowStock'
              ? 'border-red-600 text-red-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span>Cảnh báo tồn tối thiểu</span>
          {lowStockData && lowStockData.total > 0 && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
              {lowStockData.total}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'balances' ? (
        <>
          <ErrorBanner error={balanceError} />
          <div className="overflow-x-auto rounded border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Chi nhánh</th>
                  <th className="px-4 py-3">Mã SKU</th>
                  <th className="px-4 py-3">Sản phẩm</th>
                  <th className="px-4 py-3">Biến thể</th>
                  <th className="px-4 py-3">ĐVT</th>
                  <th className="px-4 py-3 text-right">Số lượng tồn</th>
                  <th className="px-4 py-3 text-right">Tồn tối thiểu</th>
                  <th className="px-4 py-3">Cập nhật lúc</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {balancesLoading && (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
                      Đang tải số dư tồn kho...
                    </td>
                  </tr>
                )}
                {!balancesLoading && balanceData?.items.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
                      Không có bản ghi tồn kho nào
                    </td>
                  </tr>
                )}
                {balanceData?.items.map((b) => (
                  <tr key={`${b.branchId}:${b.variantId}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{b.branchName}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">{b.variantSku}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{b.productName}</td>
                    <td className="px-4 py-3 text-slate-600">{b.variantName}</td>
                    <td className="px-4 py-3 text-slate-600">{b.unit}</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">
                      <span className={b.quantity <= b.minStock ? 'text-red-600' : 'text-emerald-700'}>
                        {formatVnd(b.quantity)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">{formatVnd(b.minStock)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(b.updatedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="secondary" onClick={() => setStockCardTarget(b)}>
                        Thẻ kho
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {balanceData && (
            <Pagination page={page} pageSize={15} total={balanceData.total} onPage={(p) => setPage(p)} />
          )}
        </>
      ) : (
        <>
          <ErrorBanner error={lowStockError} />
          <div className="overflow-x-auto rounded border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-red-50 text-left text-xs font-semibold uppercase text-red-700">
                <tr>
                  <th className="px-4 py-3">Chi nhánh</th>
                  <th className="px-4 py-3">Mã SKU</th>
                  <th className="px-4 py-3">Sản phẩm</th>
                  <th className="px-4 py-3">Biến thể</th>
                  <th className="px-4 py-3">ĐVT</th>
                  <th className="px-4 py-3 text-right">Tồn hiện tại</th>
                  <th className="px-4 py-3 text-right">Tồn tối thiểu</th>
                  <th className="px-4 py-3 text-right">Thiếu hụt</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {lowStockLoading && (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
                      Đang kiểm tra cảnh báo tồn kho...
                    </td>
                  </tr>
                )}
                {!lowStockLoading && lowStockData?.items.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-emerald-600 font-medium">
                      ✓ Tất cả các mặt hàng đều đạt hoặc vượt định mức tồn tối thiểu
                    </td>
                  </tr>
                )}
                {lowStockData?.items.map((item) => (
                  <tr key={`${item.branchId}:${item.variantId}`} className="hover:bg-red-50/40">
                    <td className="px-4 py-3 font-medium text-slate-800">{item.branchName}</td>
                    <td className="px-4 py-3 font-mono text-slate-700">{item.variantSku}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{item.productName}</td>
                    <td className="px-4 py-3 text-slate-600">{item.variantName}</td>
                    <td className="px-4 py-3 text-slate-600">{item.unit}</td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">
                      {formatVnd(item.quantity)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">{formatVnd(item.minStock)}</td>
                    <td className="px-4 py-3 text-right font-bold text-amber-600">
                      -{formatVnd(item.deficit)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setStockCardTarget({
                            branchId: item.branchId,
                            branchName: item.branchName,
                            variantId: item.variantId,
                            variantSku: item.variantSku,
                            variantName: item.variantName,
                            productName: item.productName,
                            unit: item.unit,
                            quantity: item.quantity,
                            minStock: item.minStock,
                            updatedAt: new Date().toISOString(),
                          })
                        }
                      >
                        Thẻ kho
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lowStockData && (
            <Pagination page={page} pageSize={15} total={lowStockData.total} onPage={(p) => setPage(p)} />
          )}
        </>
      )}

      {/* Stock Card Modal */}
      {stockCardTarget && (
        <StockCardModal target={stockCardTarget} onClose={() => setStockCardTarget(null)} />
      )}
    </div>
  );
}

function StockCardModal({ target, onClose }: { target: StockBalanceItem; onClose: () => void }) {
  const { api } = useAuth();
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useQuery({
    queryKey: ['movements', target.branchId, target.variantId, page],
    queryFn: () =>
      api.get('/inventory/movements', stockMovementPageSchema, {
        query: {
          branchId: target.branchId,
          variantId: target.variantId,
          page,
          pageSize: 10,
        },
      }),
  });

  return (
    <Modal title={`Thẻ kho: ${target.productName} (${target.variantSku})`} onClose={onClose} wide>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-slate-50 p-3 text-sm">
          <div>
            <span className="text-slate-500">Chi nhánh: </span>
            <strong className="text-slate-800">{target.branchName}</strong>
          </div>
          <div>
            <span className="text-slate-500">Biến thể: </span>
            <strong className="text-slate-800">{target.variantName}</strong>
          </div>
          <div>
            <span className="text-slate-500">Tồn hiện tại: </span>
            <strong className="text-emerald-700">
              {formatVnd(target.quantity)} {target.unit}
            </strong>
          </div>
        </div>

        <ErrorBanner error={error} />

        <div className="max-h-96 overflow-y-auto rounded border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-xs">
            <thead className="sticky top-0 bg-slate-100 text-left font-semibold uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2">Thời gian</th>
                <th className="px-3 py-2">Loại biến động</th>
                <th className="px-3 py-2 text-right">Số lượng</th>
                <th className="px-3 py-2">Chứng từ</th>
                <th className="px-3 py-2">Người thực hiện</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-slate-500">
                    Đang tải lịch sử thẻ kho...
                  </td>
                </tr>
              )}
              {!isLoading && data?.items.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-slate-500">
                    Chưa có phát sinh biến động kho nào
                  </td>
                </tr>
              )}
              {data?.items.map((m) => {
                const conf = MOVEMENT_LABELS[m.type] ?? { label: m.type, tone: 'gray' };
                const isPositive = m.quantity > 0;
                return (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-slate-600">{formatDateTime(m.createdAt)}</td>
                    <td className="px-3 py-2">
                      <Badge tone={conf.tone}>{conf.label}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold">
                      <span className={isPositive ? 'text-emerald-600' : 'text-red-600'}>
                        {isPositive ? `+${formatVnd(m.quantity)}` : formatVnd(m.quantity)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600 font-mono text-[11px]">
                      {m.refType ? `${m.refType} #${m.refId?.slice(0, 8)}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{m.createdByName || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {data && <Pagination page={page} pageSize={10} total={data.total} onPage={(p) => setPage(p)} />}

        <div className="mt-2 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Đóng
          </Button>
        </div>
      </div>
    </Modal>
  );
}
