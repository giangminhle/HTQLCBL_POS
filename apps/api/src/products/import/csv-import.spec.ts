import { ConflictException } from '@nestjs/common';
import { IMPORT_COLUMNS, IMPORT_MAX_ROWS } from '@retailchain/shared';
import { buildErrorReport, buildGroups, importTemplateCsv, parseCsv } from './csv-import.parser';
import { importFailureMessage } from './products-import.service';

const HEADER = IMPORT_COLUMNS.join(',');
const csv = (...lines: string[]) => Buffer.from([HEADER, ...lines].join('\n'), 'utf8');

describe('parseCsv (REQ-PRD-01)', () => {
  it('REQ-PRD-01: reads UTF-8 with BOM and keeps Vietnamese text', () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), csv('MI,Mì Hảo Hảo,,gói,4500,,,,,,,,,,')]);
    const parsed = parseCsv(buf);
    expect(parsed.errors).toEqual([]);
    expect(parsed.records[0]?.values.product_name).toBe('Mì Hảo Hảo');
    expect(parsed.records[0]?.line).toBe(2);
  });

  it('REQ-PRD-01: reads UTF-8 without BOM and semicolon-separated files (Excel VN)', () => {
    const text = [IMPORT_COLUMNS.join(';'), 'MI;Mì;;gói;4500;;;;;;;;;;'].join('\r\n');
    const parsed = parseCsv(Buffer.from(text));
    expect(parsed.errors).toEqual([]);
    expect(parsed.records[0]?.values.unit).toBe('gói');
  });

  it('REQ-PRD-01: reports missing required and unknown columns on line 1', () => {
    const parsed = parseCsv(Buffer.from('product_sku,ten_sai\nA,b\n'));
    expect(parsed.errors.every((e) => e.line === 1)).toBe(true);
    expect(parsed.errors.map((e) => e.message).join(' ')).toMatch(/ten_sai/);
    expect(parsed.errors.map((e) => e.field)).toEqual(
      expect.arrayContaining(['product_name', 'unit', 'default_price']),
    );
  });

  it(`REQ-PRD-01: refuses more than ${IMPORT_MAX_ROWS} data rows`, () => {
    const rows = Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => `S${i},N,,cái,1000,,,,,,,,,,`);
    const parsed = parseCsv(csv(...rows));
    expect(parsed.errors[0]?.message).toMatch(/tối đa 5000/);
  });

  it('REQ-PRD-01: the downloadable template is itself valid', () => {
    const parsed = parseCsv(Buffer.from(importTemplateCsv()));
    expect(parsed.errors).toEqual([]);
    expect(buildGroups(parsed.records).errors).toEqual([]);
  });
});

