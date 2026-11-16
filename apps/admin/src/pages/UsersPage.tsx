import { useState, type FormEvent } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  branchPageSchema,
  createUserSchema,
  resetPasswordResponseSchema,
  Role,
  ROLE_LABELS,
  roleRank,
  ROLES,
  STAFF_ROLES,
  userPageSchema,
  userSchema,
  type AuthUser,
  type ResetPasswordResponse,
  type User,
} from '@retailchain/shared';
import { useSession } from '../auth/AuthContext';
import { api } from '../lib/api';
import {
  Badge,
  Button,
  ErrorBanner,
  Field,
  fieldErrors,
  formatDateTime,
  inputClass,
  Modal,
  Pagination,
} from '../components/ui';

/** Mirrors the API rule (REQ-AUTH-02) to hide buttons that would be rejected anyway. */
export function canManage(actor: AuthUser, target: Pick<User, 'id' | 'role' | 'branchId'>): boolean {
  if (actor.id === target.id) return false;
  if (actor.role === Role.OWNER) return true;
  return (
    actor.role === Role.BRANCH_MANAGER &&
    actor.branchId === target.branchId &&
    roleRank(target.role) < roleRank(actor.role)
  );
}

export function assignableRoles(actor: AuthUser): readonly Role[] {
  return actor.role === Role.OWNER ? ROLES : STAFF_ROLES;
}

