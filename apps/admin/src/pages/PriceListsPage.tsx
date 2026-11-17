import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiRequestError,
  branchPageSchema,
  effectivePriceResponseSchema,
  ErrorCode,
  priceListItemsResponseSchema,
  priceListPageSchema,
  priceListSchema,
  productPageSchema,
  Role,
  type PriceList,
  type PriceWarning,
} from '@retailchain/shared';
import { useSession } from '../auth/AuthContext';
import { Badge, Button, ErrorBanner, Field, formatDateTime, inputClass, Modal } from '../components/ui';
import { api } from '../lib/api';
import {
  formatVnd,
  fromDateInput,
  parseMoney,
  PRICE_LIST_STATUS_LABELS,
  priceListStatus,
  toDateInput,
} from '../lib/format';

const STATUS_TONE = { active: 'green', upcoming: 'amber', expired: 'gray', inactive: 'gray' } as const;
const SOURCE_LABEL = {
  BRANCH_PRICE_LIST: 'bảng giá chi nhánh',
  VARIANT: 'giá biến thể',
  PRODUCT_DEFAULT: 'giá mặc định sản phẩm',
};

/** 409 PRICE_LIST_OVERLAP → readable message naming the conflicting lists. */
export function overlapMessage(err: unknown): string | null {
  if (!(err instanceof ApiRequestError) || err.code !== ErrorCode.PRICE_LIST_OVERLAP) return null;
  const conflicts =
    (err.details as { conflicts?: { name: string; effectiveFrom: string; effectiveTo: string | null }[] })
      ?.conflicts ?? [];
  return `Bị chồng thời gian với: ${conflicts
    .map(
      (c) =>
        `"${c.name}" (${formatDateTime(c.effectiveFrom)} → ${c.effectiveTo ? formatDateTime(c.effectiveTo) : 'vô thời hạn'})`,
    )
    .join(', ')}`;
}

