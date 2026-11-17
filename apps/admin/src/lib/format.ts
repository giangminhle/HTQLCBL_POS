import type { Category, PriceList } from '@retailchain/shared';

/** 45000 → "45.000 ₫" (VND, integer đồng). */
export const formatVnd = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `${n.toLocaleString('vi-VN')} ₫`;

/**
 * Money input: digits only (dots/spaces typed as thousand separators are ignored). Empty → null.
 * Returns NaN for anything else so the form can show an error.
 */
export function parseMoney(input: string): number | null {
  const s = input.replace(/[\s.]/g, '');
  if (!s) return null;
  return /^\d+$/.test(s) ? Number(s) : Number.NaN;
}

/** "dung tích=180ml; màu=Đỏ" ⇄ { 'dung tích': '180ml', màu: 'Đỏ' } */
export function parseAttributes(text: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const part of text
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)) {
    const i = part.indexOf('=');
    if (i <= 0) return null;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}
export const formatAttributes = (a: Record<string, string>) =>
  Object.entries(a)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');

export type PriceListStatus = 'active' | 'upcoming' | 'expired' | 'inactive';
export const PRICE_LIST_STATUS_LABELS: Record<PriceListStatus, string> = {
  active: 'Đang hiệu lực',
  upcoming: 'Sắp áp dụng',
  expired: 'Hết hạn',
  inactive: 'Ngưng',
};

/** Half-open window [from, to) — same rule as the server (CR-004). */
export function priceListStatus(
  list: Pick<PriceList, 'effectiveFrom' | 'effectiveTo' | 'isActive'>,
  now = new Date(),
) {
  if (!list.isActive) return 'inactive';
  const t = now.getTime();
  if (new Date(list.effectiveFrom).getTime() > t) return 'upcoming';
  if (list.effectiveTo && new Date(list.effectiveTo).getTime() <= t) return 'expired';
  return 'active';
}

/** "Mỹ phẩm › Chăm sóc da › Kem chống nắng" for a category id. */
export function categoryLabel(categories: Category[], id: string | null): string {
  if (!id) return '—';
  const byId = new Map(categories.map((c) => [c.id, c]));
  const c = byId.get(id);
  if (!c) return '…';
  return c.path
    .split('/')
    .filter(Boolean)
    .map((pid) => byId.get(pid)?.name ?? '?')
    .join(' › ');
}

/** Date input value (yyyy-mm-dd, local) ⇄ ISO at local midnight. */
export const toDateInput = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('sv-SE') : '');
export const fromDateInput = (value: string) => (value ? new Date(`${value}T00:00:00`).toISOString() : null);
