import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { IMPORT_MAX_ROWS, importResultSchema, type ImportResult } from '@retailchain/shared';
import { Button, ErrorBanner } from '../components/ui';
import { api } from '../lib/api';

/** Triggers a browser download of text content (no server round-trip, no inline HTML). */
export function downloadText(filename: string, content: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [checked, setChecked] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);

  const run = useMutation({
    mutationFn: ({ dryRun }: { dryRun: boolean }) => {
      const form = new FormData();
      form.append('file', file!);
      return api.upload('/products/import', importResultSchema, form, { query: { dryRun } });
    },
    onSuccess: (result) => (result.dryRun ? setChecked(result) : setDone(result)),
  });
  const template = useMutation({
    mutationFn: () => api.getText('/products/import/template'),
    onSuccess: (csv) => downloadText('mau-nhap-san-pham.csv', csv),
  });

  const result = done ?? checked;
  // "Nhập" only after a successful check of the same file.
  const canCommit = !!file && checked?.ok === true && !done;

  return (
    <section className="flex max-w-4xl flex-col gap-4">
      <h1 className="text-2xl font-bold text-slate-800">Nhập sản phẩm từ file CSV</h1>
      <div className="rounded-lg bg-white p-4 text-sm text-slate-700 shadow-sm">
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Tải{' '}
            <button type="button" className="text-blue-700 underline" onClick={() => template.mutate()}>
              file mẫu
            </button>
            , mở bằng Excel và điền dữ liệu. Mỗi dòng là một biến thể; các dòng cùng <code>product_sku</code>{' '}
            là cùng một sản phẩm.
          </li>
          <li>
            Trong Excel chọn <strong>File → Save As → "CSV UTF-8 (Comma delimited) (*.csv)"</strong>. Chọn
            "CSV" thường sẽ làm hỏng chữ tiếng Việt.
          </li>
          <li>
            Bấm <strong>Kiểm tra</strong>; sửa hết lỗi rồi bấm <strong>Nhập</strong>. Có lỗi thì không dòng
            nào được nhập.
          </li>
          <li>
            Tối đa {IMPORT_MAX_ROWS.toLocaleString('vi-VN')} dòng, 2 MB mỗi lần. Giá ghi số nguyên, không dấu
            chấm (ví dụ 45000).
          </li>
        </ol>
      </div>
      <ErrorBanner error={template.error ?? run.error} />
      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Chọn file CSV"
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setChecked(null);
            setDone(null);
          }}
        />
        <Button
          variant="secondary"
          disabled={!file || run.isPending}
          onClick={() => run.mutate({ dryRun: true })}
        >
          Kiểm tra
        </Button>
        <Button disabled={!canCommit || run.isPending} onClick={() => run.mutate({ dryRun: false })}>
          Nhập
        </Button>
      </div>

      {result && (
        <div className="rounded-lg bg-white p-4 shadow-sm" aria-live="polite">
          {result.ok ? (
            <p role="status" className="text-green-700">
              {result.dryRun ? 'File hợp lệ. ' : 'Đã nhập xong. '}
              {result.totalRows} dòng: {result.productsCreated} sản phẩm mới, {result.productsUpdated} sản
              phẩm cập nhật, {result.variantsCreated} biến thể mới, {result.variantsUpdated} biến thể cập
              nhật.
            </p>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between">
                <p role="alert" className="text-red-700">
                  Có {result.errors.length} lỗi; chưa nhập dòng nào.
                </p>
                {result.errorReportCsv && (
                  <Button
                    variant="secondary"
                    onClick={() => downloadText(`loi-${file?.name ?? 'import.csv'}`, result.errorReportCsv!)}
                  >
                    Tải file lỗi
                  </Button>
                )}
              </div>
              <table className="w-full text-left text-sm" aria-label="Lỗi nhập">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-1">Dòng</th>
                    <th>Cột</th>
                    <th>Lỗi</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((e, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="py-1">{e.line}</td>
                      <td className="font-mono">{e.field ?? '—'}</td>
                      <td>{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {result.warnings.map((w) => (
            <p key={`${w.sku}-${w.price}`} className="text-sm text-amber-700">
              ⚠ {w.message}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
