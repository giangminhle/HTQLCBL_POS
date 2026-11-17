import { INestApplication } from '@nestjs/common';
import { importResultSchema, productPageSchema, productSchema, toEan13 } from '@retailchain/shared';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createTestApp, login, PASSWORDS } from './helpers';

describe('Catalog: categories, products, import (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: string;
  let manager: string;
  let cashier: string;
  let warehouse: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    owner = (await login(app, 'owner', PASSWORDS.owner)).accessToken;
    manager = (await login(app, 'manager01', PASSWORDS.manager)).accessToken;
    cashier = (await login(app, 'cashier01', PASSWORDS.cashier)).accessToken;
    warehouse = (await login(app, 'warehouse01', PASSWORDS.warehouse)).accessToken;
  });
  afterAll(async () => {
    await app.close();
  });

  describe('seed (REQ-PRD-01)', () => {
    it('REQ-PRD-01: about 200 products with valid EAN-13 barcodes; every product has ≥ 1 variant', async () => {
      expect(await prisma.product.count()).toBeGreaterThanOrEqual(200);
      expect(await prisma.product.count({ where: { variants: { none: {} } } })).toBe(0);
      const res = await http().get('/products').query({ pageSize: 100 }).set(bearer(owner)).expect(200);
      const page = productPageSchema.parse(res.body);
      expect(page.total).toBeGreaterThanOrEqual(200);
    });
  });

  describe('categories (REQ-PRD-01)', () => {
    it('REQ-PRD-01: builds a multi-level tree, blocks cycles, refuses to delete non-empty categories', async () => {
      const root = (await http().post('/categories').set(bearer(owner)).send({ name: 'E2E gốc' }).expect(201))
        .body;
      const child = (
        await http()
          .post('/categories')
          .set(bearer(owner))
          .send({ name: 'E2E con', parentId: root.id })
          .expect(201)
      ).body;
      const grand = (
        await http()
          .post('/categories')
          .set(bearer(owner))
          .send({ name: 'E2E cháu', parentId: child.id })
          .expect(201)
      ).body;
      expect(grand.path).toBe(`/${root.id}/${child.id}/${grand.id}/`);

      const cycle = await http()
        .patch(`/categories/${root.id}`)
        .set(bearer(owner))
        .send({ parentId: grand.id })
        .expect(400);
      expect(cycle.body.code).toBe('CATEGORY_CYCLE');

      // move child (with its subtree) to the top level: descendants' paths follow
      await http().patch(`/categories/${child.id}`).set(bearer(owner)).send({ parentId: null }).expect(200);
      const moved = await prisma.category.findUniqueOrThrow({ where: { id: grand.id } });
      expect(moved.path).toBe(`/${child.id}/${grand.id}/`);

      const notEmpty = await http().delete(`/categories/${child.id}`).set(bearer(owner)).expect(409);
      expect(notEmpty.body.code).toBe('CATEGORY_NOT_EMPTY');
      await http().delete(`/categories/${grand.id}`).set(bearer(owner)).expect(200);
    });

    it('REQ-PRD-01: only OWNER writes categories; everyone reads', async () => {
      await http().post('/categories').set(bearer(manager)).send({ name: 'x' }).expect(403);
      await http().get('/categories').set(bearer(cashier)).expect(200);
    });
  });

  describe('products (REQ-PRD-01)', () => {
    let productId: string;
    const ean = (n: number) => toEan13(`29${String(n).padStart(10, '0')}`);

    it('REQ-PRD-01: creating without variants creates a default variant with the product SKU', async () => {
      const res = await http()
        .post('/products')
        .set(bearer(owner))
        .send({
          sku: 'e2e-simple',
          name: 'Nước tăng lực E2E',
          unit: 'lon',
          defaultPrice: 12000,
          costPrice: 8000,
          barcodes: [ean(1)],
        })
        .expect(201);
      const p = productSchema.parse(res.body);
      expect(p.sku).toBe('E2E-SIMPLE');
      expect(p.variants).toHaveLength(1);
      expect(p.variants[0]).toMatchObject({ sku: 'E2E-SIMPLE', price: null, barcodes: [{ code: ean(1) }] });
    });

    it('REQ-PRD-01: creates a product with variants (own price/cost/minStock), audits price, warns below cost', async () => {
      const res = await http()
        .post('/products')
        .set(bearer(owner))
        .send({
          sku: 'E2E-SON',
          name: 'Son E2E',
          unit: 'cây',
          defaultPrice: 200000,
          costPrice: 150000,
          variants: [
            { sku: 'E2E-SON-DO', name: 'Son E2E Đỏ', attributes: { màu: 'Đỏ' }, barcodes: [ean(2)] },
            {
              sku: 'E2E-SON-HONG',
              name: 'Son E2E Hồng',
              attributes: { màu: 'Hồng' },
              price: 140000,
              costPrice: 150000,
              minStock: 3,
              barcodes: [ean(3), 'SON-HONG-01'],
            },
          ],
        })
        .expect(201);
      productId = res.body.id;
      expect(res.body.variants[1]).toMatchObject({ price: 140000, costPrice: 150000, minStock: 3 });
      expect(res.body.warnings).toEqual([
        expect.objectContaining({ code: 'PRICE_BELOW_COST', sku: 'E2E-SON-HONG' }),
      ]);

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'PRICE_CHANGE', entityId: productId },
      });
      expect(audit?.after).toMatchObject({
        defaultPrice: 200000,
        variants: { 'E2E-SON-HONG': { price: 140000 } },
      });
    });

    it('REQ-PRD-01: rejects a wrong EAN-13 check digit and a barcode used by another product', async () => {
      const bad = await http()
        .post('/products')
        .set(bearer(owner))
        .send({ sku: 'E2E-BAD', name: 'x', unit: 'cái', defaultPrice: 1000, barcodes: ['4006381333932'] })
        .expect(400);
      expect(bad.body.code).toBe('VALIDATION_ERROR');
      const dup = await http()
        .post('/products')
        .set(bearer(owner))
        .send({ sku: 'E2E-DUP', name: 'x', unit: 'cái', defaultPrice: 1000, barcodes: [ean(2)] })
        .expect(409);
      expect(dup.body.message).toContain(ean(2));
    });

    it('REQ-PRD-01: search by name without diacritics, by SKU, and by exact barcode', async () => {
      const byName = await http().get('/products').query({ q: 'son e2e' }).set(bearer(owner)).expect(200);
      expect(byName.body.items.map((p: { sku: string }) => p.sku)).toContain('E2E-SON');
      const noAccent = await http()
        .get('/products')
        .query({ q: 'nuoc tang luc e2e' })
        .set(bearer(owner))
        .expect(200);
      expect(noAccent.body.items.map((p: { sku: string }) => p.sku)).toEqual(['E2E-SIMPLE']);
      const bySku = await http().get('/products').query({ q: 'e2e-son-hong' }).set(bearer(owner)).expect(200);
      expect(bySku.body.total).toBe(1);
      const byCode = await http()
        .get('/products')
        .query({ q: ean(3) })
        .set(bearer(owner))
        .expect(200);
      expect(byCode.body.items[0].sku).toBe('E2E-SON');
      const scan = await http()
        .get(`/products/by-barcode/${ean(3)}`)
        .set(bearer(cashier))
        .expect(200);
      expect(scan.body.matchedVariantId).toBe(
        scan.body.variants.find((v: { sku: string }) => v.sku === 'E2E-SON-HONG').id,
      );
    });

    it('REQ-PRD-01: CASHIER never sees costPrice; WAREHOUSE_KEEPER does', async () => {
      const asCashier = await http().get(`/products/${productId}`).set(bearer(cashier)).expect(200);
      expect(asCashier.body).not.toHaveProperty('costPrice');
      expect(asCashier.body.variants.some((v: object) => 'costPrice' in v)).toBe(false);
      const list = await http().get('/products').query({ q: 'son e2e' }).set(bearer(cashier)).expect(200);
      expect(JSON.stringify(list.body)).not.toContain('costPrice');
      const scan = await http()
        .get(`/products/by-barcode/${ean(2)}`)
        .set(bearer(cashier))
        .expect(200);
      expect(scan.body).not.toHaveProperty('costPrice');

      const asWarehouse = await http().get(`/products/${productId}`).set(bearer(warehouse)).expect(200);
      expect(asWarehouse.body.costPrice).toBe(150000);
    });

    it('REQ-PRD-01: update replaces barcodes, deactivates dropped variants, audits only changed prices', async () => {
      const current = (await http().get(`/products/${productId}`).set(bearer(owner)).expect(200)).body;
      const [red, pink] = current.variants;
      const res = await http()
        .patch(`/products/${productId}`)
        .set(bearer(owner))
        .send({
          defaultPrice: 210000,
          variants: [
            {
              id: pink.id,
              sku: pink.sku,
              name: pink.name,
              attributes: pink.attributes,
              price: 160000,
              costPrice: 150000,
              barcodes: ['SON-HONG-01'],
            },
          ],
        })
        .expect(200);
      const updatedPink = res.body.variants.find((v: { id: string }) => v.id === pink.id);
      const updatedRed = res.body.variants.find((v: { id: string }) => v.id === red.id);
      expect(updatedPink.barcodes.map((b: { code: string }) => b.code)).toEqual(['SON-HONG-01']);
      expect(updatedRed.isActive).toBe(false);
      expect(res.body.warnings).toBeUndefined();

      const removed = await prisma.barcode.findFirst({ where: { code: ean(3) } });
      expect(removed?.deletedAt).not.toBeNull(); // soft-deleted → /sync/catalog tells the POS
      const logs = await prisma.auditLog.findMany({
        where: { action: 'PRICE_CHANGE', entityId: productId },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs).toHaveLength(2);
      expect(logs[1]?.before).toEqual({
        defaultPrice: 200000,
        variants: { 'E2E-SON-HONG': { price: 140000, costPrice: 150000 } },
      });
    });

    it('REQ-PRD-01: only OWNER creates or edits products', async () => {
      await http()
        .post('/products')
        .set(bearer(manager))
        .send({ sku: 'X1', name: 'x', unit: 'c', defaultPrice: 1 })
        .expect(403);
      await http().patch(`/products/${productId}`).set(bearer(cashier)).send({ name: 'x' }).expect(403);
    });
  });

  describe('CSV import (REQ-PRD-01)', () => {
    const header =
      'product_sku,product_name,category,unit,default_price,cost_price,min_stock,variant_sku,variant_name,attributes,variant_price,variant_cost_price,variant_min_stock,barcodes,is_active';
    const ean = (n: number) => toEan13(`28${String(n).padStart(10, '0')}`);
    const upload = (csv: string, dryRun?: boolean) =>
      http()
        .post('/products/import')
        .query(dryRun ? { dryRun: 'true' } : {})
        .set(bearer(owner))
        .attach('file', Buffer.from(csv, 'utf8'), { filename: 'sp.csv', contentType: 'text/csv' });

    it('REQ-PRD-01: dryRun validates without writing; commit writes; all-or-nothing on errors', async () => {
      const good = [
        '﻿' + header,
        `IMP-DG,Dầu gội nhập,Mỹ phẩm > Chăm sóc tóc,chai,90000,60000,5,IMP-DG-180,Dầu gội nhập 180ml,dung tích=180ml,50000,35000,,${ean(1)},1`,
        `IMP-DG,,,,,,,IMP-DG-370,Dầu gội nhập 370ml,dung tích=370ml,,,,${ean(2)},1`,
        `IMP-MI,Mì nhập,Thực phẩm > Mì gói,gói,4500,3500,20,,,,,,,${ean(3)},1`,
      ].join('\n');

      const dry = importResultSchema.parse((await upload(good, true).expect(200)).body);
      expect(dry).toMatchObject({
        dryRun: true,
        ok: true,
        productsCreated: 2,
        variantsCreated: 3,
        errors: [],
      });
      expect(await prisma.product.count({ where: { sku: { startsWith: 'IMP-' } } })).toBe(0);

      const bad = good + '\nIMP-X,Hàng lỗi,Danh mục không có,cái,12.000,,,,,,,,,4006381333932,';
      const failed = importResultSchema.parse((await upload(bad).expect(200)).body);
      expect(failed.ok).toBe(false);
      expect(failed.errors.map((e) => [e.line, e.field])).toEqual(
        expect.arrayContaining([
          [5, 'default_price'],
          [5, 'barcodes'],
        ]),
      );
      expect(failed.errorReportCsv).toContain('Lỗi');
      expect(await prisma.product.count({ where: { sku: { startsWith: 'IMP-' } } })).toBe(0); // nothing written

      const committed = importResultSchema.parse((await upload(good).expect(200)).body);
      expect(committed).toMatchObject({ dryRun: false, ok: true, productsCreated: 2 });
      const dg = await prisma.product.findUniqueOrThrow({
        where: { sku: 'IMP-DG' },
        include: { variants: true },
      });
      expect(dg.variants.map((v) => v.sku).sort()).toEqual(['IMP-DG-180', 'IMP-DG-370']);
      expect(await prisma.auditLog.count({ where: { action: 'IMPORT' } })).toBeGreaterThan(0);

      // re-import the same file = update, not duplicate
      const again = importResultSchema.parse((await upload(good).expect(200)).body);
      expect(again).toMatchObject({ productsCreated: 0, productsUpdated: 2 });
    });

    it('REQ-PRD-01: rows clashing with existing data are reported with their line', async () => {
      const csv = [header, `IMP-CLASH,Hàng trùng mã,,cái,1000,,,,,,,,,${ean(1)},1`].join('\n');
      const res = importResultSchema.parse((await upload(csv).expect(200)).body);
      expect(res.errors).toEqual([
        expect.objectContaining({
          line: 2,
          field: 'barcodes',
          message: expect.stringContaining('IMP-DG-180'),
        }),
      ]);
    });

    it('REQ-PRD-01: template is downloadable; only OWNER may import', async () => {
      const t = await http().get('/products/import/template').set(bearer(owner)).expect(200);
      expect(t.headers['content-type']).toContain('text/csv');
      expect(t.text).toContain('product_sku');
      await http()
        .post('/products/import')
        .set(bearer(manager))
        .attach('file', Buffer.from(header), { filename: 'a.csv', contentType: 'text/csv' })
        .expect(403);
      expect((await http().post('/products/import').set(bearer(owner)).expect(400)).body.message).toContain(
        'file',
      );
    });
  });
});
