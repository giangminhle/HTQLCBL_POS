import { Fragment, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AUDIT_ACTION_LABELS, auditLogPageSchema, type AuditAction } from '@retailchain/shared';
import { api } from '../lib/api';
import { Button, ErrorBanner, formatDateTime, inputClass, Pagination } from '../components/ui';

const ENTITIES = ['User', 'Branch'];
const ENTITY_LABELS: Record<string, string> = { User: 'Người dùng', Branch: 'Chi nhánh' };

const actionLabel = (a: string) => AUDIT_ACTION_LABELS[a as AuditAction] ?? a;

/** Rendered as text inside <pre>: never as HTML (ADR-001: no dangerouslySetInnerHTML). */
const pretty = (v: unknown) => (v === null || v === undefined ? '—' : JSON.stringify(v, null, 2));

export function AuditLogsPage() {
  const [filters, setFilters] = useState({ action: '', entity: '', from: '', to: '', page: 1 });
  const [open, setOpen] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['audit-logs', filters],
    queryFn: () =>
      api.get('/audit-logs', auditLogPageSchema, {
        query: {
          action: filters.action,
          entity: filters.entity,
          from: filters.from ? new Date(`${filters.from}T00:00:00`) : undefined,
          to: filters.to ? new Date(`${filters.to}T23:59:59`) : undefined,
          page: filters.page,
          pageSize: 30,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const set = (k: keyof typeof filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFilters({ ...filters, [k]: e.target.value, page: 1 });

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-slate-800">Nhật ký thao tác</h1>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Lọc theo thao tác"
          className={inputClass}
          value={filters.action}
          onChange={set('action')}
        >
          <option value="">Mọi thao tác</option>
          {Object.entries(AUDIT_ACTION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          aria-label="Lọc theo đối tượng"
          className={inputClass}
          value={filters.entity}
          onChange={set('entity')}
        >
          <option value="">Mọi đối tượng</option>
          {ENTITIES.map((e) => (
            <option key={e} value={e}>
              {ENTITY_LABELS[e]}
            </option>
          ))}
        </select>
        <label className="text-sm text-slate-600">
          Từ <input type="date" className={inputClass} value={filters.from} onChange={set('from')} />
        </label>
        <label className="text-sm text-slate-600">
          Đến <input type="date" className={inputClass} value={filters.to} onChange={set('to')} />
        </label>
      </div>
      <ErrorBanner error={list.error} />
      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="px-3 py-2">Thời gian</th>
              <th className="px-3 py-2">Người thực hiện</th>
              <th className="px-3 py-2">Thao tác</th>
              <th className="px-3 py-2">Đối tượng</th>
              <th className="px-3 py-2">IP</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.data?.items.map((log) => (
              <Fragment key={log.id}>
                <tr className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-3 py-2">{formatDateTime(log.createdAt)}</td>
                  <td className="px-3 py-2 font-mono">{log.username ?? '—'}</td>
                  <td className="px-3 py-2">{actionLabel(log.action)}</td>
                  <td className="px-3 py-2">
                    {ENTITY_LABELS[log.entity] ?? log.entity}
                    {log.entityId && (
                      <span className="ml-1 font-mono text-xs text-slate-500">
                        {log.entityId.slice(0, 8)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{log.ip ?? '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <Button variant="secondary" onClick={() => setOpen(open === log.id ? null : log.id)}>
                      {open === log.id ? 'Ẩn' : 'Chi tiết'}
                    </Button>
                  </td>
                </tr>
                {open === log.id && (
                  <tr className="bg-slate-50">
                    <td colSpan={6} className="px-3 py-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Trước</p>
                          <pre className="max-h-72 overflow-auto rounded bg-white p-2 text-xs">
                            {pretty(log.before)}
                          </pre>
                        </div>
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Sau</p>
                          <pre className="max-h-72 overflow-auto rounded bg-white p-2 text-xs">
                            {pretty(log.after)}
                          </pre>
                        </div>
                      </div>
                      <p className="mt-2 font-mono text-xs text-slate-500">
                        request id: {log.requestId ?? '—'}
                      </p>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {list.data && <Pagination {...list.data} onPage={(page) => setFilters({ ...filters, page })} />}
    </section>
  );
}
