import { useQuery } from '@tanstack/react-query';
import { ApiClient, ApiRequestError, healthResponseSchema } from '@retailchain/shared';

interface Props {
  api: ApiClient;
  appName: string;
}

/** Sprint 0 smoke page: proves the frontend can reach GET /health. */
export function HelloPage({ api, appName }: Props) {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get('/health', healthResponseSchema),
    retry: false,
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold text-slate-800">Xin chào – {appName}</h1>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" aria-live="polite">
        <h2 className="mb-2 font-semibold text-slate-700">Trạng thái hệ thống</h2>
        {health.isPending && <p className="text-slate-500">Đang kiểm tra kết nối…</p>}
        {health.isError && (
          <p role="alert" className="text-red-600">
            Không kết nối được API: {health.error.message}
            {health.error instanceof ApiRequestError && ` (${health.error.code})`}
          </p>
        )}
        {health.isSuccess && (
          <dl className="grid grid-cols-2 gap-1 text-sm">
            <dt className="text-slate-500">API</dt>
            <dd className={health.data.status === 'ok' ? 'text-green-600' : 'text-amber-600'}>
              {health.data.status === 'ok' ? 'Hoạt động' : 'Suy giảm'}
            </dd>
            <dt className="text-slate-500">Cơ sở dữ liệu</dt>
            <dd className={health.data.db === 'up' ? 'text-green-600' : 'text-red-600'}>
              {health.data.db === 'up' ? 'Đã kết nối' : 'Mất kết nối'}
            </dd>
            <dt className="text-slate-500">Phiên bản</dt>
            <dd>{health.data.version}</dd>
          </dl>
        )}
        <button
          type="button"
          onClick={() => void health.refetch()}
          className="mt-3 rounded bg-slate-800 px-3 py-1 text-sm text-white hover:bg-slate-700"
        >
          Kiểm tra lại
        </button>
      </section>
    </main>
  );
}