export function UsersPage() {
  const me = useSession()!.user;
  const isOwner = me.role === Role.OWNER;
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ q: '', role: '', branchId: '', page: 1 });
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [resetResult, setResetResult] = useState<{ user: User; result: ResetPasswordResponse } | null>(null);

  const branches = useQuery({
    queryKey: ['branches', 'all'],
    queryFn: () => api.get('/branches', branchPageSchema, { query: { pageSize: 100 } }),
  });
  const branchName = (id: string | null) =>
    id ? (branches.data?.items.find((b) => b.id === id)?.name ?? '…') : '— (toàn chuỗi)';

  const list = useQuery({
    queryKey: ['users', filters],
    queryFn: () =>
      api.get('/users', userPageSchema, {
        query: {
          q: filters.q,
          role: filters.role,
          branchId: filters.branchId,
          page: filters.page,
          pageSize: 20,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const toggle = useMutation({
    mutationFn: (u: User) => api.patch(`/users/${u.id}`, userSchema, { isActive: !u.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const reset = useMutation({
    mutationFn: (u: User) => api.post(`/users/${u.id}/reset-password`, resetPasswordResponseSchema),
    onSuccess: (result, user) => {
      setResetResult({ user, result });
      void qc.invalidateQueries({ queryKey: ['users'] });
    },
  });

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Người dùng</h1>
        <Button onClick={() => setEditing('new')}>+ Thêm người dùng</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="Tìm theo tên đăng nhập hoặc họ tên"
          placeholder="Tìm tên đăng nhập, họ tên…"
          className={inputClass}
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value, page: 1 })}
        />
        <select
          aria-label="Lọc theo vai trò"
          className={inputClass}
          value={filters.role}
          onChange={(e) => setFilters({ ...filters, role: e.target.value, page: 1 })}
        >
          <option value="">Mọi vai trò</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        {isOwner && (
          <select
            aria-label="Lọc theo chi nhánh"
            className={inputClass}
            value={filters.branchId}
            onChange={(e) => setFilters({ ...filters, branchId: e.target.value, page: 1 })}
          >
            <option value="">Mọi chi nhánh</option>
            {branches.data?.items.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} – {b.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <ErrorBanner error={list.error ?? toggle.error ?? reset.error} />
      <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="px-3 py-2">Tên đăng nhập</th>
              <th className="px-3 py-2">Họ tên</th>
              <th className="px-3 py-2">Vai trò</th>
              <th className="px-3 py-2">Chi nhánh</th>
              <th className="px-3 py-2">Trạng thái</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.data?.items.map((u) => {
              const manageable = canManage(me, u);
              const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
              return (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono">{u.username}</td>
                  <td className="px-3 py-2">{u.fullName}</td>
                  <td className="px-3 py-2">{ROLE_LABELS[u.role]}</td>
                  <td className="px-3 py-2">{branchName(u.branchId)}</td>
                  <td className="flex flex-wrap gap-1 px-3 py-2">
                    <Badge tone={u.isActive ? 'green' : 'gray'}>{u.isActive ? 'Hoạt động' : 'Đã khóa'}</Badge>
                    {locked && <Badge tone="red">Tạm khóa đến {formatDateTime(u.lockedUntil)}</Badge>}
                    {u.mustChangePassword && <Badge tone="amber">Chờ đổi mật khẩu</Badge>}
                  </td>
                  <td className="px-3 py-2">
                    {manageable && (
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" onClick={() => setEditing(u)}>
                          Sửa
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={reset.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Đặt lại mật khẩu cho ${u.username}? Mọi phiên đăng nhập của người này sẽ bị thu hồi.`,
                              )
                            ) {
                              reset.mutate(u);
                            }
                          }}
                        >
                          Đặt lại mật khẩu
                        </Button>
                        <Button
                          variant={u.isActive ? 'danger' : 'secondary'}
                          onClick={() => toggle.mutate(u)}
                        >
                          {u.isActive ? 'Khóa' : 'Mở khóa'}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {list.data && <Pagination {...list.data} onPage={(page) => setFilters({ ...filters, page })} />}

      {editing && (
        <UserForm
          me={me}
          user={editing === 'new' ? null : editing}
          branches={branches.data?.items ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void qc.invalidateQueries({ queryKey: ['users'] });
          }}
        />
      )}
      {resetResult && <TempPasswordDialog {...resetResult} onClose={() => setResetResult(null)} />}
    </section>
  );
}

function UserForm({
  me,
  user,
  branches,
  onClose,
  onSaved,
}: {
  me: AuthUser;
  user: User | null;
  branches: { id: string; code: string; name: string; isActive: boolean }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isOwner = me.role === Role.OWNER;
  const [form, setForm] = useState({
    username: user?.username ?? '',
    fullName: user?.fullName ?? '',
    role: (user?.role ?? Role.CASHIER) as Role,
    branchId: user?.branchId ?? (isOwner ? '' : (me.branchId ?? '')),
    password: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const branchId = form.role === Role.OWNER ? null : form.branchId || null;

  const save = useMutation({
    mutationFn: () =>
      user
        ? api.patch(`/users/${user.id}`, userSchema, {
            fullName: form.fullName,
            role: form.role,
            ...(isOwner ? { branchId } : {}),
          })
        : api.post('/users', userSchema, { ...form, branchId }),
    onSuccess: onSaved,
    onError: (err) => setErrors(fieldErrors(err)),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) {
      const parsed = createUserSchema.safeParse({ ...form, branchId });
      if (!parsed.success) {
        setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
        return;
      }
    }
    setErrors({});
    save.mutate();
  }

  return (
    <Modal title={user ? `Sửa ${user.username}` : 'Thêm người dùng'} onClose={onClose}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <ErrorBanner error={save.error} />
        <Field label="Tên đăng nhập" error={errors.username}>
          {(id) => (
            <input
              id={id}
              className={inputClass}
              disabled={!!user}
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          )}
        </Field>
        <Field label="Họ tên" error={errors.fullName}>
          {(id) => (
            <input
              id={id}
              className={inputClass}
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          )}
        </Field>
        <Field label="Vai trò" error={errors.role}>
          {(id) => (
            <select
              id={id}
              className={inputClass}
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            >
              {assignableRoles(me).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          )}
        </Field>
        {form.role !== Role.OWNER && (
          <Field label="Chi nhánh" error={errors.branchId}>
            {(id) => (
              <select
                id={id}
                className={inputClass}
                disabled={!isOwner}
                value={form.branchId}
                onChange={(e) => setForm({ ...form, branchId: e.target.value })}
              >
                <option value="">— Chọn chi nhánh —</option>
                {branches
                  .filter((b) => b.isActive || b.id === form.branchId)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.code} – {b.name}
                    </option>
                  ))}
              </select>
            )}
          </Field>
        )}
        {!user && (
          <Field label="Mật khẩu ban đầu (người dùng phải đổi khi đăng nhập lần đầu)" error={errors.password}>
            {(id) => (
              <input
                id={id}
                type="password"
                autoComplete="new-password"
                className={inputClass}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            )}
          </Field>
        )}
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

function TempPasswordDialog({
  user,
  result,
  onClose,
}: {
  user: User;
  result: ResetPasswordResponse;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal title="Mật khẩu tạm" onClose={onClose}>
      <div className="flex flex-col gap-3 text-sm">
        <p>
          Mật khẩu tạm cho <strong>{user.username}</strong>. Chỉ hiển thị <strong>một lần</strong>; hãy gửi
          trực tiếp cho nhân viên. Họ sẽ phải đổi mật khẩu khi đăng nhập.
        </p>
        <p
          className="rounded bg-slate-100 px-3 py-2 text-center font-mono text-lg tracking-wider"
          data-testid="temp-password"
        >
          {result.temporaryPassword}
        </p>
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              void navigator.clipboard?.writeText(result.temporaryPassword).then(() => setCopied(true))
            }
          >
            {copied ? 'Đã sao chép' : 'Sao chép'}
          </Button>
          <Button onClick={onClose}>Đóng</Button>
        </div>
      </div>
    </Modal>
  );
}
