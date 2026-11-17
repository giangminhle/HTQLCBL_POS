import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { SaleStatus, StockMovementType, uuidv7 } from '@retailchain/shared';
import { bearer, createTestApp, login, PASSWORDS } from './helpers';

describe('Sales, Shifts & POS Returns (REQ-POS-01..04, REQ-SHF-01) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let inventoryService: InventoryService;

  let cashier01: string;
  let ch01Id: string;
  let testVariantId: string;
  const testUnitPrice = 100000;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    inventoryService = app.get(InventoryService);

    cashier01 = (await login(app, 'cashier01', PASSWORDS.cashier, 'pos')).accessToken;

    const ch01 = await prisma.branch.findUniqueOrThrow({ where: { code: 'CH-01' } });
    ch01Id = ch01.id;

    // Pick a test variant
    const variant = await prisma.productVariant.findFirstOrThrow({
      where: { isActive: true },
      include: { product: true },
    });
    testVariantId = variant.id;

    // Seed stock balance of 100 items at CH-01
    await inventoryService.applyMovements([
      {
        branchId: ch01Id,
        variantId: testVariantId,
        type: StockMovementType.IMPORT,
        quantity: 100,
        refType: 'TestSeed',
        createdBy: (await prisma.user.findFirstOrThrow({ where: { username: 'owner' } })).id,
      },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Shift Lifecycle & Cash Reconciliation (REQ-SHF-01)', () => {
    let shiftId: string;

    it('REQ-SHF-01: cashier opens a shift with opening cash', async () => {
      // If cashier01 has an open shift from previous runs, close it first
      const openShift = await prisma.shift.findFirst({
        where: {
          cashierId: (await prisma.user.findUniqueOrThrow({ where: { username: 'cashier01' } })).id,
          status: 'OPEN',
        },
      });
      if (openShift) {
        await prisma.shift.update({
          where: { id: openShift.id },
          data: { status: 'CLOSED', closedAt: new Date() },
        });
      }

      const res = await http()
        .post('/shifts/open')
        .set(bearer(cashier01))
        .send({ openingCash: 1000000, note: 'Ca sáng đầu ngày' })
        .expect(201);

      expect(res.body.openingCash).toBe(1000000);
      expect(res.body.status).toBe('OPEN');
      expect(res.body.code).toMatch(/^CA-CH01-\d{6}-\d{3}$/);
      shiftId = res.body.id;
    });

    it('REQ-SHF-01: gets the current open shift for cashier', async () => {
      const res = await http().get('/shifts/current').set(bearer(cashier01)).expect(200);

      expect(res.body.shift.id).toBe(shiftId);
      expect(res.body.expectedCash).toBe(1000000);
    });

    it('REQ-SHF-01: cannot open a 2nd shift while 1st is still OPEN', async () => {
      await http().post('/shifts/open').set(bearer(cashier01)).send({ openingCash: 500000 }).expect(400);
    });
  });

  describe('Sales Creation & Ledger Deductions (REQ-POS-01, REQ-POS-02)', () => {
    let saleId: string;
    let initialBalance: number;
    let shiftId: string;

    beforeAll(async () => {
      const shiftRes = await http().get('/shifts/current').set(bearer(cashier01));
      shiftId = shiftRes.body.shift.id;

      const balance = await prisma.stockBalance.findUnique({
        where: { branchId_variantId: { branchId: ch01Id, variantId: testVariantId } },
      });
      initialBalance = balance?.quantity ?? 0;
    });

    it('REQ-POS-01, 02: creates a sale with multi-tender payment and deducts stock', async () => {
      saleId = uuidv7();
      const quantity = 3;
      const subtotal = testUnitPrice * quantity; // 300.000
      const discount = 10000;
      const total = subtotal - discount; // 290.000

      // Multi-tender payment: 100.000 cash, 190.000 QR
      const cashAmount = 100000;
      const qrAmount = total - cashAmount;

      const res = await http()
        .post('/sales')
        .set(bearer(cashier01))
        .send({
          id: saleId,
          branchId: ch01Id,
          shiftId,
          subtotal,
          discount,
          total,
          note: 'Khách hàng thân thiết',
          createdAtClient: new Date().toISOString(),
          items: [
            {
              variantId: testVariantId,
              quantity,
              unitPrice: testUnitPrice,
              discount: 0,
              lineTotal: subtotal,
            },
          ],
          payments: [
            { method: 'CASH', amount: cashAmount },
            { method: 'QR', amount: qrAmount, reference: 'VQR12345678' },
          ],
        })
        .expect(201);

      expect(res.body.id).toBe(saleId);
      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.total).toBe(total);
      expect(res.body.payments).toHaveLength(2);

      // Verify stock balance decreased by exact quantity (3)
      const afterBalance = await prisma.stockBalance.findUniqueOrThrow({
        where: { branchId_variantId: { branchId: ch01Id, variantId: testVariantId } },
      });
      expect(afterBalance.quantity).toBe(initialBalance - quantity);

      // Verify movement SALE was recorded with negative quantity (-3)
      const movement = await prisma.stockMovement.findFirstOrThrow({
        where: { refType: 'Sale', refId: saleId, type: 'SALE' },
      });
      expect(movement.quantity).toBe(-quantity);
    });

    it('REQ-POS-01: idempotent sale creation (sending duplicate id returns original without double deducting)', async () => {
      const balanceBeforeDuplicate = (
        await prisma.stockBalance.findUniqueOrThrow({
          where: { branchId_variantId: { branchId: ch01Id, variantId: testVariantId } },
        })
      ).quantity;

      const res = await http()
        .post('/sales')
        .set(bearer(cashier01))
        .send({
          id: saleId, // SAME ID
          branchId: ch01Id,
          shiftId,
          subtotal: testUnitPrice * 3,
          discount: 10000,
          total: testUnitPrice * 3 - 10000,
          createdAtClient: new Date().toISOString(),
          items: [
            {
              variantId: testVariantId,
              quantity: 3,
              unitPrice: testUnitPrice,
              discount: 0,
              lineTotal: testUnitPrice * 3,
            },
          ],
          payments: [{ method: 'CASH', amount: testUnitPrice * 3 - 10000 }],
        })
        .expect(201);

      expect(res.body.id).toBe(saleId);

      // Balance must NOT have decreased again!
      const balanceAfterDuplicate = (
        await prisma.stockBalance.findUniqueOrThrow({
          where: { branchId_variantId: { branchId: ch01Id, variantId: testVariantId } },
        })
      ).quantity;
      expect(balanceAfterDuplicate).toBe(balanceBeforeDuplicate);

      // Must have exactly 1 movement record for this sale
      const movementCount = await prisma.stockMovement.count({
        where: { refType: 'Sale', refId: saleId },
      });
      expect(movementCount).toBe(1);
    });

    it('REQ-POS-02: rejects sale if payment is insufficient', async () => {
      const badSaleId = uuidv7();
      await http()
        .post('/sales')
        .set(bearer(cashier01))
        .send({
          id: badSaleId,
          branchId: ch01Id,
          shiftId,
          subtotal: testUnitPrice,
          discount: 0,
          total: testUnitPrice,
          createdAtClient: new Date().toISOString(),
          items: [
            {
              variantId: testVariantId,
              quantity: 1,
              unitPrice: testUnitPrice,
              discount: 0,
              lineTotal: testUnitPrice,
            },
          ],
          payments: [{ method: 'CASH', amount: testUnitPrice - 5000 }], // 5000 short!
        })
        .expect(400);
    });
  });

  describe('Manager Discount Authorization', () => {
    it('REQ-POS-01: manager of branch can authorize discount > 10%', async () => {
      const res = await http()
        .post('/sales/authorize-discount')
        .set(bearer(cashier01))
        .send({ username: 'manager01', password: PASSWORDS.manager })
        .expect(201);

      expect(res.body.authorized).toBe(true);
      expect(res.body.managerName).toBe('Trần Thị Quản Lý');
    });

    it('REQ-POS-01: rejects invalid password or non-manager authorization', async () => {
      await http()
        .post('/sales/authorize-discount')
        .set(bearer(cashier01))
        .send({ username: 'manager01', password: 'WrongPassword' })
        .expect(401);
    });
  });

  describe('Sales Returns & Stock Restocking (REQ-POS-04)', () => {
    let saleId: string;
    let saleItemId: string;
    let initialBalance: number;

    beforeAll(async () => {
      const shiftRes = await http().get('/shifts/current').set(bearer(cashier01));
      const shiftId = shiftRes.body.shift.id;

      saleId = uuidv7();
      const saleRes = await http()
        .post('/sales')
        .set(bearer(cashier01))
        .send({
          id: saleId,
          branchId: ch01Id,
          shiftId,
          subtotal: testUnitPrice * 2,
          discount: 0,
          total: testUnitPrice * 2,
          createdAtClient: new Date().toISOString(),
          items: [
            {
              variantId: testVariantId,
              quantity: 2,
              unitPrice: testUnitPrice,
              discount: 0,
              lineTotal: testUnitPrice * 2,
            },
          ],
          payments: [{ method: 'CASH', amount: testUnitPrice * 2 }],
        });

      saleItemId = saleRes.body.items[0].id;
      const b = await prisma.stockBalance.findUniqueOrThrow({
        where: { branchId_variantId: { branchId: ch01Id, variantId: testVariantId } },
      });
      initialBalance = b.quantity;
    });

    it('REQ-POS-04: creates a partial return and restocks inventory via RETURN movement', async () => {
      const res = await http()
        .post(`/sales/${saleId}/returns`)
        .set(bearer(cashier01))
        .send({
          reason: 'Khách không ưng màu',
          items: [
            {
              saleItemId,
              variantId: testVariantId,
              quantity: 1, // return 1 of 2
              refundAmount: testUnitPrice,
            },
          ],
        })
        .expect(201);

      expect(res.body.totalRefund).toBe(testUnitPrice);
      expect(res.body.code).toMatch(/^TH-CH01-\d{6}-\d{4}$/);

      // Verify stock balance restored by +1
      const afterBalance = await prisma.stockBalance.findUniqueOrThrow({
        where: { branchId_variantId: { branchId: ch01Id, variantId: testVariantId } },
      });
      expect(afterBalance.quantity).toBe(initialBalance + 1);

      // Verify movement RETURN was recorded with positive quantity (+1)
      const movement = await prisma.stockMovement.findFirstOrThrow({
        where: { refType: 'SaleReturn', refId: res.body.id, type: 'RETURN' },
      });
      expect(movement.quantity).toBe(1);

      // Verify sale status is now RETURNED_PARTIAL
      const updatedSale = await http().get(`/sales/${saleId}`).set(bearer(cashier01));
      expect(updatedSale.body.status).toBe(SaleStatus.RETURNED_PARTIAL);
    });

    it('REQ-POS-04: rejects returning more than the remaining quantity', async () => {
      // 1 item already returned out of 2. Trying to return 2 more should fail
      await http()
        .post(`/sales/${saleId}/returns`)
        .set(bearer(cashier01))
        .send({
          reason: 'Lỗi',
          items: [
            {
              saleItemId,
              variantId: testVariantId,
              quantity: 2, // 2 > 1 remaining
              refundAmount: testUnitPrice * 2,
            },
          ],
        })
        .expect(400);
    });
  });

  describe('Closing Shift & Reconciliation Verification (REQ-SHF-01)', () => {
    it('REQ-SHF-01: closes shift and accurately accounts for sales and refunds', async () => {
      const currentRes = await http().get('/shifts/current').set(bearer(cashier01));
      const shiftSummary = currentRes.body;
      const shiftId = shiftSummary.shift.id;

      // Reconcile with exact expected cash
      const expected = shiftSummary.expectedCash;
      const res = await http()
        .post(`/shifts/${shiftId}/close`)
        .set(bearer(cashier01))
        .send({ closingCash: expected, note: 'Khớp sổ 100%' })
        .expect(201);

      expect(res.body.status).toBe('CLOSED');
      expect(res.body.expectedCash).toBe(expected);
      expect(res.body.closingCash).toBe(expected);
      expect(res.body.difference).toBe(0);

      // Current shift should now be null
      const checkCurrent = await http().get('/shifts/current').set(bearer(cashier01));
      expect(checkCurrent.body).toEqual({});
    });
  });
});
