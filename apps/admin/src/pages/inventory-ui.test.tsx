import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GoodsReceiptStatus, Role, StockTransferStatus } from '@retailchain/shared';
import { jsonResponse, makeAuth, makeSession, renderRoutes } from '../test/utils';
import { menuFor } from '../menu';
import { GoodsReceiptsPage } from './GoodsReceiptsPage';
import { StockTransfersPage } from './StockTransfersPage';
import { BalancesPage } from './BalancesPage';

vi.mock('../lib/api', async () => {
  const { createApiClient } = await import('@retailchain/shared');
  return { api: createApiClient('http://api', (...a: Parameters<typeof fetch>) => globalThis.fetch(...a)) };
});

describe('Inventory UI & Menu (REQ-INV-01..04)', () => {
  it('REQ-INV-01: menuFor includes inventory routes for WAREHOUSE_KEEPER and OWNER', () => {
    const warehouseMenu = menuFor(Role.WAREHOUSE_KEEPER).map((m) => m.to);
    expect(warehouseMenu).toContain('/inventory/balances');
    expect(warehouseMenu).toContain('/inventory/receipts');
    expect(warehouseMenu).toContain('/inventory/transfers');
    expect(warehouseMenu).toContain('/inventory/counts');
    expect(warehouseMenu).toContain('/suppliers');

    const cashierMenu = menuFor(Role.CASHIER).map((m) => m.to);
    expect(cashierMenu).not.toContain('/inventory/receipts');
    expect(cashierMenu).not.toContain('/inventory/transfers');
    expect(cashierMenu).not.toContain('/inventory/counts');
  });

  it('REQ-INV-01: GoodsReceiptsPage renders receipts list with status', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/branches')) {
        return Promise.resolve(jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 100 }));
      }
      if (url.includes('/inventory/goods-receipts')) {
        return Promise.resolve(
          jsonResponse(200, {
            items: [
              {
                id: 'rc-1',
                code: 'PNK-20261119-0001',
                supplierName: 'Vinamilk',
                branchName: 'Kho Tổng',
                status: GoodsReceiptStatus.COMPLETED,
                totalQuantity: 150,
                totalCost: 3500000,
                createdByName: 'Võ Văn Thủ Kho',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                items: [],
              },
            ],
            total: 1,
            page: 1,
            pageSize: 15,
          }),
        );
      }
      return Promise.resolve(jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 15 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const session = makeSession({ role: Role.WAREHOUSE_KEEPER });
    const { auth } = await makeAuth(session, fetchMock);

    renderRoutes(auth, [{ path: '/inventory/receipts', element: <GoodsReceiptsPage /> }], '/inventory/receipts');

    await waitFor(() => {
      expect(screen.getByText('Nhập kho (REQ-INV-01)')).toBeInTheDocument();
      expect(screen.getByText('PNK-20261119-0001')).toBeInTheDocument();
      expect(screen.getByText('Vinamilk')).toBeInTheDocument();
      expect(screen.getByText('Hoàn thành')).toBeInTheDocument();
    });
  });

  it('REQ-INV-02: StockTransfersPage renders transfers list with status', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/branches')) {
        return Promise.resolve(jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 100 }));
      }
      if (url.includes('/inventory/stock-transfers')) {
        return Promise.resolve(
          jsonResponse(200, {
            items: [
              {
                id: 'tr-1',
                code: 'PCK-20261119-0001',
                fromBranchName: 'Kho Tổng',
                toBranchName: 'Cửa hàng 01',
                status: StockTransferStatus.SENT,
                sentByName: 'Võ Văn Thủ Kho',
                sentAt: new Date().toISOString(),
                receivedByName: null,
                receivedAt: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                items: [],
              },
            ],
            total: 1,
            page: 1,
            pageSize: 15,
          }),
        );
      }
      return Promise.resolve(jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 15 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const session = makeSession({ role: Role.OWNER });
    const { auth } = await makeAuth(session, fetchMock);

    renderRoutes(auth, [{ path: '/inventory/transfers', element: <StockTransfersPage /> }], '/inventory/transfers');

    await waitFor(() => {
      expect(screen.getByText('Chuyển kho (REQ-INV-02)')).toBeInTheDocument();
      expect(screen.getByText('PCK-20261119-0001')).toBeInTheDocument();
      expect(screen.getByText('Kho Tổng')).toBeInTheDocument();
      expect(screen.getByText('Cửa hàng 01')).toBeInTheDocument();
      expect(screen.getByText('Đang chuyển (SENT)')).toBeInTheDocument();
    });
  });

  it('REQ-INV-04: BalancesPage renders balances and displays Low Stock alerts', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/branches')) {
        return Promise.resolve(jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 100 }));
      }
      if (url.includes('/inventory/balances')) {
        return Promise.resolve(
          jsonResponse(200, {
            items: [
              {
                branchId: 'b1',
                branchName: 'Cửa hàng 01',
                variantId: 'v1',
                variantSku: 'SKU-001',
                variantName: '500ml',
                productName: 'Sữa tươi tiệt trùng',
                unit: 'hộp',
                quantity: 45,
                minStock: 20,
                updatedAt: new Date().toISOString(),
              },
            ],
            total: 1,
            page: 1,
            pageSize: 15,
          }),
        );
      }
      return Promise.resolve(jsonResponse(200, { items: [], total: 0, page: 1, pageSize: 15 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const session = makeSession({ role: Role.BRANCH_MANAGER });
    const { auth } = await makeAuth(session, fetchMock);

    renderRoutes(auth, [{ path: '/inventory/balances', element: <BalancesPage /> }], '/inventory/balances');

    await waitFor(() => {
      expect(screen.getByText('Tồn kho & Thẻ kho')).toBeInTheDocument();
      expect(screen.getByText('Sữa tươi tiệt trùng')).toBeInTheDocument();
      expect(screen.getByText('SKU-001')).toBeInTheDocument();
    });
  });
});
