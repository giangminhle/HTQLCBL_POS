import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { productPageSchema, type Product } from '@retailchain/shared';
import { useAuth } from '../auth';
import { formatVnd } from '../lib/format';

export interface SelectedVariant {
  variantId: string;
  variantName: string;
  productName: string;
  sku: string;
  unit: string;
  price: number;
}

export function ProductSearchModal({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (variant: SelectedVariant) => void;
}) {
  const { api } = useAuth();
  const [q, setQ] = useState('');

  // Handle Esc key to close
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

  const { data, isLoading } = useQuery({
    queryKey: ['pos-search-products', q],
    queryFn: () =>
      api.get('/products', productPageSchema, {
        query: { q, isActive: 'true', pageSize: 20 },
      }),
  });

  const variants: SelectedVariant[] = (data?.items ?? []).flatMap((p: Product) =>
    p.variants.map((v) => ({
      variantId: v.id,
      variantName: v.name,
      productName: p.name,
      sku: v.sku,
      unit: p.unit,
      price: v.price ?? p.defaultPrice,
    })),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">Tìm kiếm sản phẩm (F2)</h2>
          <span className="text-xs text-gray-400">Nhấn Esc để đóng</span>
        </div>

        <div className="mt-4">
          <input
            type="text"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo tên sản phẩm (không dấu), mã SKU, mã vạch..."
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-base text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div className="mt-4 flex-1 overflow-y-auto divide-y divide-gray-100">
          {isLoading ? (
            <p className="p-8 text-center text-sm text-gray-500">Đang tìm kiếm...</p>
          ) : variants.length === 0 ? (
            <p className="p-8 text-center text-sm text-gray-500">Không tìm thấy sản phẩm nào</p>
          ) : (
            variants.map((v) => (
              <button
                key={v.variantId}
                type="button"
                onClick={() => {
                  onSelect(v);
                  onClose();
                }}
                className="w-full flex items-center justify-between p-3.5 text-left hover:bg-blue-50 transition rounded-lg"
              >
                <div>
                  <p className="font-semibold text-gray-900">
                    {v.productName} <span className="text-sm font-normal text-gray-600">({v.variantName})</span>
                  </p>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">
                    SKU: {v.sku} · Đơn vị: {v.unit}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-base font-bold text-blue-700">{formatVnd(v.price)}</span>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-gray-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
