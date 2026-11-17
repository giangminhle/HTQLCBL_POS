import {
  GoodsReceiptStatus,
  Role,
  StockCountStatus,
  StockMovementType,
  StockTransferStatus,
} from '@retailchain/shared';
import type { AuthUser } from '@retailchain/shared';
import { InventoryService } from './inventory.service';
import { GoodsReceiptsService } from './goods-receipts.service';
import { StockTransfersService } from './stock-transfers.service';
import { StockCountsService } from './stock-counts.service';

describe('Inventory Module (REQ-INV-01..04)', () => {
  const ownerUser: AuthUser = {
    id: '11111111-1111-1111-1111-111111111111',
    username: 'owner',
    fullName: 'Chu Chuoi',
    role: Role.OWNER,
    branchId: null,
    mustChangePassword: false,
  };

  const branchUser: AuthUser = {
    id: '22222222-2222-2222-2222-222222222222',
    username: 'keeper_ch01',
    fullName: 'Thu Kho CH01',
    role: Role.WAREHOUSE_KEEPER,
    branchId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    mustChangePassword: false,
  };

  describe('InventoryService.applyMovements (REQ-INV-01..04)', () => {
    it('REQ-INV-01: throws badRequest if movement quantity is 0', async () => {
      const service = new InventoryService({} as never, {} as never, {} as never, {} as never, {} as never);

      await expect(
        service.applyMovements([
          {
            branchId: 'b1',
            variantId: 'v1',
            type: StockMovementType.IMPORT,
            quantity: 0,
            createdBy: ownerUser.id,
          },
        ]),
      ).rejects.toThrow('Số lượng biến động kho không được bằng 0');
    });

    it('REQ-INV-01: executes row lock and updates balance in transaction', async () => {
      const txMock = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        $queryRaw: jest.fn().mockResolvedValue([{ quantity: 10 }]),
        stockMovement: {
          createMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };

      const prismaMock = {
        $transaction: jest.fn(async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
      };

      const service = new InventoryService(
        prismaMock as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );

      await service.applyMovements([
        {
          branchId: 'b1',
          variantId: 'v1',
          type: StockMovementType.IMPORT,
          quantity: 50,
          refType: 'GoodsReceipt',
          refId: 'r1',
          createdBy: ownerUser.id,
        },
      ]);

      expect(txMock.$executeRaw).toHaveBeenCalled();
      expect(txMock.$queryRaw).toHaveBeenCalled();
      expect(txMock.stockMovement.createMany).toHaveBeenCalledWith({
        data: [
          {
            branchId: 'b1',
            variantId: 'v1',
            type: StockMovementType.IMPORT,
            quantity: 50,
            refType: 'GoodsReceipt',
            refId: 'r1',
            createdBy: ownerUser.id,
          },
        ],
      });
    });
  });

  describe('GoodsReceiptsService (REQ-INV-01)', () => {
    it('REQ-INV-01: complete() applies IMPORT movements and marks COMPLETED', async () => {
      const mockReceipt = {
        id: 'receipt-1',
        branchId: branchUser.branchId!,
        status: GoodsReceiptStatus.DRAFT,
        items: [{ variantId: 'v1', quantity: 20, unitCost: 15000 }],
        supplier: { id: 's1', name: 'NCC ABC', code: 'NCC-01' },
        createdBy: branchUser.id,
      };

      const txMock = {
        goodsReceipt: {
          update: jest.fn().mockResolvedValue({ ...mockReceipt, status: GoodsReceiptStatus.COMPLETED }),
        },
      };

      const prismaMock = {
        goodsReceipt: {
          findUnique: jest.fn().mockResolvedValue(mockReceipt),
        },
        $transaction: jest.fn(async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
      };

      const inventoryMock = {
        applyMovements: jest.fn().mockResolvedValue(undefined),
      };

      const branchesMock = {
        describeBranches: jest.fn().mockResolvedValue(new Map([[branchUser.branchId!, { name: 'CH 01' }]])),
      };
      const usersMock = {
        describeUsers: jest.fn().mockResolvedValue(new Map([[branchUser.id, { fullName: 'Thu Kho' }]])),
      };
      const productsMock = {
        describeVariants: jest.fn().mockResolvedValue(new Map([['v1', { sku: 'SKU1', name: 'Variant 1' }]])),
      };
      const snapshotsMock = { register: jest.fn() };

      const service = new GoodsReceiptsService(
        prismaMock as never,
        inventoryMock as never,
        branchesMock as never,
        productsMock as never,
        usersMock as never,
        snapshotsMock as never,
      );

      // Mock get() which is called at the end of complete()
      jest.spyOn(service, 'get').mockResolvedValue({
        id: 'receipt-1',
        code: 'PNK-001',
        supplierId: 's1',
        branchId: branchUser.branchId!,
        note: null,
        status: GoodsReceiptStatus.COMPLETED,
        createdBy: branchUser.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        items: [],
      });

      await service.complete(branchUser, 'receipt-1');

      expect(txMock.goodsReceipt.update).toHaveBeenCalledWith({
        where: { id: 'receipt-1' },
        data: { status: GoodsReceiptStatus.COMPLETED },
      });
      expect(inventoryMock.applyMovements).toHaveBeenCalledWith(
        [
          {
            branchId: branchUser.branchId!,
            variantId: 'v1',
            type: StockMovementType.IMPORT,
            quantity: 20,
            refType: 'GoodsReceipt',
            refId: 'receipt-1',
            createdBy: branchUser.id,
          },
        ],
        txMock,
      );
    });
  });

  describe('StockTransfersService (REQ-INV-02)', () => {
    it('REQ-INV-02: send() applies TRANSFER_OUT with negative quantity', async () => {
      const fromBranch = branchUser.branchId!;
      const toBranch = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
      const mockTransfer = {
        id: 'transfer-1',
        fromBranchId: fromBranch,
        toBranchId: toBranch,
        status: StockTransferStatus.DRAFT,
        items: [{ id: 'item-1', variantId: 'v1', sentQuantity: 5 }],
      };

      const txMock = {
        stockBalance: {
          findMany: jest.fn().mockResolvedValue([{ variantId: 'v1', quantity: 10 }]),
        },
        stockTransfer: {
          update: jest.fn().mockResolvedValue({ ...mockTransfer, status: StockTransferStatus.SENT }),
        },
      };

      const prismaMock = {
        stockTransfer: {
          findUnique: jest.fn().mockResolvedValue(mockTransfer),
        },
        $transaction: jest.fn(async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
      };

      const inventoryMock = {
        applyMovements: jest.fn().mockResolvedValue(undefined),
      };

      const service = new StockTransfersService(
        prismaMock as never,
        inventoryMock as never,
        {} as never,
        {} as never,
        {} as never,
        { register: jest.fn() } as never,
      );

      jest.spyOn(service, 'get').mockResolvedValue({} as never);

      await service.send(branchUser, 'transfer-1');

      expect(txMock.stockTransfer.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'transfer-1' },
          data: expect.objectContaining({ status: StockTransferStatus.SENT }),
        }),
      );
      expect(inventoryMock.applyMovements).toHaveBeenCalledWith(
        [
          {
            branchId: fromBranch,
            variantId: 'v1',
            type: StockMovementType.TRANSFER_OUT,
            quantity: -5,
            refType: 'StockTransfer',
            refId: 'transfer-1',
            createdBy: branchUser.id,
          },
        ],
        txMock,
      );
    });

    it('REQ-INV-02: receive() applies TRANSFER_IN with actual receivedQuantity and records shortage', async () => {
      const fromBranch = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
      const toBranch = branchUser.branchId!;
      const mockTransfer = {
        id: 'transfer-2',
        fromBranchId: fromBranch,
        toBranchId: toBranch,
        status: StockTransferStatus.SENT,
        items: [{ id: 'item-1', variantId: 'v1', sentQuantity: 10, receivedQuantity: null }],
      };

      const txMock = {
        stockTransferItem: {
          update: jest.fn().mockResolvedValue({}),
        },
        stockTransfer: {
          update: jest.fn().mockResolvedValue({ ...mockTransfer, status: StockTransferStatus.RECEIVED }),
        },
      };

      const prismaMock = {
        stockTransfer: {
          findUnique: jest.fn().mockResolvedValue(mockTransfer),
        },
        $transaction: jest.fn(async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
      };

      const inventoryMock = {
        applyMovements: jest.fn().mockResolvedValue(undefined),
      };

      const service = new StockTransfersService(
        prismaMock as never,
        inventoryMock as never,
        {} as never,
        {} as never,
        {} as never,
        { register: jest.fn() } as never,
      );

      jest.spyOn(service, 'get').mockResolvedValue({} as never);

      // Sent 10, but only received 8 (shortage of 2)
      await service.receive(branchUser, 'transfer-2', {
        items: [{ itemId: 'item-1', receivedQuantity: 8 }],
      });

      expect(txMock.stockTransferItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { receivedQuantity: 8 },
      });

      expect(inventoryMock.applyMovements).toHaveBeenCalledWith(
        [
          {
            branchId: toBranch,
            variantId: 'v1',
            type: StockMovementType.TRANSFER_IN,
            quantity: 8,
            refType: 'StockTransfer',
            refId: 'transfer-2',
            createdBy: branchUser.id,
          },
        ],
        txMock,
      );
    });
  });

  describe('StockCountsService (REQ-INV-03)', () => {
    it('REQ-INV-03: complete() calculates discrepancy and creates ADJUSTMENT movements', async () => {
      const branchId = branchUser.branchId!;
      const mockCount = {
        id: 'count-1',
        branchId,
        status: StockCountStatus.DRAFT,
        items: [
          // Item 1: system has 10, counted 12 -> delta +2
          { id: 'item-1', variantId: 'v1', systemQuantity: 10, actualQuantity: 12 },
          // Item 2: system has 5, counted 3 -> delta -2
          { id: 'item-2', variantId: 'v2', systemQuantity: 5, actualQuantity: 3 },
          // Item 3: system has 7, counted 7 -> delta 0 (no movement)
          { id: 'item-3', variantId: 'v3', systemQuantity: 7, actualQuantity: 7 },
        ],
      };

      const txMock = {
        stockCount: {
          update: jest.fn().mockResolvedValue({ ...mockCount, status: StockCountStatus.COMPLETED }),
        },
      };

      const prismaMock = {
        stockCount: {
          findUnique: jest.fn().mockResolvedValue(mockCount),
        },
        $transaction: jest.fn(async (cb: (tx: typeof txMock) => Promise<unknown>) => cb(txMock)),
      };

      const inventoryMock = {
        applyMovements: jest.fn().mockResolvedValue(undefined),
      };

      const service = new StockCountsService(
        prismaMock as never,
        inventoryMock as never,
        {} as never,
        {} as never,
        {} as never,
        { register: jest.fn() } as never,
      );

      jest.spyOn(service, 'get').mockResolvedValue({} as never);

      await service.complete(branchUser, 'count-1');

      expect(inventoryMock.applyMovements).toHaveBeenCalledWith(
        [
          {
            branchId,
            variantId: 'v1',
            type: StockMovementType.ADJUSTMENT,
            quantity: 2,
            refType: 'StockCount',
            refId: 'count-1',
            createdBy: branchUser.id,
          },
          {
            branchId,
            variantId: 'v2',
            type: StockMovementType.ADJUSTMENT,
            quantity: -2,
            refType: 'StockCount',
            refId: 'count-1',
            createdBy: branchUser.id,
          },
        ],
        txMock,
      );
    });
  });

  describe('Low Stock Alert (REQ-INV-04)', () => {
    it('REQ-INV-04: detects variants below minStock', async () => {
      const branchId = branchUser.branchId!;
      const prismaMock = {
        stockBalance: {
          findMany: jest.fn().mockResolvedValue([
            { branchId, variantId: 'v1', quantity: 2 },
            { branchId, variantId: 'v2', quantity: 15 },
          ]),
        },
      };

      const productsMock = {
        getVariantsWithMinStock: jest.fn().mockResolvedValue([
          { id: 'v1', sku: 'SKU1', name: 'Var 1', productName: 'Prod 1', unit: 'Cai', minStock: 10 },
          { id: 'v2', sku: 'SKU2', name: 'Var 2', productName: 'Prod 2', unit: 'Hop', minStock: 5 },
          // v3 has minStock 8 but 0 stock (no balance record)
          { id: 'v3', sku: 'SKU3', name: 'Var 3', productName: 'Prod 3', unit: 'Chai', minStock: 8 },
        ]),
      };

      const branchesMock = {
        describeBranches: jest.fn().mockResolvedValue(new Map([[branchId, { name: 'CH 01' }]])),
      };

      const service = new InventoryService(
        prismaMock as never,
        productsMock as never,
        branchesMock as never,
        {} as never,
        {} as never,
      );

      const result = await service.getLowStock(branchUser, { page: 1, pageSize: 10, branchId });

      expect(result.total).toBe(2);
      expect(result.items).toHaveLength(2);
      expect(result.items.map((i) => i.variantId).sort()).toEqual(['v1', 'v3'].sort());
    });
  });
});
