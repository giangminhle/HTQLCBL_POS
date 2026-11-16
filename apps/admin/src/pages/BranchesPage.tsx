import { useState, type FormEvent } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BRANCH_TYPE_LABELS,
  BRANCH_TYPES,
  branchPageSchema,
  branchSchema,
  createBranchSchema,
  updateBranchSchema,
  type Branch,
  type BranchType,
} from '@retailchain/shared';
import { api } from '../lib/api';
import {
  Badge,
  Button,
  ErrorBanner,
  Field,
  fieldErrors,
  inputClass,
  Modal,
  Pagination,
} from '../components/ui';

type FormState = { code: string; name: string; address: string; type: BranchType };
const EMPTY: FormState = { code: '', name: '', address: '', type: 'STORE' };

export function BranchesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Branch | 'new' | null>(null);

  const list = useQuery({
    queryKey: ['branches', { page, q }],
    queryFn: () => api.get('/branches', branchPageSchema, { query: { page, pageSize: 20, q } }),
    placeholderData: keepPreviousData,
  });

  const toggle = useMutation({
    mutationFn: (b: Branch) => api.patch(`/branches/${b.id}`, branchSchema, { isActive: !b.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branches'] }),
  });

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Chi nhánh và kho</h1>
        <Button onClick={() => setEditing('new')}>+ Thêm chi nhánh</Button>
      </div>
      <input
        aria-label="Tìm theo mã hoặc tên"
        placeholder="Tìm theo mã hoặc tên…"
        className={`${inputClass} max-w-xs`}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(1);
        }}
      />
      <ErrorBanner error={list.error ?? toggle.error} />
      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="px-3 py-2">Mã</th>
              <th className="px-3 py-2">Tên</th>
              <th className="px-3 py-2">Loại</th>
              <th className="px-3 py-2">Địa chỉ</th>
              <th className="px-3 py-2">Trạng thái</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.data?.items.map((b) => (
              <tr key={b.id} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono">{b.code}</td>
                <td className="px-3 py-2">{b.name}</td>
                <td className="px-3 py-2">{BRANCH_TYPE_LABELS[b.type]}</td>
                <td className="px-3 py-2 text-slate-600">{b.address ?? '—'}</td>
                <td className="px-3 py-2">
                  <Badge tone={b.isActive ? 'green' : 'gray'}>{b.isActive ? 'Hoạt động' : 'Ngưng'}</Badge>
                </td>
                <td className="flex justify-end gap-2 px-3 py-2">
                  <Button variant="secondary" onClick={() => setEditing(b)}>
                    Sửa
                  </Button>
                  <Button variant={b.isActive ? 'danger' : 'secondary'} onClick={() => toggle.mutate(b)}>
                    {b.isActive ? 'Ngưng' : 'Kích hoạt'}
                  </Button>
                </td>
              </tr>
            ))}
            {list.data?.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  Không có chi nhánh nào
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {list.data && <Pagination {...list.data} onPage={setPage} />}
      {editing && (
        <BranchForm
          branch={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void qc.invalidateQueries({ queryKey: ['branches'] });
          }}
        />
      )}
    </section>
  );
}

function BranchForm({
  branch,
  onClose,
  onSaved,
}: {
  branch: Branch | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(
    branch
      ? { code: branch.code, name: branch.name, address: branch.address ?? '', type: branch.type }
      : EMPTY,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () => {
      const address = form.address.trim() || null;
      return branch
        ? api.patch(
            `/branches/${branch.id}`,
            branchSchema,
            updateBranchSchema.parse({ name: form.name, address, type: form.type }),
          )
        : api.post('/branches', branchSchema, { ...form, address });
    },
    onSuccess: onSaved,
    onError: (err) => setErrors(fieldErrors(err)),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!branch) {
      const parsed = createBranchSchema.safeParse({ ...form, address: form.address || null });
      if (!parsed.success) {
        setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
        return;
      }
    }
    setErrors({});
    save.mutate();
  }

  return (
    <Modal title={branch ? `Sửa chi nhánh ${branch.code}` : 'Thêm chi nhánh'} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <ErrorBanner error={save.error} />
        <Field label="Mã chi nhánh" error={errors.code}>
          {(id) => (
            <input
              id={id}
              className={inputClass}
              disabled={!!branch}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          )}
        </Field>
        <Field label="Tên" error={errors.name}>
          {(id) => (
            <input
              id={id}
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          )}
        </Field>
        <Field label="Địa chỉ" error={errors.address}>
          {(id) => (
            <input
              id={id}
              className={inputClass}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          )}
        </Field>
        <Field label="Loại" error={errors.type}>
          {(id) => (
            <select
              id={id}
              className={inputClass}
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as BranchType })}
            >
              {BRANCH_TYPES.map((t) => (
                <option key={t} value={t}>
                  {BRANCH_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" disabled={save.isPending}>
            Lưu
          </Button>
        </div>
      </form>
    </Modal>
  );
}
