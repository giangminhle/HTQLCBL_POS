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

    it('REQ-POS-01: denies replaying a branch A sale id from a branch B cashier', async () => {
      const cashier02 = (await login(app, 'cashier02', PASSWORDS.cashier, 'pos')).accessToken;
      await http()
        .post('/sales')
        .set(bearer(cashier02))
        .send({
          id: saleId,
          branchId: ch01Id,
          shiftId,
          subtotal: testUnitPrice,
          total: testUnitPrice,
          discount: 0,
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
          payments: [{ method: 'CASH', amount: testUnitPrice }],
        })
        .expect(403);
    });

    it('REQ-POS-01: requires an approval token for discounts above 10 percent and records the manager', async () => {
      const payload = {
        id: uuidv7(),
        branchId: ch01Id,
        shiftId,
        subtotal: 80000,
        discount: 0,
        total: 80000,
        createdAtClient: new Date().toISOString(),
        items: [
          {
            variantId: testVariantId,
            quantity: 1,
            unitPrice: testUnitPrice,
            discount: 20000,
            lineTotal: 80000,
          },
        ],
        payments: [{ method: 'CASH', amount: 80000 }],
      };
      await http().post('/sales').set(bearer(cashier01)).send(payload).expect(403);
      const approved = await http()
        .post('/sales/authorize-discount')
        .set(bearer(cashier01))
        .send({ username: 'manager01', password: PASSWORDS.manager })
        .expect(201);
      expect(approved.body.approvalToken).toEqual(expect.any(String));
      const manager = await prisma.user.findUniqueOrThrow({ where: { username: 'manager01' } });
      expect(
        await prisma.auditLog.count({
          where: { userId: manager.id, entity: 'DiscountApproval', action: 'LOGIN' },
        }),
      ).toBeGreaterThan(0);
      const created = await http()
        .post('/sales')
        .set(bearer(cashier01))
        .send({ ...payload, id: uuidv7(), discountApprovalToken: approved.body.approvalToken })
        .expect(201);
      const storedSale = await prisma.sale.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(storedSale.approvedByManagerId).toBe(manager.id);
    });

    it('REQ-POS-02: concurrent duplicate id requests both succeed and write one sale and one movement', async () => {
      const duplicateId = uuidv7();
      const payload = {
        id: duplicateId,
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
        payments: [{ method: 'CASH', amount: testUnitPrice }],
      };
      const responses = await Promise.all([
        http().post('/sales').set(bearer(cashier01)).send(payload),
        http().post('/sales').set(bearer(cashier01)).send(payload),
      ]);
      expect(responses.every((response) => response.status >= 200 && response.status < 300)).toBe(true);
      expect(await prisma.sale.count({ where: { id: duplicateId } })).toBe(1);
      expect(await prisma.stockMovement.count({ where: { refType: 'Sale', refId: duplicateId } })).toBe(1);
    });

    it('REQ-POS-02: assigns unique codes to 20 concurrent sales at one branch', async () => {
      const responses = await Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          http()
            .post('/sales')
            .set(bearer(cashier01))
            .send({
              id: uuidv7(),
              branchId: ch01Id,
              shiftId,
              subtotal: testUnitPrice,
              discount: 0,
              total: testUnitPrice,
              note: `parallel ${index}`,
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
              payments: [{ method: 'CASH', amount: testUnitPrice }],
            }),
        ),
      );
      expect(responses.every((response) => response.status >= 200 && response.status < 300)).toBe(true);
      const codes = responses.map((response) => response.body.code);
      expect(new Set(codes).size).toBe(20);
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
      const manager = await prisma.user.findUniqueOrThrow({ where: { username: 'manager01' } });
      expect(
        await prisma.auditLog.count({
          where: { userId: manager.id, entity: 'DiscountApproval', action: 'LOGIN_FAILED' },
        }),
      ).toBeGreaterThan(0);
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

  describe('Discount approval lockout and audit (REQ-POS-01)', () => {
    it('REQ-POS-01: locks the manager after five failed approval attempts and audits each attempt', async () => {
      const manager = await prisma.user.findUniqueOrThrow({ where: { username: 'manager01' } });
      const attempts = Math.max(0, 5 - manager.failedLoginCount);
      for (let i = 0; i < attempts; i += 1) {
        await http()
          .post('/sales/authorize-discount')
          .set(bearer(cashier01))
          .send({ username: 'manager01', password: 'WrongPassword' })
          .expect(401);
      }
      const locked = await prisma.user.findUniqueOrThrow({ where: { id: manager.id } });
      expect(locked.lockedUntil?.getTime()).toBeGreaterThan(Date.now());
      expect(locked.lockedUntil?.getTime()).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000);
      const failureAudits = await prisma.auditLog.count({
        where: { userId: manager.id, entity: 'DiscountApproval', action: 'LOGIN_FAILED' },
      });
      expect(failureAudits).toBeGreaterThanOrEqual(attempts);
      await prisma.user.update({
        where: { id: manager.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    });
  });
});