describe('buildGroups (REQ-PRD-01)', () => {
  it('REQ-PRD-01: groups rows by product_sku into one product with several variants', () => {
    const { groups, errors } = buildGroups(
      parseCsv(
        csv(
          'DG,Dầu gội,Mỹ phẩm > Tóc,chai,95000,70000,5,DG-180,DG 180ml,dung tích=180ml,55000,40000,,2000000000015,1',
          'DG,,,,,,,DG-370,DG 370ml,dung tích=370ml,,,,2000000000022|SP-370,1',
        ),
      ).records,
    );
    expect(errors).toEqual([]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.product).toMatchObject({
      sku: 'DG',
      defaultPrice: 95_000,
      categoryPath: 'Mỹ phẩm > Tóc',
    });
    expect(groups[0]?.variants.map((v) => v.input.sku)).toEqual(['DG-180', 'DG-370']);
    expect(groups[0]?.variants[1]?.input).toMatchObject({
      price: null,
      barcodes: ['2000000000022', 'SP-370'],
    });
  });

  it('REQ-PRD-01: a product without variant columns gets a default variant with the product SKU', () => {
    const { groups } = buildGroups(parseCsv(csv('MI,Mì,,gói,4500,,,,,,,,,2000000000039,')).records);
    expect(groups[0]?.variants[0]?.input).toMatchObject({
      sku: 'MI',
      name: 'Mì',
      barcodes: ['2000000000039'],
    });
  });

  it('REQ-PRD-01: reports each problem with its line and column', () => {
    const { errors } = buildGroups(
      parseCsv(
        csv(
          'A1,Hàng A,,cái,45.000,,,,,,,,,,', // line 2: price with a dot
          'B1,Hàng B,,cái,1000,,,,,,,,,4006381333932,', // line 3: bad EAN-13 check digit
          ',Không SKU,,cái,1000,,,,,,,,,,', // line 4
          'C1,Hàng C,,cái,1000,,,,,,,,,2000000000015,', // line 5
          'D1,Hàng D,,cái,1000,,,,,,,,,2000000000015,abc', // line 6: duplicate barcode + bad bool
        ),
      ).records,
    );
    const at = (line: number) => errors.filter((e) => e.line === line);
    expect(at(2)[0]).toMatchObject({
      field: 'default_price',
      message: expect.stringContaining('không có dấu chấm'),
    });
    expect(at(3)[0]).toMatchObject({ field: 'barcodes', message: expect.stringContaining('EAN-13') });
    expect(at(4)[0]).toMatchObject({ field: 'product_sku' });
    expect(at(5)).toEqual([]);
    expect(
      at(6)
        .map((e) => e.field)
        .sort(),
    ).toEqual(['barcodes', 'is_active']);
    expect(at(6).find((e) => e.field === 'barcodes')?.message).toMatch(/dòng 5/);
  });

  it('REQ-PRD-01: product-level columns that differ between rows of the same product are errors', () => {
    const { errors } = buildGroups(
      parseCsv(csv('PX,Tên A,,cái,1000,,,PX-1,,,,,,,', 'PX,Tên B,,cái,2000,,,PX-2,,,,,,,')).records,
    );
    expect(errors.map((e) => [e.line, e.field])).toEqual([
      [3, 'product_name'],
      [3, 'default_price'],
    ]);
  });

  it('REQ-PRD-01: several variants require variant_sku on every row', () => {
    const { errors } = buildGroups(parseCsv(csv('PX,Tên,,cái,1000,,,,,,,,,,', 'PX,,,,,,,,,,,,,,')).records);
    expect(errors[0]).toMatchObject({ line: 3, field: 'variant_sku' });
  });
});

describe('buildErrorReport', () => {
  it('REQ-PRD-01: returns the original rows plus a "Lỗi" column, with BOM for Excel', () => {
    const parsed = parseCsv(csv('A1,Hàng A,,cái,45.000,,,,,,,,,,', 'B1,Hàng B,,cái,1000,,,,,,,,,,'));
    const { errors } = buildGroups(parsed.records);
    const report = buildErrorReport(parsed, errors);
    expect(report.startsWith('\uFEFF')).toBe(true);
    const lines = report.slice(1).trim().split(/\r?\n/);
    expect(lines[0]).toMatch(/,Lỗi$/);
    expect(lines[1]).toMatch(/default_price: default_price phải là số nguyên/);
    expect(lines[2]?.endsWith(',')).toBe(true); // row without error keeps an empty "Lỗi" cell
  });
});

describe('importFailureMessage', () => {
  it('REQ-PRD-01: business errors are shown as-is, internal errors never leak details to the client', () => {
    const business = new ConflictException({ code: 'CONFLICT', message: 'SKU sản phẩm X đã tồn tại' });
    expect(importFailureMessage('X', business)).toBe('Sản phẩm X: SKU sản phẩm X đã tồn tại');
    const internal = new Error(
      'Invalid `tx.product.create()` invocation in /app/src/products.service.ts:211',
    );
    const msg = importFailureMessage('X', internal);
    expect(msg).toBe('Sản phẩm X: lỗi hệ thống khi ghi dữ liệu, vui lòng thử lại hoặc báo quản trị');
    expect(msg).not.toMatch(/invocation|\.ts|prisma/i);
  });
});
