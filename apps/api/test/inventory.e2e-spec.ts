import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { StockMovementType } from '@retailchain/shared';
import { hashPassword } from '../src/common/security/password';
import { bearer, createTestApp, login, PASSWORDS } from './helpers';

describe('Inventory & Ledger (REQ-INV-01..04) (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let inventoryService: InventoryService;

  let owner: string;
  let manager01: string;
  let warehouse01: string;
  let cashier01: string;

  let khoTongId: string;
  let ch01Id: string;
  let _ch02Id: string;
  let testVariantId: string;

  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    inventoryService = app.get(InventoryService);

    owner = (await login(app, 'owner', PASSWORDS.owner)).accessToken;
    manager01 = (await login(app, 'manager01', PASSWORDS.manager)).accessToken;
    warehouse01 = (await login(app, 'warehouse01', PASSWORDS.warehouse)).accessToken;
    cashier01 = (await login(app, 'cashier01', PASSWORDS.cashier)).accessToken;

    const [khoTong, ch01, ch02] = await Promise.all([
      prisma.branch.findUniqueOrThrow({ where: { code: 'KHO-TONG' } }),
      prisma.branch.findUniqueOrThrow({ where: { code: 'CH-01' } }),
      prisma.branch.findUniqueOrThrow({ where: { code: 'CH-02' } }),
    ]);

    khoTongId = khoTong.id;
    ch01Id = ch01.id;
    _ch02Id = ch02.id;

    // Pick an active variant from seeded products
    const variant = await prisma.productVariant.findFirstOrThrow({
      where: { isActive: true },
      include: { product: true },
    });
    testVariantId = variant.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Concurrency & Ledger Invariant Tests', () => {
    it('REQ-INV-01: runs 50 parallel movements on the same product; final balance matches exactly', async () => {
      // 1. Initial setup: seed a known balance of 1000 items
      const initialStock = 1000;
      const decrementPerOp = 5;
      const concurrency = 50;

      // Clean up previous test balance/movements for this branch + variant
      await prisma.stockMovement.deleteMany({
        where: { branchId: khoTongId, variantId: testVariantId },
      });
      await prisma.stockBalance.deleteMany({
        where: { branchId: khoTongId, variantId: testVariantId },
      });

      // Apply initial stock
      await inventoryService.applyMovements([
        {
          branchId: khoTongId,
          variantId: testVariantId,
          type: StockMovementType.IMPORT,
          quantity: initialStock,
          refType: 'TestSetup',
          createdBy: (await prisma.user.findFirstOrThrow({ where: { username: 'owner' } })).id,
        },
      ]);

      // 2. Fire 50 parallel deduction operations simultaneously
      const ownerUser = await prisma.user.findFirstOrThrow({ where: { username: 'owner' } });
      const operations = Array.from({ length: concurrency }).map(() =>
        inventoryService.applyMovements([
          {
            branchId: khoTongId,
            variantId: testVariantId,
            type: StockMovementType.SALE,
            quantity: -decrementPerOp, // -5 each
            refType: 'TestConcurrentSale',
            createdBy: ownerUser.id,
          },
        ]),
      );

      await Promise.all(operations);

      // 3. Verify final stock balance
      const expectedStock = initialStock - concurrency * decrementPerOp; // 1000 - 250 = 750
      const balance = await prisma.stockBalance.findUniqueOrThrow({
        where: { branchId_variantId: { branchId: khoTongId, variantId: testVariantId } },
      });

      expect(balance.quantity).toBe(expectedStock);
    });

    it('REQ-INV-01: invariant test: sum(StockMovement.quantity) strictly equals StockBalance.quantity', async () => {
      const movements = await prisma.stockMovement.findMany({
        where: { branchId: khoTongId, variantId: testVariantId },
      });
      const sumQuantity = movements.reduce((acc, m) => acc + m.quantity, 0);

      const balance = await prisma.stockBalance.findUniqueOrThrow({
        where: { branchId_variantId: { branchId: khoTongId, variantId: testVariantId } },
      });

      expect(balance.quantity).toBe(sumQuantity);
    });
  });

  describe('Suppliers API', () => {
    let createdSupplierId: string;

    it('creates a new supplier as OWNER', async () => {
      const supplierCode = `NCC-${Date.now().toString().slice(-4)}`;
      const res = await http()
        .post('/suppliers')
        .set(bearer(owner))
        .send({
          code: supplierCode,
          name: 'Công ty Cung ứng Thực phẩm Sạch',
          phone: '0901234567',
          email: 'ncc@thucphamsach.com',
          address: '123 Đường Nông Sản, Cần Thơ',
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.code).toBe(supplierCode);
      createdSupplierId = res.body.id;
    });

    it('lists suppliers with pagination and search', async () => {
      const res = await http()
        .get('/suppliers')
        .query({ q: 'Thực phẩm Sạch' })
        .set(bearer(warehouse01))
        .expect(200);

      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.items[0].id).toBe(createdSupplierId);
    });
  });

  describe('Goods Receipts (REQ-INV-01)', () => {
    let supplierId: string;
    let receiptId: string;

    beforeAll(async () => {
      const supplier = await prisma.supplier.findFirstOrThrow();
      supplierId = supplier.id;
    });

    it('REQ-INV-01: creates a draft goods receipt at KHO-TONG', async () => {
      const res = await http()
        .post('/inventory/goods-receipts')
        .set(bearer(warehouse01))
        .send({
          branchId: khoTongId,
          supplierId,
          note: 'Nhập lô hàng kiểm thử',
          items: [
            {
              variantId: testVariantId,
              quantity: 100,
              unitCost: 20000,
            },
          ],
          complete: false,
        })
        .expect(201);

      expect(res.body.status).toBe('DRAFT');
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].quantity).toBe(100);
      receiptId = res.body.id;
    });

    it('REQ-INV-01: completes the receipt; balance and ledger movement are recorded', async () => {
      const initialBalance = await prisma.stockBalance.findUnique({
        where: { branchId_variantId: { branchId: khoTongId, variantId: testVariantId } },
      });
      const startQty = initialBalance?.quantity ?? 0;

      const res = await http()
        .post(`/inventory/goods-receipts/${receiptId}/complete`)
        .set(bearer(warehouse01))
        .expect(200);

      expect(res.body.status).toBe('COMPLETED');

      // Verify balance increased by 100
      const updatedBalance = await prisma.stockBalance.findUniqueOrThrow({
        where: { branchId_variantId: { branchId: khoTongId, variantId: testVariantId } },
      });
      expect(updatedBalance.quantity).toBe(startQty + 100);

      // Verify movement recorded
      const movement = await prisma.stockMovement.findFirstOrThrow({
        where: { refType: 'GoodsReceipt', refId: receiptId },
      });
      expect(movement.type).toBe('IMPORT');
      expect(movement.quantity).toBe(100);
    });

    it('REQ-INV-01: CASHIER cannot create goods receipt (403)', async () => {
      await http()
        .post('/inventory/goods-receipts')
        .set(bearer(cashier01))
        .send({
          branchId: ch01Id,
          supplierId,
          items: [{ variantId: testVariantId, quantity: 10, unitCost: 10000 }],
        })
        .expect(403);
    });
  });

  describe('Stock Transfers (REQ-INV-02)', () => {
    let transferId: string;
    let itemId: string;

    it('REQ-INV-02: creates a draft transfer from KHO-TONG to CH-01', async () => {
      const res = await http()
        .post('/inventory/stock-transfers')
        .set(bearer(warehouse01))
        .send({
          fromBranchId: khoTongId,
          toBranchId: ch01Id,
          note: 'Chuyển hàng kiểm thử sang CH-01',
          items: [
            {
              variantId: testVariantId,
              sentQuantity: 20,
            },
          ],
        })
        .expect(201);

      expect(res.body.status).toBe('DRAFT');
      expect(res.body.items).toHaveLength(1);
      transferId = res.body.id;
      itemId = res.body.items[0].id;
    });

    it('REQ-INV-02: send() deducts stock at KHO-TONG (TRANSFER_OUT)', async () => {
      const startBalance = (
        await prisma.stockBalance.findUniqueOrThrow({
          where: { branchId_variantId: { branchId: khoTongId, variantId: testVariantId } },
        })
      ).quantity;

      const res = await http()
        .post(`/inventory/stock-transfers/${transferId}/send`)
        .set(bearer(warehouse01))
        .expect(200);

      expect(res.body.status).toBe('SENT');

      const endBalance = (
        await prisma.stockBalance.findUniqueOrThrow({
          where: { branchId_variantId: { branchId: khoTongId, variantId: testVariantId } },
        })
      ).quantity;
      expect(endBalance).toBe(startQtyDifference(startBalance, 20));

      const outMovement = await prisma.stockMovement.findFirstOrThrow({
        where: { refType: 'StockTransfer', refId: transferId, type: 'TRANSFER_OUT' },
      });
      expect(outMovement.quantity).toBe(-20);
    });

    function startQtyDifference(start: number, sent: number) {
      return start - sent;
    }

    it('REQ-INV-02: receive() at CH-01 receives partial goods and records shortage', async () => {
      const startCh01Balance =
        (
          await prisma.stockBalance.findUnique({
            where: { branchId_variantId: { branchId: ch01Id, variantId: testVariantId } },
          })
        )?.quantity ?? 0;

      // Sent 20, but actual received is 18 (2 units damaged/lost)
      const res = await http()
        .post(`/inventory/stock-transfers/${transferId}/receive`)
        .set(bearer(manager01))
        .send({
          items: [{ itemId, receivedQuantity: 18 }],
        })
        .expect(200);

      expect(res.body.status).toBe('RECEIVED');
      expect(res.body.items[0].receivedQuantity).toBe(18);

      // Verify CH-01 balance increased by 18
      const endCh01Balance = (
        await prisma.stockBalance.findUniqueOrThrow({
          where: { branchId_variantId: { branchId: ch01Id, variantId: testVariantId } },
        })
      ).quantity;
      expect(endCh01Balance).toBe(startCh01Balance + 18);

      // Verify TRANSFER_IN movement is +18
      const inMovement = await prisma.stockMovement.findFirstOrThrow({
        where: { refType: 'StockTransfer', refId: transferId, type: 'TRANSFER_IN' },
      });
      expect(inMovement.quantity).toBe(18);
    });

    it('REQ-INV-02: manager of CH-02 cannot receive goods destined for CH-01 (403)', async () => {
      const hash = await hashPassword(PASSWORDS.manager);
      await prisma.user.upsert({
        where: { username: 'test_manager02' },
        create: {
          username: 'test_manager02',
          passwordHash: hash,
          fullName: 'Test Manager 02',
          role: 'BRANCH_MANAGER',
          branchId: _ch02Id,
          isActive: true,
        },
        update: {
          passwordHash: hash,
          isActive: true,
          branchId: _ch02Id,
        },
      });
      const manager02 = (await login(app, 'test_manager02', PASSWORDS.manager)).accessToken;
      await http()
        .post(`/inventory/stock-transfers/${transferId}/receive`)
        .set(bearer(manager02))
        .send({ items: [{ itemId, receivedQuantity: 20 }] })
        .expect(403);
    });
  });

  describe('Stock Counts & Adjustments (REQ-INV-03)', () => {
    let countId: string;
    let itemId: string;

    it('REQ-INV-03: creates a stock count snapshot at CH-01', async () => {
      const res = await http()
        .post('/inventory/stock-counts')
        .set(bearer(manager01))
        .send({
          branchId: ch01Id,
          note: 'Kiểm kê cuối tuần',
          items: [{ variantId: testVariantId }],
        })
        .expect(201);

      expect(res.body.status).toBe('DRAFT');
      expect(res.body.items[0].systemQuantity).toBeGreaterThanOrEqual(0);
      countId = res.body.id;
      itemId = res.body.items[0].id;
    });

    it('REQ-INV-03: completes stock count and applies ADJUSTMENT movement', async () => {
      const count = await prisma.stockCount.findUniqueOrThrow({
        where: { id: countId },
        include: { items: true },
      });
      const systemQty = count.items[0]!.systemQuantity;
      const actualQty = systemQty + 5; // counted 5 extra units

      // Update actual count
      await http()
        .patch(`/inventory/stock-counts/${countId}`)
        .set(bearer(manager01))
        .send({
          items: [{ itemId, actualQuantity: actualQty }],
        })
        .expect(200);

      // Complete count
      const res = await http()
        .post(`/inventory/stock-counts/${countId}/complete`)
        .set(bearer(manager01))
        .expect(200);

      expect(res.body.status).toBe('COMPLETED');

      // Verify balance is now exactly actualQty
      const balance = await prisma.stockBalance.findUniqueOrThrow({
        where: { branchId_variantId: { branchId: ch01Id, variantId: testVariantId } },
      });
      expect(balance.quantity).toBe(actualQty);

      // Verify ADJUSTMENT movement of +5
      const adjMovement = await prisma.stockMovement.findFirstOrThrow({
        where: { refType: 'StockCount', refId: countId },
      });
      expect(adjMovement.type).toBe('ADJUSTMENT');
      expect(adjMovement.quantity).toBe(5);
    });
  });

  describe('Balances, Stock Card & Low Stock Alert (REQ-INV-04)', () => {
    it('REQ-INV-04: retrieves balance and stock movements', async () => {
      const balances = await http()
        .get('/inventory/balances')
        .query({ branchId: ch01Id })
        .set(bearer(manager01))
        .expect(200);

      expect(balances.body.items.length).toBeGreaterThanOrEqual(1);

      const movements = await http()
        .get('/inventory/movements')
        .query({ branchId: ch01Id, variantId: testVariantId })
        .set(bearer(manager01))
        .expect(200);

      expect(movements.body.items.length).toBeGreaterThanOrEqual(1);
    });

    it('REQ-INV-04: GET /inventory/low-stock alerts when stock is below minStock', async () => {
      // Set high minStock on the test variant so it definitely triggers alert
      await prisma.productVariant.update({
        where: { id: testVariantId },
        data: { minStock: 999999 },
      });

      const res = await http()
        .get('/inventory/low-stock')
        .query({ branchId: ch01Id })
        .set(bearer(manager01))
        .expect(200);

      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
      const alert = res.body.items.find((i: { variantId: string; deficit: number }) => i.variantId === testVariantId);
      expect(alert).toBeDefined();
      expect(alert.deficit).toBeGreaterThan(0);
    });
  });
});
