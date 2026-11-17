import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError, IMPORT_COLUMNS } from '@retailchain/shared';
import { buildProductPayload } from '../components/ProductForm';
import { parseAttributes, parseMoney, priceListStatus } from '../lib/format';
import { jsonResponse, makeAuth, makeSession, renderRoutes } from '../test/utils';
import { buildTree } from './CategoriesPage';
import { ImportPage } from './ImportPage';
import { overlapMessage } from './PriceListsPage';

vi.mock('../lib/api', async () => {
  const { createApiClient } = await import('@retailchain/shared');
  return { api: createApiClient('http://api', (...a: Parameters<typeof fetch>) => globalThis.fetch(...a)) };
});

const form = {
  sku: 'son-x',
  name: 'Son X',
  categoryId: '',
  unit: 'cây',
  defaultPrice: '200000',
  costPrice: '150000',
  minStock: '0',
  isActive: true,
};
const row = (over: Record<string, unknown> = {}) => ({
  key: 'k',
  sku: '',
  name: '',
  attributes: '',
  price: '',
  costPrice: '',
  minStock: '',
  barcodes: '',
  isActive: true,
  ...over,
});

describe('ProductForm payload (REQ-PRD-01)', () => {
  it('REQ-PRD-01: empty variant SKU/name fall back to the product; empty prices are null (CR-004)', () => {
    const { payload, errors } = buildProductPayload(form, [row({ barcodes: '2000000000015, SON-X-01' })]);
    expect(errors).toEqual({});
    expect(payload).toMatchObject({
      sku: 'SON-X',
      defaultPrice: 200000,
      variants: [
        {
          sku: 'SON-X',
          name: 'Son X',
          price: null,
          costPrice: null,
          barcodes: ['2000000000015', 'SON-X-01'],
        },
      ],
    });
  });

  it('REQ-PRD-01: flags a wrong EAN-13 check digit, bad attributes and non-integer money per variant row', () => {
    const { errors, payload } = buildProductPayload({ ...form, defaultPrice: '45,5' }, [
      row({ barcodes: '4006381333932', attributes: 'màu Đỏ', price: '1.000' }),
    ]);
    expect(payload).toBeUndefined();
    expect(errors['v0.barcodes']).toMatch(/EAN-13/);
    expect(errors['v0.attributes']).toBeDefined();
    expect(errors.defaultPrice).toBeDefined();
    expect(errors['v0.price']).toBeUndefined(); // "1.000" = 1000 (dots are thousand separators)
  });

  it('REQ-PRD-01: at least one active variant is required', () => {
    expect(buildProductPayload(form, [row({ isActive: false })]).errors.variants).toBeDefined();
  });
});

describe('format helpers', () => {
  it('REQ-PRC-01: money is integer VND; dots/spaces are thousand separators', () => {
    expect(parseMoney('45.000')).toBe(45000);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('4,5')).toBeNaN();
    expect(parseAttributes('dung tích=180ml; màu=Đỏ')).toEqual({ 'dung tích': '180ml', màu: 'Đỏ' });
  });

  it('REQ-PRC-01: price list status follows the half-open window [from, to)', () => {
    const now = new Date('2026-12-15T00:00:00Z');
    const l = (from: string, to: string | null, isActive = true) => ({
      effectiveFrom: from,
      effectiveTo: to,
      isActive,
    });
    expect(priceListStatus(l('2026-12-01T00:00:00Z', null), now)).toBe('active');
    expect(priceListStatus(l('2026-12-01T00:00:00Z', '2026-12-15T00:00:00Z'), now)).toBe('expired');
    expect(priceListStatus(l('2026-12-15T00:00:01Z', null), now)).toBe('upcoming');
    expect(priceListStatus(l('2026-12-01T00:00:00Z', null, false), now)).toBe('inactive');
  });

  it('REQ-PRC-01: 409 overlap error names the conflicting price list', () => {
    const err = new ApiRequestError(409, {
      code: 'PRICE_LIST_OVERLAP',
      message: 'x',
      details: {
        conflicts: [
          { id: '1', name: 'Giá Quận 1', effectiveFrom: '2026-12-01T00:00:00Z', effectiveTo: null },
        ],
      },
    });
    expect(overlapMessage(err)).toMatch(/"Giá Quận 1".*vô thời hạn/);
    expect(overlapMessage(new Error('x'))).toBeNull();
  });

  it('REQ-PRD-01: category tree nests children under parents', () => {
    const c = (id: string, parentId: string | null, path: string) => ({
      id,
      name: id,
      parentId,
      path,
      sortOrder: 0,
      isActive: true,
      createdAt: '',
      updatedAt: '',
    });
    const tree = buildTree([c('a', null, '/a/'), c('b', 'a', '/a/b/'), c('c', 'b', '/a/b/c/')]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.children[0]?.children[0]?.id).toBe('c');
  });
});

describe('ImportPage (REQ-PRD-01)', () => {
  const okResult = {
    dryRun: true,
    ok: true,
    totalRows: 2,
    productsCreated: 1,
    productsUpdated: 0,
    variantsCreated: 2,
    variantsUpdated: 0,
    errors: [],
    warnings: [],
  };
  const failResult = {
    ...okResult,
    ok: false,
    errors: [{ line: 3, field: 'barcodes', message: 'Mã 4006381333932 sai chữ số kiểm tra EAN-13' }],
    errorReportCsv: '﻿product_sku,Lỗi\nA,barcodes: sai\n',
  };

  async function setup(responses: object[]) {
    const fetchMock = vi.fn();
    for (const r of responses) fetchMock.mockResolvedValueOnce(jsonResponse(200, r));
    vi.stubGlobal('fetch', fetchMock);
    const { auth } = await makeAuth(makeSession());
    renderRoutes(auth, [{ path: '/', element: <ImportPage /> }], '/');
    const file = new File([IMPORT_COLUMNS.join(',')], 'sp.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByLabelText('Chọn file CSV'), { target: { files: [file] } });
    return fetchMock;
  }

  it('REQ-PRD-01: shows the UTF-8 instruction; "Nhập" stays disabled until a successful check', async () => {
    const fetchMock = await setup([okResult, { ...okResult, dryRun: false }]);
    expect(screen.getByText(/CSV UTF-8/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nhập' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra' }));
    expect(await screen.findByText(/File hợp lệ/)).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('dryRun=true');
    fireEvent.click(screen.getByRole('button', { name: 'Nhập' }));
    expect(await screen.findByText(/Đã nhập xong/)).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('dryRun=false');
  });

  it('REQ-PRD-01: errors are listed per line with a downloadable error file; nothing can be committed', async () => {
    await setup([failResult]);
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Có 1 lỗi; chưa nhập dòng nào');
    const table = screen.getByRole('table', { name: 'Lỗi nhập' });
    expect(table).toHaveTextContent('3');
    expect(table).toHaveTextContent('EAN-13');
    expect(screen.getByRole('button', { name: 'Tải file lỗi' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nhập' })).toBeDisabled());
  });
});
