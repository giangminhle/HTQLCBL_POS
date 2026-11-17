import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import {
  IMPORT_COLUMNS,
  IMPORT_MAX_ROWS,
  variantInputSchema,
  type ImportError,
  type VariantInput,
} from '@retailchain/shared';
import { z } from 'zod';

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

export interface CsvRecord {
  /** 1-based line in the file (header is line 1). */
  line: number;
  raw: string[];
  values: Partial<Record<ImportColumn, string>>;
}

export interface ParsedCsv {
  header: string[];
  records: CsvRecord[];
  errors: ImportError[];
}

const REQUIRED: ImportColumn[] = ['product_sku', 'product_name', 'unit', 'default_price'];

/**
 * Reads a UTF-8 CSV (with or without BOM, comma or semicolon separated — Excel in Vietnamese locale
 * often saves with ";"). Never throws for content problems: they become line errors.
 */
export function parseCsv(buffer: Buffer): ParsedCsv {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';

  let rows: { record: string[]; info: { lines: number } }[];
  try {
    rows = parse(text, {
      delimiter,
      info: true,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (err) {
    const line = (err as { lines?: number }).lines ?? 1;
    return {
      header: [],
      records: [],
      errors: [{ line, field: null, message: `File CSV lỗi định dạng: ${(err as Error).message}` }],
    };
  }
  if (!rows.length)
    return { header: [], records: [], errors: [{ line: 1, field: null, message: 'File trống' }] };

  const header = rows[0]!.record.map((h) => h.trim().toLowerCase());
  const errors: ImportError[] = [];
  const unknown = header.filter((h) => h && !(IMPORT_COLUMNS as readonly string[]).includes(h));
  if (unknown.length)
    errors.push({ line: 1, field: null, message: `Cột không hợp lệ: ${unknown.join(', ')}` });
  for (const col of REQUIRED) {
    if (!header.includes(col)) errors.push({ line: 1, field: col, message: `Thiếu cột bắt buộc ${col}` });
  }

  const data = rows.slice(1);
  if (data.length > IMPORT_MAX_ROWS) {
    errors.push({
      line: 1,
      field: null,
      message: `File có ${data.length} dòng dữ liệu, tối đa ${IMPORT_MAX_ROWS} dòng mỗi lần`,
    });
  }
  if (!data.length) errors.push({ line: 1, field: null, message: 'File không có dòng dữ liệu nào' });

  const records = data.map(({ record, info }) => {
    const values: Partial<Record<ImportColumn, string>> = {};
    header.forEach((h, i) => {
      if ((IMPORT_COLUMNS as readonly string[]).includes(h))
        values[h as ImportColumn] = (record[i] ?? '').trim();
    });
    return { line: info.lines, raw: record, values };
  });
  return { header: rows[0]!.record, records, errors };
}

// ---------- row → product group ----------

export interface ImportGroup {
  sku: string;
  lines: number[];
  product: {
    sku: string;
    name: string;
    categoryPath: string | null;
    unit: string;
    defaultPrice: number;
    costPrice: number;
    minStock: number;
    isActive: boolean;
  };
  variants: { line: number; input: VariantInput }[];
}

const err = (line: number, field: ImportColumn | null, message: string): ImportError => ({
  line,
  field,
  message,
});

function parseInt0(
  v: string | undefined,
  line: number,
  field: ImportColumn,
  errors: ImportError[],
  required: boolean,
) {
  const s = (v ?? '').replace(/\s/g, '');
  if (!s) {
    if (required) errors.push(err(line, field, `${field} là bắt buộc`));
    return null;
  }
  if (!/^\d+$/.test(s)) {
    errors.push(
      err(line, field, `${field} phải là số nguyên không âm, không có dấu chấm/phẩy (ví dụ 45000)`),
    );
    return null;
  }
  const n = Number(s);
  if (n > 2_000_000_000) {
    errors.push(err(line, field, `${field} quá lớn`));
    return null;
  }
  return n;
}

function parseBool(v: string | undefined, line: number, errors: ImportError[]): boolean {
  const s = (v ?? '').trim().toLowerCase();
  if (['', '1', 'true', 'có', 'co', 'x', 'yes'].includes(s)) return true;
  if (['0', 'false', 'không', 'khong', 'no'].includes(s)) return false;
  errors.push(err(line, 'is_active', 'is_active chỉ nhận 1/0, true/false, có/không'));
  return true;
}

function parseAttributes(v: string | undefined, line: number, errors: ImportError[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (v ?? '')
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)) {
    const [k, ...rest] = part.split('=');
    if (!k?.trim() || !rest.length) {
      errors.push(
        err(line, 'attributes', `attributes phải có dạng ten=giatri;ten2=giatri2 (lỗi ở "${part}")`),
      );
      continue;
    }
    out[k.trim()] = rest.join('=').trim();
  }
  return out;
}

const zodIssuesToErrors = (line: number, issues: z.ZodIssue[]): ImportError[] =>
  issues.map((i) => {
    const key = String(i.path[0] ?? '');
    const field: Record<string, ImportColumn> = {
      sku: 'variant_sku',
      name: 'variant_name',
      price: 'variant_price',
      costPrice: 'variant_cost_price',
      minStock: 'variant_min_stock',
      barcodes: 'barcodes',
      attributes: 'attributes',
    };
    return err(line, field[key] ?? null, i.message);
  });

/**
 * Groups rows by product_sku (one row per variant) and validates formats. Product-level columns must be
 * identical on every row of a product (or left empty on the following rows).
 */
export function buildGroups(records: CsvRecord[]): { groups: ImportGroup[]; errors: ImportError[] } {
  const errors: ImportError[] = [];
  const groups = new Map<string, ImportGroup>();
  const variantSkuLine = new Map<string, number>();
  const barcodeLine = new Map<string, number>();

  for (const { line, values: v } of records) {
    const productSku = (v.product_sku ?? '').toUpperCase();
    if (!productSku) {
      errors.push(err(line, 'product_sku', 'product_sku là bắt buộc'));
      continue;
    }
    const rowErrors: ImportError[] = [];
    const product = {
      sku: productSku,
      name: v.product_name ?? '',
      categoryPath: v.category ? v.category : null,
      unit: v.unit ?? '',
      defaultPrice:
        parseInt0(v.default_price, line, 'default_price', rowErrors, !groups.has(productSku)) ?? 0,
      costPrice: parseInt0(v.cost_price, line, 'cost_price', rowErrors, false) ?? 0,
      minStock: parseInt0(v.min_stock, line, 'min_stock', rowErrors, false) ?? 0,
      isActive: parseBool(v.is_active, line, rowErrors),
    };

    let group = groups.get(productSku);
    if (!group) {
      if (!product.name) rowErrors.push(err(line, 'product_name', 'product_name là bắt buộc'));
      if (!product.unit) rowErrors.push(err(line, 'unit', 'unit là bắt buộc'));
      if (!/^[A-Z0-9._-]{2,40}$/.test(productSku)) {
        rowErrors.push(
          err(line, 'product_sku', 'product_sku 2–40 ký tự: chữ, số, dấu chấm, gạch ngang, gạch dưới'),
        );
      }
      group = { sku: productSku, lines: [], product, variants: [] };
      groups.set(productSku, group);
    } else {
      const first = group.lines[0];
      const mismatch = (field: ImportColumn, a: unknown, b: unknown, given: string | undefined) => {
        if (given && a !== b)
          rowErrors.push(err(line, field, `${field} khác với dòng ${first} của cùng sản phẩm`));
      };
      mismatch('product_name', product.name, group.product.name, v.product_name);
      mismatch('category', product.categoryPath, group.product.categoryPath, v.category);
      mismatch('unit', product.unit, group.product.unit, v.unit);
      mismatch('default_price', product.defaultPrice, group.product.defaultPrice, v.default_price);
      mismatch('cost_price', product.costPrice, group.product.costPrice, v.cost_price);
    }
    group.lines.push(line);

    const variantSku = (v.variant_sku ?? '').toUpperCase() || productSku;
    if (!v.variant_sku && group.variants.length + 1 > 1) {
      rowErrors.push(err(line, 'variant_sku', 'Sản phẩm có nhiều biến thể thì mỗi dòng phải có variant_sku'));
    }
    const prevSku = variantSkuLine.get(variantSku);
    if (prevSku)
      rowErrors.push(err(line, 'variant_sku', `variant_sku ${variantSku} trùng với dòng ${prevSku}`));
    variantSkuLine.set(variantSku, line);

    const barcodes = (v.barcodes ?? '')
      .split('|')
      .map((b) => b.trim())
      .filter(Boolean);
    for (const code of barcodes) {
      const prev = barcodeLine.get(code);
      if (prev) rowErrors.push(err(line, 'barcodes', `Mã vạch ${code} trùng với dòng ${prev}`));
      barcodeLine.set(code, line);
    }

    const parsed = variantInputSchema.safeParse({
      sku: variantSku,
      name: v.variant_name || group.product.name || product.name,
      attributes: parseAttributes(v.attributes, line, rowErrors),
      price: parseInt0(v.variant_price, line, 'variant_price', rowErrors, false),
      costPrice: parseInt0(v.variant_cost_price, line, 'variant_cost_price', rowErrors, false),
      minStock: parseInt0(v.variant_min_stock, line, 'variant_min_stock', rowErrors, false),
      isActive: true,
      barcodes,
    });
    if (!parsed.success) rowErrors.push(...zodIssuesToErrors(line, parsed.error.issues));
    else group.variants.push({ line, input: parsed.data });

    errors.push(...rowErrors);
  }
  return { groups: [...groups.values()], errors };
}

/** Original CSV + a "Lỗi" column listing every error of that row. UTF-8 BOM so Excel shows Vietnamese. */
export function buildErrorReport(parsed: ParsedCsv, errors: ImportError[]): string {
  const byLine = new Map<number, string[]>();
  for (const e of errors) {
    const msg = e.field ? `${e.field}: ${e.message}` : e.message;
    byLine.set(e.line, [...(byLine.get(e.line) ?? []), msg]);
  }
  const rows = [
    [...parsed.header, 'Lỗi'],
    ...parsed.records.map((r) => [...r.raw, (byLine.get(r.line) ?? []).join(' | ')]),
  ];
  const headerErrors = byLine.get(1);
  if (headerErrors?.length) rows[0] = [...parsed.header, `Lỗi (tiêu đề): ${headerErrors.join(' | ')}`];
  return '\uFEFF' + stringify(rows);
}

/** Template offered for download on the import screen. */
export function importTemplateCsv(): string {
  return (
    '\uFEFF' +
    stringify([
      [...IMPORT_COLUMNS],
      [
        'DG-CLEAR',
        'Dầu gội Clear Mát lạnh',
        'Mỹ phẩm > Chăm sóc tóc',
        'chai',
        '95000',
        '70000',
        '10',
        'DG-CLEAR-180',
        'Dầu gội Clear 180ml',
        'dung tích=180ml',
        '55000',
        '40000',
        '',
        '2000000000015',
        '1',
      ],
      [
        'DG-CLEAR',
        '',
        '',
        '',
        '',
        '',
        '',
        'DG-CLEAR-370',
        'Dầu gội Clear 370ml',
        'dung tích=370ml',
        '',
        '',
        '',
        '2000000000022|SP-CLEAR-370',
        '1',
      ],
      [
        'MI-HH-TOM',
        'Mì Hảo Hảo tôm chua cay',
        'Thực phẩm > Mì gói',
        'gói',
        '4500',
        '3600',
        '50',
        '',
        '',
        '',
        '',
        '',
        '',
        '2000000000039',
        '1',
      ],
    ])
  );
}
