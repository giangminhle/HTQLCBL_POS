import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { categoryListSchema, categorySchema, Role, type Category } from '@retailchain/shared';
import { useSession } from '../auth/AuthContext';
import { Badge, Button, ErrorBanner, Field, inputClass, Modal } from '../components/ui';
import { api } from '../lib/api';

type Node = Category & { children: Node[] };

// Fixed classes (no inline style attribute: CSP style-src 'self', ADR-001).
const INDENT = ['pl-2', 'pl-7', 'pl-12', 'pl-16', 'pl-20', 'pl-24'];

export function buildTree(categories: Category[]): Node[] {
  const nodes = new Map(categories.map((c) => [c.id, { ...c, children: [] as Node[] }]));
  const roots: Node[] = [];
  for (const n of nodes.values()) {
    const parent = n.parentId ? nodes.get(n.parentId) : undefined;
    if (parent) parent.children.push(n);
    else roots.push(n);
  }
  const sort = (list: Node[]) => {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'vi'));
    list.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

export function CategoriesPage() {
  const canEdit = useSession()?.user.role === Role.OWNER;
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{ category: Category | null; parentId: string | null } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const list = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/categories', categoryListSchema),
  });
  const tree = useMemo(() => buildTree(list.data ?? []), [list.data]);
  const remove = useMutation({
    mutationFn: (c: Category) => api.delete(`/categories/${c.id}`, categorySchema),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });

  const toggle = (id: string) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderNode = (n: Node, depth: number) => (
    <li key={n.id}>
      <div
        className={`flex items-center gap-2 rounded py-1.5 pr-2 hover:bg-slate-50 ${INDENT[Math.min(depth, INDENT.length - 1)]}`}
      >
        <button
          type="button"
          aria-label={collapsed.has(n.id) ? `Mở ${n.name}` : `Thu ${n.name}`}
          className="w-5 text-slate-500"
          onClick={() => toggle(n.id)}
          disabled={!n.children.length}
        >
          {n.children.length ? (collapsed.has(n.id) ? '▸' : '▾') : '·'}
        </button>
        <span className="flex-1 text-slate-800">{n.name}</span>
        {!n.isActive && <Badge tone="gray">Ngưng</Badge>}
        {canEdit && (
          <div className="flex gap-1">
            <Button variant="secondary" onClick={() => setEditing({ category: null, parentId: n.id })}>
              + Con
            </Button>
            <Button variant="secondary" onClick={() => setEditing({ category: n, parentId: n.parentId })}>
              Sửa
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (window.confirm(`Xóa danh mục "${n.name}"?`)) remove.mutate(n);
              }}
            >
              Xóa
            </Button>
          </div>
        )}
      </div>
      {n.children.length > 0 && !collapsed.has(n.id) && (
        <ul>{n.children.map((c) => renderNode(c, depth + 1))}</ul>
      )}
    </li>
  );

  return (
    <section className="flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Danh mục sản phẩm</h1>
        {canEdit && (
          <Button onClick={() => setEditing({ category: null, parentId: null })}>+ Danh mục gốc</Button>
        )}
      </div>
      <ErrorBanner error={list.error ?? remove.error} />
      <ul className="rounded-lg bg-white py-2 shadow-sm" aria-label="Cây danh mục">
        {tree.map((n) => renderNode(n, 0))}
      </ul>
      {editing && (
        <CategoryForm
          all={list.data ?? []}
          category={editing.category}
          parentId={editing.parentId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void qc.invalidateQueries({ queryKey: ['categories'] });
          }}
        />
      )}
    </section>
  );
}

function CategoryForm({
  all,
  category,
  parentId,
  onClose,
  onSaved,
}: {
  all: Category[];
  category: Category | null;
  parentId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: category?.name ?? '',
    parentId: parentId ?? '',
    sortOrder: String(category?.sortOrder ?? 0),
    isActive: category?.isActive ?? true,
  });
  // A category cannot be moved under itself or one of its descendants.
  const parents = all.filter((c) => !category || !c.path.startsWith(category.path));
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        parentId: form.parentId || null,
        sortOrder: Number(form.sortOrder) || 0,
        ...(category ? { isActive: form.isActive } : {}),
      };
      return category
        ? api.patch(`/categories/${category.id}`, categorySchema, body)
        : api.post('/categories', categorySchema, body);
    },
    onSuccess: onSaved,
  });
  const nameError = z.string().trim().min(1).safeParse(form.name).success ? undefined : 'Nhập tên danh mục';

  return (
    <Modal title={category ? `Sửa "${category.name}"` : 'Thêm danh mục'} onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (!nameError) save.mutate();
        }}
      >
        <ErrorBanner error={save.error} />
        <Field label="Tên" error={form.name ? nameError : undefined}>
          {(id) => (
            <input
              id={id}
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          )}
        </Field>
        <Field label="Danh mục cha">
          {(id) => (
            <select
              id={id}
              className={inputClass}
              value={form.parentId}
              onChange={(e) => setForm({ ...form, parentId: e.target.value })}
            >
              <option value="">— (gốc)</option>
              {parents.map((c) => (
                <option key={c.id} value={c.id}>
                  {'— '.repeat(c.path.split('/').filter(Boolean).length - 1)}
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Thứ tự">
          {(id) => (
            <input
              id={id}
              type="number"
              className={inputClass}
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
            />
          )}
        </Field>
        {category && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            Đang hoạt động
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" disabled={save.isPending || !!nameError}>
            Lưu
          </Button>
        </div>
      </form>
    </Modal>
  );
}
