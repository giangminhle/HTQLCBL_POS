import { Prisma } from '@prisma/client';
import { Role } from '@retailchain/shared';
import { PriceListsService, isOverlapViolation } from './price-lists.service';

describe('isOverlapViolation', () => {
  it('REQ-PRC-01: recognises the PostgreSQL exclusion-constraint error (23P01)', () => {
    const err = new Prisma.PrismaClientUnknownRequestError(
      'conflicting key value violates exclusion constraint "price_lists_no_overlap"',
      { clientVersion: 'x' },
    );
    expect(isOverlapViolation(err)).toBe(true);
    expect(isOverlapViolation(new Error('Code: `23P01`'))).toBe(true);
    expect(isOverlapViolation(new Error('unique constraint'))).toBe(false);
  });
});

describe('PriceListsService.getEffectivePrice (REQ-PRC-01)', () => {
  const BRANCH = '00000000-0000-0000-0000-00000000000a';
  const at = new Date('2026-12-15T10:00:00Z');

  function setup(lists: object[], entries: object[], variantPrice: number | null = 45_000) {
    const prisma = {
      priceList: { findMany: jest.fn().mockResolvedValue(lists) },
      priceListItem: { findMany: jest.fn().mockResolvedValue(entries) },
    };
    const products = {
      getPricingBase: jest
        .fn()
        .mockResolvedValue({
          variantId: 'v1',
          variantPrice,
          productDefaultPrice: 50_000,
          effectiveCost: 30_000,
        }),
    };
    const service = new PriceListsService(
      prisma as never,
      products as never,
      {} as never,
      {} as never,
      { register: jest.fn() } as never,
    );
    return { service, prisma };
  }

  it('REQ-PRC-01: has branch price → branch price', async () => {
    const { service } = setup(
      [
        {
          id: 'pl',
          branchId: BRANCH,
          effectiveFrom: new Date('2026-12-01'),
          effectiveTo: null,
          isActive: true,
        },
      ],
      [{ priceListId: 'pl', variantId: 'v1', price: 39_000, deletedAt: null }],
    );
    await expect(service.getEffectivePrice('v1', BRANCH, at)).resolves.toMatchObject({
      price: 39_000,
      source: 'BRANCH_PRICE_LIST',
      priceListId: 'pl',
    });
  });

  it('REQ-PRC-01: branch price expired → variant price', async () => {
    const { service } = setup(
      [
        {
          id: 'pl',
          branchId: BRANCH,
          effectiveFrom: new Date('2026-11-01'),
          effectiveTo: new Date('2026-12-01'),
          isActive: true,
        },
      ],
      [{ priceListId: 'pl', variantId: 'v1', price: 39_000 }],
    );
    await expect(service.getEffectivePrice('v1', BRANCH, at)).resolves.toMatchObject({
      price: 45_000,
      source: 'VARIANT',
    });
  });

  it('REQ-PRC-01: no branch price → variant price, else product default price', async () => {
    await expect(setup([], []).service.getEffectivePrice('v1', BRANCH, at)).resolves.toMatchObject({
      source: 'VARIANT',
    });
    await expect(setup([], [], null).service.getEffectivePrice('v1', BRANCH, at)).resolves.toMatchObject({
      price: 50_000,
      source: 'PRODUCT_DEFAULT',
    });
  });

  it('REQ-PRC-01: queries only active lists of the branch covering `at`', async () => {
    const { service, prisma } = setup([], []);
    await service.getEffectivePrice('v1', BRANCH, at);
    expect(prisma.priceList.findMany).toHaveBeenCalledWith({
      where: {
        branchId: BRANCH,
        isActive: true,
        effectiveFrom: { lte: at },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
      },
    });
  });

  it('REQ-AUTH-01: a cashier cannot ask prices of another branch', async () => {
    const { service } = setup([], []);
    const cashier = {
      id: 'c',
      username: 'c',
      fullName: 'c',
      role: Role.CASHIER,
      branchId: 'other',
      mustChangePassword: false,
    };
    await expect(service.getEffectivePriceFor(cashier, 'v1', BRANCH, at)).rejects.toMatchObject({
      status: 403,
    });
  });
});
