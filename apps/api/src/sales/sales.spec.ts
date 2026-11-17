import { Role, StockMovementType, uuidv7 } from '@retailchain/shared';
import type { AuthUser } from '@retailchain/shared';
import { SalesService } from './sales.service';
import { ShiftsService } from './shifts.service';

describe('Sales & Shifts Unit Tests (Sprint 4)', () => {
  const ch01Id = '11111111-1111-1111-1111-111111111111';
  const cashierUser: AuthUser = {
    id: '33333333-3333-3333-3333-333333333333',
    username: 'cashier01',
    fullName: 'Thu Ngân 01',
    role: Role.CASHIER,
    branchId: ch01Id,
    mustChangePassword: false,
  };

  describe('ShiftsService', () => {
    let service: ShiftsService;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let prismaMock: Record<string, any>;
    let branchesMock: Record<string, unknown>;
    let usersMock: Record<string, unknown>;

    beforeEach(() => {
      prismaMock = {
        branch: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({ id: ch01Id, code: 'CH-01', name: 'Cửa hàng 1' }),
        },
        shift: {
          count: jest.fn().mockResolvedValue(0),
          findFirst: jest.fn(),
          findUnique: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
          findMany: jest.fn(),
        },
        payment: {
          findMany: jest.fn().mockResolvedValue([]),
        },
        saleReturn: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      branchesMock = {
        describeBranches: jest.fn().mockResolvedValue(new Map([[ch01Id, { name: 'Cửa hàng 1' }]])),
      };
      usersMock = {
        describeUsers: jest.fn().mockResolvedValue(new Map([[cashierUser.id, { fullName: 'Thu Ngân 01' }]])),
      };
      const snapshotMock = { register: jest.fn() };

      service = new ShiftsService(
        prismaMock as never,
        branchesMock as never,
        usersMock as never,
        snapshotMock as never,
      );
    });

    it('REQ-SHF-01: opens a shift with generated code and opening cash', async () => {
      prismaMock.shift.findFirst.mockResolvedValue(null);
      prismaMock.shift.create.mockImplementation((args: { data: Record<string, unknown> }) => ({
        ...args.data,
        id: uuidv7(),
        closingCash: null,
        expectedCash: null,
        difference: null,
        openedAt: new Date(),
        closedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const shift = await service.openShift(cashierUser, { openingCash: 500000 });
      expect(shift.openingCash).toBe(500000);
      expect(shift.status).toBe('OPEN');
      expect(shift.code).toMatch(/^CA-CH01-\d{6}-001$/);
    });

    it('REQ-SHF-01: prevents opening multiple open shifts for the same cashier', async () => {
      prismaMock.shift.findFirst.mockResolvedValue({ id: 'existing-id', code: 'CA-001', status: 'OPEN' });

      await expect(service.openShift(cashierUser, { openingCash: 500000 })).rejects.toThrow(
        /Thu ngân đang có một ca làm việc chưa đóng/,
      );
    });

    it('REQ-SHF-01: closes shift and accurately reconciles cash difference', async () => {
      const shiftId = uuidv7();
      const existingShift = {
        id: shiftId,
        code: 'CA-CH01-261120-001',
        branchId: ch01Id,
        cashierId: cashierUser.id,
        openingCash: 500000,
        closingCash: null,
        expectedCash: null,
        difference: null,
        status: 'OPEN',
        openedAt: new Date(),
        closedAt: null,
        note: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prismaMock.shift.findUnique.mockResolvedValue(existingShift);

      // Payments in shift: 1.000.000 cash, 500.000 QR
      prismaMock.payment.findMany.mockResolvedValue([
        { method: 'CASH', amount: 1000000 },
        { method: 'QR', amount: 500000 },
      ]);
      // Returns in shift: 200.000
      prismaMock.saleReturn.findMany.mockResolvedValue([{ totalRefund: 200000 }]);

      // Expected cash = 500.000 (opening) + 1.000.000 (cash sales) - 200.000 (refunds) = 1.300.000
      // Actual counted cash = 1.250.000 => difference = -50.000
      prismaMock.shift.update.mockImplementation((args: { data: Record<string, unknown> }) => ({
        ...existingShift,
        ...args.data,
      }));

      const closed = await service.closeShift(cashierUser, shiftId, { closingCash: 1250000 });
      expect(closed.expectedCash).toBe(1300000);
      expect(closed.closingCash).toBe(1250000);
      expect(closed.difference).toBe(-50000);
      expect(closed.status).toBe('CLOSED');
    });
  });

  describe('SalesService', () => {
    let service: SalesService;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let prismaMock: Record<string, any>;
    let branchesMock: Record<string, unknown>;
    let usersMock: Record<string, unknown>;
    let productsMock: Record<string, unknown>;
    let inventoryMock: Record<string, unknown>;

    const variant1Id = '55555555-5555-5555-5555-555555555555';
    const shiftId = '66666666-6666-6666-6666-666666666666';

    beforeEach(() => {
      prismaMock = {
        branch: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({ id: ch01Id, code: 'CH-01', name: 'Cửa hàng 1' }),
        },
        shift: {
          findUnique: jest.fn().mockResolvedValue({ id: shiftId, branchId: ch01Id, status: 'OPEN' }),
          findFirst: jest.fn().mockResolvedValue({ id: shiftId, branchId: ch01Id, status: 'OPEN' }),
        },
        sale: {
          findUnique: jest.fn(),
          count: jest.fn().mockResolvedValue(0),
          create: jest.fn(),
          update: jest.fn(),
          findMany: jest.fn(),
        },
        saleItem: {
          update: jest.fn(),
          findMany: jest.fn(),
        },
        saleReturn: {
          create: jest.fn(),
          count: jest.fn().mockResolvedValue(0),
          findUniqueOrThrow: jest.fn(),
        },
        $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prismaMock)),
        $queryRaw: jest.fn().mockResolvedValue([{ value: 1 }]),
      };

      branchesMock = {
        describeBranches: jest.fn().mockResolvedValue(new Map([[ch01Id, { name: 'Cửa hàng 1' }]])),
      };
      usersMock = {
        describeUsers: jest.fn().mockResolvedValue(new Map([[cashierUser.id, { fullName: 'Thu Ngân 01' }]])),
        findForLogin: jest.fn(),
      };
      productsMock = {
        describeVariants: jest.fn().mockResolvedValue(
          new Map([
            [
              variant1Id,
              {
                id: variant1Id,
                productId: 'p1',
                name: 'Đỏ',
                productName: 'Áo thun',
                sku: 'AT-DO',
                unit: 'Cái',
                price: 150000,
                costPrice: 90000,
                minStock: 5,
              },
            ],
          ]),
        ),
      };
      inventoryMock = {
        applyMovements: jest.fn().mockResolvedValue(undefined),
      };
      const snapshotMock = { register: jest.fn() };

      service = new SalesService(
        prismaMock as never,
        branchesMock as never,
        usersMock as never,
        productsMock as never,
        inventoryMock as never,
        snapshotMock as never,
        { verifyAsync: jest.fn().mockRejectedValue(new Error('invalid token')) } as never,
      );
    });

    it('REQ-POS-01, 02: creates sale, records payments and applies SALE movement with negative quantity', async () => {
      const saleId = uuidv7();
      prismaMock.sale.findUnique
        .mockResolvedValueOnce(null) // first check idempotency: does not exist
        .mockResolvedValue({
          // getSale call
          id: saleId,
          code: 'HD-CH01-261120-0001',
          branchId: ch01Id,
          shiftId,
          cashierId: cashierUser.id,
          customerId: null,
          subtotal: 300000,
          discount: 20000,
          total: 280000,
          status: 'COMPLETED',
          note: null,
          createdAtClient: new Date(),
          createdAtServer: new Date(),
          updatedAt: new Date(),
          items: [
            {
              id: uuidv7(),
              saleId,
              variantId: variant1Id,
              quantity: 2,
              unitPrice: 150000,
              discount: 0,
              lineTotal: 300000,
              returnedQuantity: 0,
            },
          ],
          payments: [
            {
              id: uuidv7(),
              saleId,
              method: 'CASH',
              amount: 280000,
              reference: null,
              createdAt: new Date(),
            },
          ],
        });

      const res = await service.createSale(cashierUser, {
        id: saleId,
        branchId: ch01Id,
        shiftId,
        subtotal: 300000,
        discount: 20000,
        total: 280000,
        createdAtClient: new Date().toISOString(),
        items: [{ variantId: variant1Id, quantity: 2, unitPrice: 150000, discount: 0, lineTotal: 300000 }],
        payments: [{ method: 'CASH', amount: 280000 }],
      });

      expect(res.id).toBe(saleId);
      expect(res.total).toBe(280000);
      expect(inventoryMock.applyMovements).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            branchId: ch01Id,
            variantId: variant1Id,
            type: StockMovementType.SALE,
            quantity: -2, // negative!
          }),
        ]),
        expect.anything(),
      );
    });

    it('REQ-POS-01: idempotency returns existing sale without double applying movements', async () => {
      const saleId = uuidv7();
      const existingSale = {
        id: saleId,
        code: 'HD-CH01-261120-0001',
        branchId: ch01Id,
        shiftId,
        cashierId: cashierUser.id,
        subtotal: 150000,
        discount: 0,
        total: 150000,
        status: 'COMPLETED',
        createdAtClient: new Date(),
        createdAtServer: new Date(),
        updatedAt: new Date(),
        items: [],
        payments: [],
      };
      // Already exists in DB
      prismaMock.sale.findUnique.mockResolvedValue(existingSale);

      const res = await service.createSale(cashierUser, {
        id: saleId,
        branchId: ch01Id,
        shiftId,
        subtotal: 150000,
        discount: 0,
        total: 150000,
        createdAtClient: new Date().toISOString(),
        items: [{ variantId: variant1Id, quantity: 1, unitPrice: 150000, discount: 0, lineTotal: 150000 }],
        payments: [{ method: 'CASH', amount: 150000 }],
      });

      expect(res.id).toBe(saleId);
      expect(prismaMock.sale.create).not.toHaveBeenCalled();
      expect(inventoryMock.applyMovements).not.toHaveBeenCalled();
    });

    it('REQ-POS-01: denies discounts over 10 percent without a branch approval token', async () => {
      const saleId = uuidv7();
      prismaMock.sale.findUnique.mockResolvedValue(null);
      await expect(
        service.createSale(cashierUser, {
          id: saleId,
          branchId: ch01Id,
          shiftId,
          subtotal: 80000,
          discount: 0,
          total: 80000,
          createdAtClient: new Date().toISOString(),
          items: [
            { variantId: variant1Id, quantity: 1, unitPrice: 100000, discount: 20000, lineTotal: 80000 },
          ],
          payments: [{ method: 'CASH', amount: 80000 }],
        }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('REQ-POS-01: checks branch access before returning an existing sale', async () => {
      const saleId = uuidv7();
      prismaMock.sale.findUnique.mockResolvedValue({
        id: saleId,
        branchId: ch01Id,
      });
      const cashierBranchB = { ...cashierUser, branchId: '22222222-2222-2222-2222-222222222222' };
      await expect(
        service.createSale(cashierBranchB, {
          id: saleId,
          branchId: cashierBranchB.branchId!,
          shiftId,
          subtotal: 1,
          discount: 0,
          total: 1,
          createdAtClient: new Date().toISOString(),
          items: [{ variantId: variant1Id, quantity: 1, unitPrice: 1, discount: 0, lineTotal: 1 }],
          payments: [{ method: 'CASH', amount: 1 }],
        }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('REQ-POS-02: returns the concurrent winner when sale id conflicts', async () => {
      const saleId = uuidv7();
      const prismaError = Object.assign(new Error('unique constraint'), {
        code: 'P2002',
        meta: { target: ['id'] },
      });
      prismaMock.sale.findUnique.mockResolvedValueOnce(null).mockResolvedValue({
        id: saleId,
        code: 'HD-CH01-261117-0001',
        branchId: ch01Id,
        shiftId,
        cashierId: cashierUser.id,
        subtotal: 1,
        discount: 0,
        total: 1,
        status: 'COMPLETED',
        note: null,
        createdAtClient: new Date(),
        createdAtServer: new Date(),
        updatedAt: new Date(),
        items: [],
        payments: [],
      });
      prismaMock.$transaction.mockRejectedValueOnce(prismaError);
      await expect(
        service.createSale(cashierUser, {
          id: saleId,
          branchId: ch01Id,
          shiftId,
          subtotal: 1,
          discount: 0,
          total: 1,
          createdAtClient: new Date().toISOString(),
          items: [{ variantId: variant1Id, quantity: 1, unitPrice: 1, discount: 0, lineTotal: 1 }],
          payments: [{ method: 'CASH', amount: 1 }],
        }),
      ).resolves.toMatchObject({ id: saleId });
    });

    it('REQ-POS-04: rejects return if sale is older than 7 days', async () => {
      const saleId = uuidv7();
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

      prismaMock.sale.findUnique.mockResolvedValue({
        id: saleId,
        branchId: ch01Id,
        createdAtServer: eightDaysAgo,
        items: [],
      });

      await expect(
        service.createReturn(cashierUser, saleId, {
          reason: 'Hàng lỗi',
          items: [{ saleItemId: uuidv7(), variantId: variant1Id, quantity: 1, refundAmount: 150000 }],
        }),
      ).rejects.toThrow(/Chỉ được đổi trả hàng trong vòng 7 ngày/);
    });

    it('REQ-POS-04: rejects return if quantity exceeds remaining quantity', async () => {
      const saleId = uuidv7();
      const saleItemId = uuidv7();

      prismaMock.sale.findUnique.mockResolvedValue({
        id: saleId,
        branchId: ch01Id,
        createdAtServer: new Date(),
        items: [
          {
            id: saleItemId,
            variantId: variant1Id,
            quantity: 2,
            returnedQuantity: 1, // 1 remaining
          },
        ],
      });

      await expect(
        service.createReturn(cashierUser, saleId, {
          reason: 'Khách đổi ý',
          items: [{ saleItemId, variantId: variant1Id, quantity: 2, refundAmount: 300000 }], // asking for 2 > 1
        }),
      ).rejects.toThrow(/vượt quá số lượng còn lại có thể trả/);
    });
  });
});