export function PriceListsPage() {
  const me = useSession()!.user;
  const isOwner = me.role === Role.OWNER;
  const qc = useQueryClient();
  const [branchId, setBranchId] = useState(me.branchId ?? '');
  const [selected, setSelected] = useState<PriceList | null>(null);
  const [creating, setCreating] = useState(false);
  const [ending, setEnding] = useState<PriceList | null>(null);

  const branches = useQuery({
    queryKey: ['branches', 'all'],
    queryFn: () => api.get('/branches', branchPageSchema, { query: { pageSize: 100 } }),
  });
  const lists = useQuery({
    queryKey: ['price-lists', branchId],
    enabled: !!branchId,
    queryFn: () => api.get('/price-lists', priceListPageSchema, { query: { branchId, pageSize: 100 } }),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['price-lists'] });

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-800">Bảng giá chi nhánh</h1>
        <div className="flex gap-2">
          <select
            aria-label="Chọn chi nhánh"
            className={inputClass}
            value={branchId}
            disabled={!isOwner}
            onChange={(e) => {
              setBranchId(e.target.value);
              setSelected(null);
            }}
          >
            <option value="">— Chọn chi nhánh —</option>
            {branches.data?.items.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} – {b.name}
              </option>
            ))}
          </select>
          <Button disabled={!branchId} onClick={() => setCreating(true)}>
            + Bảng giá
          </Button>
        </div>
      </div>
      <p className="text-sm text-slate-500">
        Giá bán = bảng giá chi nhánh đang hiệu lực → giá biến thể → giá mặc định sản phẩm. Hiệu lực tính từ
        ngày bắt đầu đến <em>trước</em> ngày kết thúc; các bảng giá của cùng chi nhánh không được chồng thời
        gian.
      </p>
      <ErrorBanner error={lists.error} />
      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="px-3 py-2">Tên</th>
              <th className="px-3 py-2">Từ</th>
              <th className="px-3 py-2">Đến (không gồm)</th>
              <th className="px-3 py-2">Số mặt hàng</th>
              <th className="px-3 py-2">Trạng thái</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {lists.data?.items.map((l) => {
              const status = priceListStatus(l);
              return (
                <tr
                  key={l.id}
                  className={`border-t border-slate-100 ${selected?.id === l.id ? 'bg-slate-50' : ''}`}
                >
                  <td className="px-3 py-2">{l.name}</td>
                  <td className="px-3 py-2">{formatDateTime(l.effectiveFrom)}</td>
                  <td className="px-3 py-2">
                    {l.effectiveTo ? formatDateTime(l.effectiveTo) : 'Vô thời hạn'}
                  </td>
                  <td className="px-3 py-2">{l.itemCount ?? 0}</td>
                  <td className="px-3 py-2">
                    <Badge tone={STATUS_TONE[status]}>{PRICE_LIST_STATUS_LABELS[status]}</Badge>
                  </td>
                  <td className="flex justify-end gap-2 px-3 py-2">
                    <Button variant="secondary" onClick={() => setSelected(l)}>
                      Giá
                    </Button>
                    {status !== 'expired' && (
                      <Button variant="secondary" onClick={() => setEnding(l)}>
                        Kết thúc…
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && <PriceListItems list={selected} onChanged={refresh} />}
      {branchId && <EffectivePriceCheck branchId={branchId} />}

      {creating && (
        <CreatePriceList
          branchId={branchId}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            refresh();
          }}
        />
      )}
      {ending && (
        <EndPriceList
          list={ending}
          onClose={() => setEnding(null)}
          onSaved={() => {
            setEnding(null);
            refresh();
          }}
        />
      )}
    </section>
  );
}

function CreatePriceList({
  branchId,
  onClose,
  onSaved,
}: {
  branchId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ name: '', from: toDateInput(new Date().toISOString()), to: '' });
  const save = useMutation({
    mutationFn: () =>
      api.post('/price-lists', priceListSchema, {
        branchId,
        name: form.name,
        effectiveFrom: fromDateInput(form.from),
        effectiveTo: fromDateInput(form.to),
      }),
    onSuccess: onSaved,
  });
  return (
    <Modal title="Tạo bảng giá" onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        {save.error ? (
          <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            {overlapMessage(save.error) ?? (save.error as Error).message}
          </p>
        ) : null}
        <Field label="Tên bảng giá">
          {(id) => (
            <input
              id={id}
              className={inputClass}
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          )}
        </Field>
        <Field label="Áp dụng từ ngày">
          {(id) => (
            <input
              id={id}
              type="date"
              className={inputClass}
              required
              value={form.from}
              onChange={(e) => setForm({ ...form, from: e.target.value })}
            />
          )}
        </Field>
        <Field label="Đến ngày (không gồm; để trống = vô thời hạn)">
          {(id) => (
            <input
              id={id}
              type="date"
              className={inputClass}
              value={form.to}
              onChange={(e) => setForm({ ...form, to: e.target.value })}
            />
          )}
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" disabled={save.isPending}>
            Tạo
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EndPriceList({
  list,
  onClose,
  onSaved,
}: {
  list: PriceList;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [day, setDay] = useState(toDateInput(new Date().toISOString()));
  const save = useMutation({
    mutationFn: () => api.post(`/price-lists/${list.id}/end`, priceListSchema, { endAt: fromDateInput(day) }),
    onSuccess: onSaved,
  });
  return (
    <Modal title={`Kết thúc "${list.name}"`} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <ErrorBanner error={save.error} />
        <p className="text-sm text-slate-600">
          Bảng giá hết hiệu lực từ 0 giờ ngày được chọn; bảng giá mới có thể bắt đầu đúng ngày đó.
        </p>
        <Field label="Kết thúc vào ngày">
          {(id) => (
            <input
              id={id}
              type="date"
              className={inputClass}
              required
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          )}
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" disabled={save.isPending}>
            Kết thúc
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PriceListItems({ list, onChanged }: { list: PriceList; onChanged: () => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<PriceWarning[]>([]);
  const items = useQuery({
    queryKey: ['price-list-items', list.id],
    queryFn: () => api.get(`/price-lists/${list.id}/items`, priceListItemsResponseSchema),
  });
  const search = useQuery({
    queryKey: ['products', 'pick', q],
    enabled: q.trim().length >= 2,
    queryFn: () => api.get('/products', productPageSchema, { query: { q, pageSize: 10, isActive: true } }),
  });
  const after = (r: { warnings: PriceWarning[] }) => {
    setWarnings(r.warnings);
    void qc.invalidateQueries({ queryKey: ['price-list-items', list.id] });
    onChanged();
  };
  const upsert = useMutation({
    mutationFn: (entries: { variantId: string; price: number }[]) =>
      api.put(`/price-lists/${list.id}/items`, priceListItemsResponseSchema, { items: entries }),
    onSuccess: after,
  });
  const remove = useMutation({
    mutationFn: (variantId: string) =>
      api.delete(`/price-lists/${list.id}/items/${variantId}`, priceListItemsResponseSchema),
    onSuccess: after,
  });
  const setPrice = (variantId: string) => {
    const n = parseMoney(prices[variantId] ?? '');
    if (n !== null && !Number.isNaN(n)) upsert.mutate([{ variantId, price: n }]);
  };

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <h2 className="mb-2 font-semibold text-slate-800">Giá trong "{list.name}"</h2>
      <ErrorBanner error={items.error ?? upsert.error ?? remove.error} />
      {warnings.map((w) => (
        <p key={`${w.sku}-${w.price}`} role="status" className="text-sm text-amber-700">
          ⚠ {w.message}
        </p>
      ))}
      <table className="mt-2 w-full text-left text-sm">
        <thead className="text-slate-500">
          <tr>
            <th className="py-1">SKU</th>
            <th>Tên</th>
            <th className="text-right">Giá</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {items.data?.items.map((i) => (
            <tr key={i.id} className="border-t border-slate-100">
              <td className="py-1 font-mono">{i.variantSku}</td>
              <td>{i.variantName}</td>
              <td className="text-right">
                <input
                  aria-label={`Giá ${i.variantSku}`}
                  inputMode="numeric"
                  className={`${inputClass} w-28 text-right`}
                  placeholder={String(i.price)}
                  value={prices[i.variantId] ?? ''}
                  onChange={(e) => setPrices({ ...prices, [i.variantId]: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && setPrice(i.variantId)}
                />
                <span className="ml-2 text-slate-600">{formatVnd(i.price)}</span>
              </td>
              <td className="text-right">
                <Button variant="secondary" onClick={() => setPrice(i.variantId)}>
                  Lưu
                </Button>{' '}
                <Button variant="danger" onClick={() => remove.mutate(i.variantId)}>
                  Bỏ
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4">
        <input
          aria-label="Thêm mặt hàng vào bảng giá"
          placeholder="Thêm mặt hàng: tìm tên, SKU, mã vạch…"
          className={`${inputClass} w-96`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <ul className="mt-1">
          {search.data?.items.flatMap((p) =>
            p.variants
              .filter((v) => v.isActive)
              .map((v) => (
                <li key={v.id} className="flex items-center gap-2 py-1 text-sm">
                  <span className="w-48 font-mono">{v.sku}</span>
                  <span className="flex-1">{v.name}</span>
                  <span className="text-slate-500">{formatVnd(v.price ?? p.defaultPrice)}</span>
                  <input
                    aria-label={`Giá mới ${v.sku}`}
                    inputMode="numeric"
                    className={`${inputClass} w-28`}
                    value={prices[v.id] ?? ''}
                    onChange={(e) => setPrices({ ...prices, [v.id]: e.target.value })}
                  />
                  <Button variant="secondary" onClick={() => setPrice(v.id)}>
                    Thêm
                  </Button>
                </li>
              )),
          )}
        </ul>
      </div>
    </div>
  );
}

function EffectivePriceCheck({ branchId }: { branchId: string }) {
  const [q, setQ] = useState('');
  const [variantId, setVariantId] = useState('');
  const [at, setAt] = useState(new Date().toLocaleString('sv-SE').slice(0, 16));
  const search = useQuery({
    queryKey: ['products', 'check', q],
    enabled: q.trim().length >= 2,
    queryFn: () => api.get('/products', productPageSchema, { query: { q, pageSize: 5 } }),
  });
  const price = useQuery({
    queryKey: ['effective-price', branchId, variantId, at],
    enabled: !!variantId && !!at,
    queryFn: () =>
      api.get('/pricing/effective-price', effectivePriceResponseSchema, {
        query: { variantId, branchId, at: new Date(at) },
      }),
  });
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <h2 className="mb-2 font-semibold text-slate-800">Xem giá áp dụng tại thời điểm</h2>
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Tìm mặt hàng để xem giá"
          placeholder="Tìm mặt hàng…"
          className={inputClass}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          aria-label="Chọn biến thể"
          className={inputClass}
          value={variantId}
          onChange={(e) => setVariantId(e.target.value)}
        >
          <option value="">— Chọn —</option>
          {search.data?.items.flatMap((p) =>
            p.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.sku} – {v.name}
              </option>
            )),
          )}
        </select>
        <input
          aria-label="Thời điểm"
          type="datetime-local"
          className={inputClass}
          value={at}
          onChange={(e) => setAt(e.target.value)}
        />
      </div>
      <ErrorBanner error={price.error} />
      {price.data && (
        <p className="mt-2 text-sm" role="status">
          Giá: <strong>{formatVnd(price.data.price)}</strong> (theo {SOURCE_LABEL[price.data.source]})
        </p>
      )}
    </div>
  );
}
