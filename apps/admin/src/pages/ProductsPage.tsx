import { useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  categoryListSchema,
  productPageSchema,
  Role,
  type PriceWarning,
  type Product,
} from '@retailchain/shared';
import { useSession } from '../auth/AuthContext';
import { ProductForm } from '../components/ProductForm';
import { Badge, Button, ErrorBanner, inputClass, Pagination } from '../components/ui';
import { api } from '../lib/api';
import { categoryLabel, formatVnd } from '../lib/format';

export function ProductsPage() {
  const role = useSession()!.user.role;
  const canEdit = role === Role.OWNER;
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ q: '', categoryId: '', isActive: '', page: 1 });
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [warnings, setWarnings] = useState<PriceWarning[]>([]);

  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories', categoryListSchema),
  });
  const list = useQuery({
    queryKey: ['products', filters],
    queryFn: () =>
      api.get('/products', productPageSchema, {
        query: {
          q: filters.q,
          categoryId: filters.categoryId,
          isActive: filters.isActive,
          page: filters.page,
          pageSize: 20,
        },
      }),
    placeholderData: keepPreviousData,
  });
  const showCost = list.data?.items.some((p) => p.costPrice !== undefined) ?? false;
  const cats = categories.data ?? [];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Sản phẩm</h1>
        {canEdit && <Button onClick={() => setEditing('new')}>+ Thêm sản phẩm</Button>}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="Tìm sản phẩm"
          placeholder="Tên (không cần dấu), SKU hoặc quét mã vạch…"
          className={`${inputClass} w-80`}
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value, page: 1 })}
        />
        <select
          aria-label="Lọc danh mục"
          className={inputClass}
          value={filters.categoryId}
          onChange={(e) => setFilters({ ...filters, categoryId: e.target.value, page: 1 })}
        >
          <option value="">Mọi danh mục</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {categoryLabel(cats, c.id)}
            </option>
          ))}
        </select>
        <select
          aria-label="Lọc trạng thái"
          className={inputClass}
          value={filters.isActive}
          onChange={(e) => setFilters({ ...filters, isActive: e.target.value, page: 1 })}
        >
          <option value="">Mọi trạng thái</option>
          <option value="true">Đang kinh doanh</option>
          <option value="false">Ngưng</option>
        </select>
      </div>
      {warnings.length > 0 && (
        <div
          role="status"
          className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          <p className="font-medium">Đã lưu, có cảnh báo:</p>
          <ul className="list-disc pl-5">
            {warnings.map((w) => (
              <li key={`${w.sku}-${w.price}`}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}
      <ErrorBanner error={list.error} />
      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">Tên</th>
              <th className="px-3 py-2">Danh mục</th>
              <th className="px-3 py-2">ĐVT</th>
              <th className="px-3 py-2 text-right">Giá bán</th>
              {showCost && <th className="px-3 py-2 text-right">Giá vốn</th>}
              <th className="px-3 py-2">Biến thể</th>
              <th className="px-3 py-2">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {list.data?.items.map((p) => (
              <tr
                key={p.id}
                className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                onClick={() => setEditing(p)}
              >
                <td className="px-3 py-2 font-mono">{p.sku}</td>
                <td className="px-3 py-2">{p.name}</td>
                <td className="px-3 py-2 text-slate-600">{categoryLabel(cats, p.categoryId)}</td>
                <td className="px-3 py-2">{p.unit}</td>
                <td className="px-3 py-2 text-right">{formatVnd(p.defaultPrice)}</td>
                {showCost && (
                  <td className="px-3 py-2 text-right text-slate-600">{formatVnd(p.costPrice)}</td>
                )}
                <td className="px-3 py-2">{p.variants.filter((v) => v.isActive).length}</td>
                <td className="px-3 py-2">
                  <Badge tone={p.isActive ? 'green' : 'gray'}>{p.isActive ? 'Đang bán' : 'Ngưng'}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.data && <Pagination {...list.data} onPage={(page) => setFilters({ ...filters, page })} />}
      {editing && (
        <ProductForm
          product={editing === 'new' ? null : editing}
          categories={cats}
          canEdit={canEdit}
          onClose={() => setEditing(null)}
          onSaved={(_p, w) => {
            setEditing(null);
            setWarnings(w);
            void qc.invalidateQueries({ queryKey: ['products'] });
          }}
        />
      )}
    </section>
  );
}
