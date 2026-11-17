import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  checkBarcode,
  productSchema,
  type Category,
  type PriceWarning,
  type Product,
  type VariantInput,
} from '@retailchain/shared';
import { api } from '../lib/api';
import { categoryLabel, formatAttributes, parseAttributes, parseMoney } from '../lib/format';
import { Button, ErrorBanner, Field, fieldErrors, inputClass, Modal } from './ui';

interface Row {
  key: string;
  id?: string;
  sku: string;
  name: string;
  attributes: string;
  price: string;
  costPrice: string;
  minStock: string;
  barcodes: string;
  isActive: boolean;
}

let rowSeq = 0;
const newRow = (partial: Partial<Row> = {}): Row => ({
  key: `r${++rowSeq}`,
  sku: '',
  name: '',
  attributes: '',
  price: '',
  costPrice: '',
  minStock: '',
  barcodes: '',
  isActive: true,
  ...partial,
});

const splitCodes = (text: string) => text.split(/[\s,|]+/).filter(Boolean);
const moneyText = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));

/** Validates the form and builds the API payload. Pure: unit-tested. */
export function buildProductPayload(
  form: {
    sku: string;
    name: string;
    categoryId: string;
    unit: string;
    defaultPrice: string;
    costPrice: string;
    minStock: string;
    isActive: boolean;
  },
  rows: Row[],
): { errors: Record<string, string>; payload?: Record<string, unknown> } {
  const errors: Record<string, string> = {};
  const defaultPrice = parseMoney(form.defaultPrice);
  const costPrice = parseMoney(form.costPrice);
  const minStock = parseMoney(form.minStock);
  if (!form.sku.trim()) errors.sku = 'Nhập SKU';
  if (!form.name.trim()) errors.name = 'Nhập tên sản phẩm';
  if (!form.unit.trim()) errors.unit = 'Nhập đơn vị tính';
  if (defaultPrice === null || Number.isNaN(defaultPrice))
    errors.defaultPrice = 'Giá bán là số nguyên (đồng)';
  if (costPrice !== null && Number.isNaN(costPrice)) errors.costPrice = 'Giá vốn là số nguyên (đồng)';
  if (minStock !== null && Number.isNaN(minStock)) errors.minStock = 'Tồn tối thiểu là số nguyên';
  if (!rows.some((r) => r.isActive)) errors.variants = 'Sản phẩm phải có ít nhất một biến thể đang bán';

  const variants: VariantInput[] = rows.map((r, i) => {
    const attributes = parseAttributes(r.attributes);
    if (!attributes) errors[`v${i}.attributes`] = 'Dạng ten=giatri; ten2=giatri2';
    const money = (text: string, field: string) => {
      const n = parseMoney(text);
      if (Number.isNaN(n)) errors[`v${i}.${field}`] = 'Số nguyên';
      return Number.isNaN(n) ? null : n;
    };
    const codes = splitCodes(r.barcodes);
    const bad = codes.map((c) => checkBarcode(c)).find((c) => !c.ok);
    if (bad && !bad.ok) errors[`v${i}.barcodes`] = bad.message;
    return {
      ...(r.id ? { id: r.id } : {}),
      sku: (r.sku || form.sku).trim().toUpperCase(),
      name: (r.name || form.name).trim(),
      attributes: attributes ?? {},
      price: money(r.price, 'price'),
      costPrice: money(r.costPrice, 'costPrice'),
      minStock: money(r.minStock, 'minStock'),
      isActive: r.isActive,
      barcodes: codes,
    };
  });
  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    payload: {
      sku: form.sku.trim().toUpperCase(),
      name: form.name.trim(),
      categoryId: form.categoryId || null,
      unit: form.unit.trim(),
      defaultPrice,
      costPrice: costPrice ?? 0,
      minStock: minStock ?? 0,
      isActive: form.isActive,
      variants,
    },
  };
}

