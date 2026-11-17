import { INestApplication } from '@nestjs/common';
import { effectivePriceResponseSchema, syncCatalogResponseSchema } from '@retailchain/shared';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { bearer, createTestApp, login, PASSWORDS } from './helpers';

const DAY = 86_400_000;

describe('Pricing and /sync/catalog (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let owner: string;
  let manager01: string;
  let cashier01: string;
  let ch01: string;
  let ch02: string;
  let ch03: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    owner = (await login(app, 'owner', PASSWORDS.owner)).accessToken;
    manager01 = (await login(app, 'manager01', PASSWORDS.manager)).accessToken;
    cashier01 = (await login(app, 'cashier01', PASSWORDS.cashier)).accessToken;
    const code = (c: string) => prisma.branch.findUniqueOrThrow({ where: { code: c } }).then((b) => b.id);
    [ch01, ch02, ch03] = await Promise.all([code('CH-01'), code('CH-02'), code('CH-03')]);
  });
  afterAll(async () => {
    await app.close();
  });

  /** A seeded variant that is in CH-01's price lists. */
  async function pricedVariant() {
    const current = await prisma.priceList.findFirstOrThrow({
      where: { branchId: ch01, name: 'Giá Quận 1 hiện hành' },
    });
    const item = await prisma.priceListItem.findFirstOrThrow({ where: { priceListId: current.id } });
    return { current, item };
  }

  describe('getEffectivePrice (REQ-PRC-01)', () => {
    it('REQ-PRC-01: branch price in effect → branch price; expired list ignored; no branch price → default', async () => {
      const { current, item } = await pricedVariant();
      const now = await http()
        .get('/pricing/effective-price')
        .query({ variantId: item.variantId, branchId: ch01 })
        .set(bearer(cashier01))
        .expect(200);
      expect(effectivePriceResponseSchema.parse(now.body)).toMatchObject({
        price: item.price,
        source: 'BRANCH_PRICE_LIST',
        priceListId: current.id,
      });

      // 20 days ago only the expired list existed → its price… but it has expired by now: at -20d it was valid
      const expired = await prisma.priceList.findFirstOrThrow({
        where: { branchId: ch01, name: { contains: 'hết hạn' } },
      });
      const past = await http()
        .get('/pricing/effective-price')
        .query({
          variantId: item.variantId,
          branchId: ch01,
          at: new Date(Date.now() - 20 * DAY).toISOString(),
        })
        .set(bearer(owner))
        .expect(200);
      expect(past.body.priceListId).toBe(expired.id);

      // another branch has no price list → variant/default price
      const other = await http()
        .get('/pricing/effective-price')
        .query({ variantId: item.variantId, branchId: ch03 })
        .set(bearer(owner))
        .expect(200);
      expect(['VARIANT', 'PRODUCT_DEFAULT']).toContain(other.body.source);
    });

    it('REQ-AUTH-01: cashier of CH-01 cannot read prices of CH-02', async () => {
      const { item } = await pricedVariant();
      await http()
        .get('/pricing/effective-price')
        .query({ variantId: item.variantId, branchId: ch02 })
        .set(bearer(cashier01))
        .expect(403);
    });
  });

  describe('price lists (REQ-PRC-01)', () => {
    const iso = (days: number) => new Date(Date.UTC(2030, 0, 1) + days * DAY).toISOString();

    it('REQ-PRC-01: overlapping window on the same branch → 409 with the conflicting list', async () => {
      const a = await http()
        .post('/price-lists')
        .set(bearer(owner))
        .send({ branchId: ch03, name: 'CH03 tháng 1', effectiveFrom: iso(0), effectiveTo: iso(31) })
        .expect(201);
      const clash = await http()
        .post('/price-lists')
        .set(bearer(owner))
        .send({ branchId: ch03, name: 'CH03 chồng', effectiveFrom: iso(15), effectiveTo: null })
        .expect(409);
      expect(clash.body.code).toBe('PRICE_LIST_OVERLAP');
      expect(clash.body.details.conflicts).toEqual([
        expect.objectContaining({ id: a.body.id, name: 'CH03 tháng 1' }),
      ]);

      // half-open: a list starting exactly at the previous effectiveTo does NOT overlap
      await http()
        .post('/price-lists')
        .set(bearer(owner))
        .send({ branchId: ch03, name: 'CH03 tháng 2', effectiveFrom: iso(31), effectiveTo: iso(59) })
        .expect(201);
      // other branch: no conflict
      await http()
        .post('/price-lists')
        .set(bearer(owner))
        .send({ branchId: ch02, name: 'CH02 tháng 1', effectiveFrom: iso(0), effectiveTo: null })
        .expect(201);
    });

    it('REQ-PRC-01: two concurrent overlapping creates → exactly one succeeds (DB exclusion constraint)', async () => {
      const body = (name: string) => ({
        branchId: ch03,
        name,
        effectiveFrom: iso(100),
        effectiveTo: iso(130),
      });
      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          http()
            .post('/price-lists')
            .set(bearer(owner))
            .send(body(`Đua ${i}`)),
        ),
      );
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409, 409, 409, 409]);
      for (const r of results.filter((x) => x.status === 409)) expect(r.body.code).toBe('PRICE_LIST_OVERLAP');
      expect(await prisma.priceList.count({ where: { branchId: ch03, name: { startsWith: 'Đua' } } })).toBe(
        1,
      );
    });

    it('REQ-PRC-01: the DB itself rejects overlaps even when application checks are bypassed', async () => {
      await expect(
        prisma.priceList.create({
          data: { branchId: ch03, name: 'bypass', effectiveFrom: new Date(iso(110)), effectiveTo: null },
        }),
      ).rejects.toThrow(/price_lists_no_overlap|23P01|exclusion/i);
    });

    it('REQ-PRC-01: "end the current list on day X" then a new list may start that day', async () => {
      const open = await http()
        .post('/price-lists')
        .set(bearer(owner))
        .send({ branchId: ch03, name: 'CH03 dài hạn', effectiveFrom: iso(200), effectiveTo: null })
        .expect(201);
      await http()
        .post('/price-lists')
        .set(bearer(owner))
        .send({ branchId: ch03, name: 'CH03 mới', effectiveFrom: iso(250), effectiveTo: null })
        .expect(409);
      const ended = await http()
        .post(`/price-lists/${open.body.id}/end`)
        .set(bearer(owner))
        .send({ endAt: iso(250) })
        .expect(200);
      expect(ended.body.effectiveTo).toBe(iso(250));
      await http()
        .post('/price-lists')
        .set(bearer(owner))
        .send({ branchId: ch03, name: 'CH03 mới', effectiveFrom: iso(250), effectiveTo: null })
        .expect(201);
      await http()
        .post(`/price-lists/${open.body.id}/end`)
        .set(bearer(owner))
        .send({ endAt: iso(150) })
        .expect(400);
    });

    it('REQ-PRC-01: setting prices is audited as PRICE_CHANGE and warns below cost; manager limited to own branch', async () => {
      const variant = await prisma.productVariant.findFirstOrThrow({
        where: { sku: { startsWith: 'SP' } },
        include: { product: true },
      });
      const cost = variant.costPrice ?? variant.product.costPrice;
      const list = await http()
        .post('/price-lists')
        .set(bearer(manager01))
        // CH-01's seed has an open-ended future list, so use a window in the past (before the seeded ones)
        .send({ branchId: ch01, name: 'Q1 xa', effectiveFrom: iso(-4000), effectiveTo: iso(-3990) })
        .expect(201);
      const put = await http()
        .put(`/price-lists/${list.body.id}/items`)
        .set(bearer(manager01))
        .send({ items: [{ variantId: variant.id, price: cost - 100 }] })
        .expect(200);
      expect(put.body.items[0]).toMatchObject({
        variantId: variant.id,
        price: cost - 100,
        variantSku: variant.sku,
      });
      expect(put.body.warnings[0]).toMatchObject({ code: 'PRICE_BELOW_COST' });

      await http()
        .put(`/price-lists/${list.body.id}/items`)
        .set(bearer(manager01))
        .send({ items: [{ variantId: variant.id, price: cost + 1000 }] })
        .expect(200);
      const logs = await prisma.auditLog.findMany({
        where: { action: 'PRICE_CHANGE', entityId: list.body.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs).toHaveLength(2);
      expect(logs[1]).toMatchObject({ username: 'manager01', branchId: ch01 });
      expect(logs[1]?.before).toEqual({ items: [{ variantId: variant.id, price: cost - 100 }] });

      await http()
        .post('/price-lists')
        .set(bearer(manager01))
        .send({ branchId: ch02, name: 'không được', effectiveFrom: iso(500) })
        .expect(403);
      await http()
        .put(`/price-lists/${list.body.id}/items`)
        .set(bearer(cashier01))
        .send({ items: [] })
        .expect(403);
    });
  });

  describe('GET /sync/catalog (prepares REQ-POS-05)', () => {
    it('REQ-POS-05: full download has the catalog, barcodes and the branch price lists — never cost prices', async () => {
      const res = await http()
        .get('/sync/catalog')
        .query({ branchId: ch01 })
        .set(bearer(cashier01))
        .expect(200);
      const body = syncCatalogResponseSchema.parse(res.body);
      expect(body.products.length).toBeGreaterThanOrEqual(200);
      expect(body.barcodes.length).toBeGreaterThanOrEqual(body.variants.length - 5);
      expect(body.priceLists.every((l) => l.branchId === ch01)).toBe(true);
      expect(body.priceLists.length).toBeGreaterThanOrEqual(3);
      expect(JSON.stringify(res.body)).not.toContain('costPrice');
      expect(new Date(body.nextSince).getTime()).toBeLessThan(new Date(body.serverTime).getTime());
    });

    it('REQ-POS-05: delta since a timestamp contains only what changed, incl. deleted barcodes and prices', async () => {
      const first = syncCatalogResponseSchema.parse(
        (await http().get('/sync/catalog').query({ branchId: ch01 }).set(bearer(cashier01)).expect(200)).body,
      );
      await new Promise((r) => setTimeout(r, 20));

      // change: a product price, a barcode removed, a price list item updated
      const product = await prisma.product.findFirstOrThrow({
        where: { sku: { startsWith: 'SP' } },
        include: { variants: { include: { barcodes: true } } },
      });
      const v = product.variants[0]!;
      await http()
        .patch(`/products/${product.id}`)
        .set(bearer(owner))
        .send({
          defaultPrice: product.defaultPrice + 1000,
          variants: [
            {
              id: v.id,
              sku: v.sku,
              name: v.name,
              attributes: v.attributes,
              price: v.price,
              costPrice: v.costPrice,
              minStock: v.minStock,
              barcodes: [],
            },
          ],
        })
        .expect(200);
      const { current, item } = await pricedVariant();
      await http()
        .put(`/price-lists/${current.id}/items`)
        .set(bearer(owner))
        .send({ items: [{ variantId: item.variantId, price: item.price + 500 }] })
        .expect(200);

      const delta = syncCatalogResponseSchema.parse(
        (
          await http()
            .get('/sync/catalog')
            .query({ branchId: ch01, since: first.serverTime })
            .set(bearer(cashier01))
            .expect(200)
        ).body,
      );
      expect(delta.products.map((p) => p.id)).toContain(product.id);
      expect(delta.products.length).toBeLessThan(10);
      expect(delta.barcodes).toEqual(
        expect.arrayContaining([expect.objectContaining({ variantId: v.id, deleted: true })]),
      );
      expect(delta.priceListItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ variantId: item.variantId, price: item.price + 500, deleted: false }),
        ]),
      );
      expect(delta.since).toBe(first.serverTime);
    });

    it('REQ-AUTH-01: a cashier cannot sync another branch', async () => {
      await http().get('/sync/catalog').query({ branchId: ch02 }).set(bearer(cashier01)).expect(403);
    });
  });
});
