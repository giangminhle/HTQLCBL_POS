import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { ApiRequestError } from '@retailchain/shared';

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const styles = {
    primary: 'bg-slate-800 text-white hover:bg-slate-700 disabled:bg-slate-400',
    secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400',
    danger: 'bg-red-600 text-white hover:bg-red-500 disabled:bg-red-300',
  }[variant];
  return (
    <button
      type="button"
      {...props}
      className={`rounded px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed ${styles} ${className}`}
    />
  );
}

/** Label + control + error message. `children` receives the generated id for accessibility. */
export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      {children(id)}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export const inputClass =
  'rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-slate-500 focus:outline-none disabled:bg-slate-100';

export function ErrorBanner({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {errorMessage(error)}
    </p>
  );
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Đã có lỗi xảy ra';
}

/** Zod-style field errors from an API VALIDATION_ERROR, keyed by field path. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiRequestError) || !Array.isArray(error.details)) return {};
  const out: Record<string, string> = {};
  for (const d of error.details as { path?: string; message?: string }[]) {
    if (d.path && d.message && !out[d.path]) out[d.path] = d.message;
  }
  return out;
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal?.();
    return () => dialog?.close?.();
  }, []);
  return (
    <dialog
      ref={ref}
      open
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-label={title}
      className="w-full max-w-lg rounded-lg p-0 shadow-xl backdrop:bg-slate-900/40"
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="font-semibold text-slate-800">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="text-slate-500 hover:text-slate-800"
        >
          ✕
        </button>
      </div>
      <div className="p-4">{children}</div>
    </dialog>
  );
}

export function Badge({ tone, children }: { tone: 'green' | 'gray' | 'amber' | 'red'; children: ReactNode }) {
  const styles = {
    green: 'bg-green-100 text-green-800',
    gray: 'bg-slate-100 text-slate-600',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-800',
  }[tone];
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${styles}`}>{children}</span>;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-end gap-2 text-sm text-slate-600">
      <span>
        Trang {page}/{pages} · {total} bản ghi
      </span>
      <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Trước
      </Button>
      <Button variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Sau
      </Button>
    </div>
  );
}

export const formatDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'medium' }) : '—';