export function ProductForm({
  product,
  categories,
  canEdit,
  onClose,
  onSaved,
}: {
  product: Product | null;
  categories: Category[];
  canEdit: boolean;
  onClose: () => void;
  onSaved: (p: Product, warnings: PriceWarning[]) => void;
}) {
  const [form, setForm] = useState({
    sku: product?.sku ?? '',
    name: product?.name ?? '',
    categoryId: product?.categoryId ?? '',
    unit: product?.unit ?? '',
    defaultPrice: moneyText(product?.defaultPrice),
    costPrice: moneyText(product?.costPrice),
    minStock: moneyText(product?.minStock ?? 0),
    isActive: product?.isActive ?? true,
  });
  const [rows, setRows] = useState<Row[]>(
    product
      ? product.variants.map((v) =>
          newRow({
            id: v.id,
            sku: v.sku,
            name: v.name,
            attributes: formatAttributes(v.attributes),
            price: moneyText(v.price),
            costPrice: moneyText(v.costPrice),
            minStock: moneyText(v.minStock),
            barcodes: v.barcodes.map((b) => b.code).join(', '),
            isActive: v.isActive,
          }),
        )
      : [newRow()],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      product
        ? api.patch(`/products/${product.id}`, productSchema, payload)
        : api.post('/products', productSchema, payload),
    onSuccess: (p) => onSaved(p, p.warnings ?? []),
    onError: (err) => setErrors(fieldErrors(err)),
  });

  const setRow = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const sortedCategories = [...categories].sort((a, b) =>
    categoryLabel(categories, a.id).localeCompare(categoryLabel(categories, b.id), 'vi'),
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const result = buildProductPayload(form, rows);
    setErrors(result.errors);
    if (result.payload) save.mutate(result.payload);
  }

  const cell = 'rounded border border-slate-300 px-1.5 py-1 text-sm w-full disabled:bg-slate-100';
  const ro = !canEdit;

  return (
    <Modal title={product ? `Sản phẩm ${product.sku}` : 'Thêm sản phẩm'} onClose={onClose} wide>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <ErrorBanner error={save.error} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field label="SKU" error={errors.sku}>
            {(id) => (
              <input
                id={id}
                className={inputClass}
                disabled={ro}
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
              />
            )}
          </Field>
          <div className="col-span-2 md:col-span-3">
            <Field label="Tên sản phẩm" error={errors.name}>
              {(id) => (
                <input
                  id={id}
                  className={`${inputClass} w-full`}
                  disabled={ro}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              )}
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Danh mục">
              {(id) => (
                <select
                  id={id}
                  className={`${inputClass} w-full`}
                  disabled={ro}
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                >
                  <option value="">— Chưa phân loại</option>
                  {sortedCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {categoryLabel(categories, c.id)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
          <Field label="Đơn vị tính" error={errors.unit}>
            {(id) => (
              <input
                id={id}
                className={inputClass}
                disabled={ro}
                placeholder="chai, gói, hộp…"
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
            )}
          </Field>
          <Field label="Tồn tối thiểu" error={errors.minStock}>
            {(id) => (
              <input
                id={id}
                inputMode="numeric"
                className={inputClass}
                disabled={ro}
                value={form.minStock}
                onChange={(e) => setForm({ ...form, minStock: e.target.value })}
              />
            )}
          </Field>
          <Field label="Giá bán mặc định (đ)" error={errors.defaultPrice}>
            {(id) => (
              <input
                id={id}
                inputMode="numeric"
                className={inputClass}
                disabled={ro}
                value={form.defaultPrice}
                onChange={(e) => setForm({ ...form, defaultPrice: e.target.value })}
              />
            )}
          </Field>
          {product?.costPrice !== undefined || !product ? (
            <Field label="Giá vốn (đ)" error={errors.costPrice}>
              {(id) => (
                <input
                  id={id}
                  inputMode="numeric"
                  className={inputClass}
                  disabled={ro}
                  value={form.costPrice}
                  onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
                />
              )}
            </Field>
          ) : null}
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              disabled={ro}
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            Đang kinh doanh
          </label>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-semibold text-slate-700">Biến thể</h3>
            {canEdit && (
              <Button variant="secondary" onClick={() => setRows((rs) => [...rs, newRow()])}>
                + Biến thể
              </Button>
            )}
          </div>
          {errors.variants && <p className="mb-2 text-sm text-red-600">{errors.variants}</p>}
          <p className="mb-2 text-xs text-slate-500">
            Để trống SKU/tên thì dùng của sản phẩm. Để trống giá thì dùng giá bán mặc định. Nhiều mã vạch cách
            nhau bằng dấu phẩy.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" aria-label="Biến thể">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="p-1">SKU</th>
                  <th className="p-1">Tên</th>
                  <th className="p-1">Thuộc tính</th>
                  <th className="p-1">Giá bán</th>
                  <th className="p-1">Giá vốn</th>
                  <th className="p-1">Tồn tối thiểu</th>
                  <th className="p-1">Mã vạch</th>
                  <th className="p-1">Bán</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.key} className="align-top">
                    <td className="p-1">
                      <input
                        aria-label={`SKU biến thể ${i + 1}`}
                        className={cell}
                        disabled={ro}
                        placeholder={form.sku}
                        value={r.sku}
                        onChange={(e) => setRow(r.key, { sku: e.target.value })}
                      />
                    </td>
                    <td className="p-1">
                      <input
                        aria-label={`Tên biến thể ${i + 1}`}
                        className={cell}
                        disabled={ro}
                        placeholder={form.name}
                        value={r.name}
                        onChange={(e) => setRow(r.key, { name: e.target.value })}
                      />
                    </td>
                    <td className="p-1">
                      <input
                        aria-label={`Thuộc tính ${i + 1}`}
                        className={cell}
                        disabled={ro}
                        placeholder="màu=Đỏ"
                        value={r.attributes}
                        onChange={(e) => setRow(r.key, { attributes: e.target.value })}
                      />
                      {errors[`v${i}.attributes`] && (
                        <p className="text-xs text-red-600">{errors[`v${i}.attributes`]}</p>
                      )}
                    </td>
                    <td className="p-1">
                      <input
                        aria-label={`Giá biến thể ${i + 1}`}
                        inputMode="numeric"
                        className={cell}
                        disabled={ro}
                        placeholder={form.defaultPrice}
                        value={r.price}
                        onChange={(e) => setRow(r.key, { price: e.target.value })}
                      />
                    </td>
                    <td className="p-1">
                      <input
                        aria-label={`Giá vốn biến thể ${i + 1}`}
                        inputMode="numeric"
                        className={cell}
                        disabled={ro}
                        placeholder={form.costPrice}
                        value={r.costPrice}
                        onChange={(e) => setRow(r.key, { costPrice: e.target.value })}
                      />
                    </td>
                    <td className="p-1">
                      <input
                        aria-label={`Tồn tối thiểu ${i + 1}`}
                        inputMode="numeric"
                        className={cell}
                        disabled={ro}
                        placeholder={form.minStock}
                        value={r.minStock}
                        onChange={(e) => setRow(r.key, { minStock: e.target.value })}
                      />
                    </td>
                    <td className="p-1">
                      <input
                        aria-label={`Mã vạch ${i + 1}`}
                        className={cell}
                        disabled={ro}
                        value={r.barcodes}
                        onChange={(e) => setRow(r.key, { barcodes: e.target.value })}
                      />
                      {errors[`v${i}.barcodes`] && (
                        <p className="text-xs text-red-600">{errors[`v${i}.barcodes`]}</p>
                      )}
                    </td>
                    <td className="p-1 text-center">
                      <input
                        type="checkbox"
                        aria-label={`Đang bán ${i + 1}`}
                        disabled={ro}
                        checked={r.isActive}
                        onChange={(e) => setRow(r.key, { isActive: e.target.checked })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {canEdit ? 'Hủy' : 'Đóng'}
          </Button>
          {canEdit && (
            <Button type="submit" disabled={save.isPending}>
              Lưu
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
