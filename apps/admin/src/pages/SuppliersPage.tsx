import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  supplierPageSchema,
  supplierSchema,
  type Supplier,
} from '@retailchain/shared';
import { useAuth, useSession } from '../auth/AuthContext';
import {
  Badge,
  Button,
  ErrorBanner,
  Field,
  inputClass,
  Modal,
  Pagination,
  formatDateTime,
} from '../components/ui';

export function SuppliersPage() {
  const { api } = useAuth();
  const session = useSession();
  const user = session?.user;
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Supplier | null | 'new'>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['suppliers', page, search],
    queryFn: () =>
      api.get('/suppliers', supplierPageSchema, {
        query: {
          page,
          pageSize: 15,
          q: search || undefined,
        },
      }),
  });

  const canWrite = user?.role === 'OWNER' || user?.role === 'BRANCH_MANAGER' || user?.role === 'WAREHOUSE_KEEPER';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Nhà cung cấp</h1>
          <p className="text-sm text-slate-500">Quản lý đối tác và nhà cung ứng hàng hóa</p>
        </div>
        {canWrite && (
          <Button onClick={() => setEditing('new')}>+ Thêm nhà cung cấp</Button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <input
          type="search"
          placeholder="Tìm theo mã, tên, số điện thoại..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className={`${inputClass} w-72`}
        />
      </div>

      <ErrorBanner error={error} />

      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Mã NCC</th>
              <th className="px-4 py-3">Tên nhà cung cấp</th>
              <th className="px-4 py-3">Số điện thoại</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Địa chỉ</th>
              <th className="px-4 py-3">Trạng thái</th>
              <th className="px-4 py-3">Ngày tạo</th>
              {canWrite && <th className="px-4 py-3 text-right">Thao tác</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {isLoading && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  Đang tải...
                </td>
              </tr>
            )}
            {!isLoading && data?.items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                  Chưa có nhà cung cấp nào
                </td>
              </tr>
            )}
            {data?.items.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono font-medium text-slate-800">{s.code}</td>
                <td className="px-4 py-3 font-medium text-slate-800">{s.name}</td>
                <td className="px-4 py-3 text-slate-600">{s.phone || '—'}</td>
                <td className="px-4 py-3 text-slate-600">{s.email || '—'}</td>
                <td className="px-4 py-3 text-slate-600">{s.address || '—'}</td>
                <td className="px-4 py-3">
                  <Badge tone={s.isActive ? 'green' : 'gray'}>
                    {s.isActive ? 'Hoạt động' : 'Ngưng'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(s.createdAt)}</td>
                {canWrite && (
                  <td className="px-4 py-3 text-right">
                    <Button variant="secondary" onClick={() => setEditing(s)}>
                      Sửa
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && (
        <Pagination
          page={page}
          pageSize={15}
          total={data.total}
          onPage={(p) => setPage(p)}
        />
      )}

      {editing && (
        <SupplierModal
          supplier={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSuccess={() => {
            setEditing(null);
            void qc.invalidateQueries({ queryKey: ['suppliers'] });
          }}
        />
      )}
    </div>
  );
}

function SupplierModal({
  supplier,
  onClose,
  onSuccess,
}: {
  supplier: Supplier | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { api } = useAuth();
  const [code, setCode] = useState(supplier?.code ?? '');
  const [name, setName] = useState(supplier?.name ?? '');
  const [phone, setPhone] = useState(supplier?.phone ?? '');
  const [email, setEmail] = useState(supplier?.email ?? '');
  const [address, setAddress] = useState(supplier?.address ?? '');
  const [isActive, setIsActive] = useState(supplier?.isActive ?? true);
  const [error, setError] = useState<unknown>(null);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (supplier) {
        return api.patch(`/suppliers/${supplier.id}`, supplierSchema, {
          name,
          phone: phone || null,
          email: email || null,
          address: address || null,
          isActive,
        });
      }
      return api.post('/suppliers', supplierSchema, {
        code,
        name,
        phone: phone || null,
        email: email || null,
        address: address || null,
      });
    },
    onSuccess,
    onError: (err) => setError(err),
  });

  return (
    <Modal title={supplier ? 'Cập nhật nhà cung cấp' : 'Thêm nhà cung cấp mới'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          saveMut.mutate();
        }}
        className="flex flex-col gap-3"
      >
        <ErrorBanner error={error} />
        {!supplier && (
          <Field label="Mã nhà cung cấp *">
            {(id) => (
              <input
                id={id}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="VD: NCC-VINAMILK"
                className={inputClass}
              />
            )}
          </Field>
        )}
        <Field label="Tên nhà cung cấp *">
          {(id) => (
            <input
              id={id}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Công ty CP Sữa Việt Nam"
              className={inputClass}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Số điện thoại">
            {(id) => (
              <input
                id={id}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="VD: 02854155555"
                className={inputClass}
              />
            )}
          </Field>
          <Field label="Email">
            {(id) => (
              <input
                id={id}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@ncc.com"
                className={inputClass}
              />
            )}
          </Field>
        </div>
        <Field label="Địa chỉ">
          {(id) => (
            <input
              id={id}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Số nhà, đường, quận/huyện..."
              className={inputClass}
            />
          )}
        </Field>
        {supplier && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Đang hoạt động
          </label>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" disabled={saveMut.isPending}>
            {saveMut.isPending ? 'Đang lưu...' : 'Lưu thông tin'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
