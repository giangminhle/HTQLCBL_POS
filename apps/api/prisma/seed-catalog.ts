import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { normalizeSearch, toEan13 } from '@retailchain/shared';

/**
 * ~200 demo products (grocery + cosmetics) for REQ-PRD-01 / REQ-PRC-01. Deterministic and idempotent.
 * Barcodes are valid EAN-13 in the GS1 "restricted circulation" range 20–29 (in-store use), so they can
 * never collide with real products on the market (Vietnam's 893… prefix is deliberately avoided).
 */

type V = { suffix: string; label: string; attrs: Record<string, string>; factor: number };
type Item = [name: string, price: number, variants?: V[]];
type Leaf = { path: string[]; unit: string; items: Item[] };

const size = (ml: number, factor: number, unit = 'ml'): V => ({
  suffix: `${ml}${unit.toUpperCase()}`,
  label: `${ml}${unit}`,
  attrs: { 'dung tích': `${ml}${unit}` },
  factor,
});
const color = (code: string, name: string): V => ({
  suffix: code,
  label: name,
  attrs: { màu: name },
  factor: 1,
});
const SHAMPOO = [size(180, 0.6), size(370, 1), size(630, 1.55)];
const LIPSTICK = [color('DO', 'Đỏ'), color('HONG', 'Hồng'), color('CAM', 'Cam đất')];

export const SEED_CATALOG: Leaf[] = [
  {
    path: ['Thực phẩm', 'Mì gói'],
    unit: 'gói',
    items: [
      ['Mì Hảo Hảo tôm chua cay', 4500],
      ['Mì Omachi sườn hầm ngũ quả', 8000],
      ['Mì Kokomi đại 90g', 4000],
      ['Mì Cung Đình lẩu tôm', 6500],
      ['Mì 3 Miền tôm chua cay', 3500],
      ['Phở bò Vifon', 7000],
      ['Hủ tiếu Nam Vang Nhịp Sống', 9000],
      ['Bún bò Huế Cung Đình', 8500],
      ['Mì Udon Sukina', 12000],
      ['Miến Phú Hương sườn heo', 9500],
      ['Cháo Gấu Đỏ thịt bằm', 6000],
      ['Mì trộn Indomie', 7500],
    ],
  },
  {
    path: ['Thực phẩm', 'Gia vị'],
    unit: 'chai',
    items: [
      ['Nước mắm Nam Ngư 500ml', 38000],
      ['Nước tương Chinsu 250ml', 15000],
      ['Dầu ăn Tường An 1L', 52000],
      ['Hạt nêm Knorr 400g', 42000],
      ['Bột ngọt Ajinomoto 400g', 33000],
      ['Tương ớt Chinsu 250g', 16000],
      ['Muối i-ốt Bạc Liêu 500g', 6000],
      ['Đường tinh luyện Biên Hòa 1kg', 28000],
      ['Tiêu đen xay Dh Foods 50g', 22000],
      ['Dầu hào Maggi 350g', 32000],
      ['Giấm gạo Ottogi 500ml', 18000],
      ['Tương cà Cholimex 270g', 14000],
    ],
  },
  {
    path: ['Thực phẩm', 'Đồ hộp'],
    unit: 'hộp',
    items: [
      ['Cá mòi sốt cà Ba Cô Gái 155g', 21000],
      ['Pate gan Vissan 150g', 26000],
      ['Thịt heo hầm Hạ Long 150g', 32000],
      ['Cá ngừ ngâm dầu Tuna 185g', 39000],
      ['Bắp ngọt đóng hộp Dong Won', 35000],
      ['Đậu Hà Lan hộp 400g', 27000],
      ['Xúc xích Vissan 175g', 24000],
      ['Chà bông heo Vissan 100g', 45000],
      ['Sữa đặc Ông Thọ 380g', 25000],
      ['Cá thu sốt cà Hạ Long 175g', 28000],
      ['Lạp xưởng Mai Quế Lộ 500g', 95000],
      ['Trái cây nhiệt đới hộp 565g', 42000],
    ],
  },
  {
    path: ['Thực phẩm', 'Bánh kẹo'],
    unit: 'gói',
    items: [
      ['Bánh Chocopie hộp 12 cái', 55000],
      ['Bánh quy Cosy 336g', 48000],
      ['Snack Oishi tôm cay 40g', 6000],
      ['Bánh gạo One One 150g', 25000],
      ['Kẹo Alpenliebe hũ', 38000],
      ['Bánh Custas kem trứng', 52000],
      ["Snack Lay's khoai tây 52g", 12000],
      ['Bánh AFC lúa mì', 22000],
      ['Kẹo dẻo Chupa Chups', 15000],
      ['Bánh Oreo socola 133g', 19000],
      ['Hạt điều rang muối 200g', 85000],
      ['Socola KitKat 4 thanh', 18000],
    ],
  },
  {
    path: ['Đồ uống', 'Nước giải khát'],
    unit: 'chai',
    items: [
      ['Coca-Cola chai 390ml', 10000],
      ['Pepsi lon 330ml', 10000],
      ['7Up lon 330ml', 10000],
      ['Trà xanh Không Độ 455ml', 10000],
      ['Nước suối Aquafina 500ml', 6000],
      ['Sting dâu 330ml', 11000],
      ['Red Bull lon 250ml', 13000],
      ['Nước tăng lực Number 1', 11000],
      ['C2 trà chanh 455ml', 9000],
      ['Nước cam Twister 455ml', 12000],
      ['Trà Ô Long Tea+ 450ml', 11000],
      ['Nước dừa Cocoxim 330ml', 15000],
    ],
  },
  {
    path: ['Đồ uống', 'Sữa'],
    unit: 'hộp',
    items: [
      [
        'Sữa tươi Vinamilk 100% có đường 180ml',
        8000,
        [
          { suffix: 'CD', label: 'Có đường', attrs: { vị: 'Có đường' }, factor: 1 },
          { suffix: 'KD', label: 'Không đường', attrs: { vị: 'Không đường' }, factor: 1 },
          { suffix: 'IT', label: 'Ít đường', attrs: { vị: 'Ít đường' }, factor: 1 },
        ],
      ],
      ['Sữa TH true MILK 180ml', 9000],
      ['Sữa chua Vinamilk lốc 4', 26000],
      ['Sữa đậu nành Fami 200ml', 6000],
      ['Sữa Milo 180ml', 8500],
      ['Sữa Dutch Lady 180ml', 8000],
      ['Sữa chua uống Probi lốc 5', 28000],
      ['Sữa Nutifood Grow Plus 180ml', 12000],
      ['Sữa Ensure Gold 237ml', 52000],
      ['Sữa hạt óc chó TH 180ml', 15000],
    ],
  },
  {
    path: ['Đồ uống', 'Cà phê & trà'],
    unit: 'hộp',
    items: [
      ['Cà phê G7 3in1 hộp 21 gói', 62000],
      ['Cà phê Trung Nguyên S 500g', 95000],
      ['NesCafé 3in1 hộp 20 gói', 58000],
      ['Trà Lipton nhãn vàng 25 túi', 35000],
      ['Trà Cozy đào 25 túi', 32000],
      ['Cà phê Highlands rang xay 200g', 75000],
      ['Trà sữa Hillway hộp', 48000],
      ['Cà phê Vinacafé Chất 3in1', 55000],
      ['Trà atiso Ladophar', 38000],
      ['Trà gừng Hùng Phát', 25000],
    ],
  },
  {
    path: ['Đồ uống', 'Bia'],
    unit: 'lon',
    items: [
      ['Bia Saigon Special 330ml', 17000],
      ['Bia Tiger lon 330ml', 18000],
      ['Bia Heineken lon 330ml', 21000],
      ['Bia 333 lon 330ml', 14000],
      ['Bia Larue lon 330ml', 13000],
      ['Bia Huda lon 330ml', 13000],
      ['Bia Budweiser lon 330ml', 22000],
      ['Bia Sapporo lon 330ml', 20000],
    ],
  },
  {
    path: ['Hóa phẩm', 'Bột giặt & nước giặt'],
    unit: 'túi',
    items: [
      ['Bột giặt OMO 800g', 45000],
      ['Nước giặt Ariel 2.1kg', 165000],
      ['Nước giặt Surf 3.6kg', 135000],
      ['Bột giặt Tide 720g', 39000],
      ['Nước xả Comfort 1.6L', 98000],
      ['Nước giặt OMO Matic 2kg', 155000],
      ['Nước xả Downy 1.5L', 105000],
      ['Bột giặt Viso 720g', 32000],
      ['Nước tẩy Javel 1L', 22000],
      ['Nước giặt Lix 3.8kg', 99000],
    ],
  },
  {
    path: ['Hóa phẩm', 'Nước rửa chén'],
    unit: 'chai',
    items: [
      ['Nước rửa chén Sunlight chanh 750g', 28000],
      ['Nước rửa chén Mỹ Hảo 800g', 22000],
      ['Nước rửa chén Lix 1.5kg', 42000],
      ['Nước rửa chén Sunlight trà xanh 3.6kg', 115000],
      ['Nước rửa chén Joy 750ml', 30000],
      ['Bột rửa bát Finish 1kg', 245000],
    ],
  },
  {
    path: ['Hóa phẩm', 'Vệ sinh nhà cửa'],
    unit: 'chai',
    items: [
      ['Nước lau sàn Sunlight 1kg', 32000],
      ['Nước tẩy bồn cầu Vim 880ml', 36000],
      ['Nước lau kính Gift 580ml', 25000],
      ['Xịt côn trùng Raid 600ml', 78000],
      ['Giấy vệ sinh Pulppy 10 cuộn', 82000],
      ['Khăn giấy Kleenex hộp', 28000],
      ['Túi đựng rác cuộn 3 màu', 25000],
      ['Nước tẩy đa năng Cif 500ml', 45000],
      ['Xịt phòng Glade 280ml', 65000],
      ['Nước lau sàn Gift 4kg', 75000],
    ],
  },
  {
    path: ['Mỹ phẩm', 'Chăm sóc tóc'],
    unit: 'chai',
    items: [
      ['Dầu gội Clear mát lạnh bạc hà', 95000, SHAMPOO],
      ['Dầu gội Sunsilk mềm mượt', 85000, SHAMPOO],
      ['Dầu gội Head & Shoulders', 105000, SHAMPOO],
      ['Dầu gội Dove phục hồi hư tổn', 99000, SHAMPOO],
      ['Dầu xả Tresemmé 340ml', 115000],
      ['Dầu gội thảo dược Thái Dương 200ml', 75000],
      ['Dầu gội Pantene 3 phút diệu kỳ', 98000, SHAMPOO],
      ['Kem ủ tóc Tsubaki 180g', 165000],
      ['Dầu gội Rejoice 340ml', 78000],
      ['Dầu gội X-Men For Boss 380g', 125000],
    ],
  },
  {
    path: ['Mỹ phẩm', 'Chăm sóc da', 'Sữa rửa mặt'],
    unit: 'tuýp',
    items: [
      ['Sữa rửa mặt Senka Perfect Whip 120g', 89000],
      ['Sữa rửa mặt Hada Labo 80g', 82000],
      ['Sữa rửa mặt Cetaphil 125ml', 175000],
      ["Sữa rửa mặt Pond's 100g", 65000],
      ['Sữa rửa mặt Acnes 100g', 72000],
      ['Sữa rửa mặt Simple 150ml', 115000],
      ['Gel rửa mặt La Roche-Posay 200ml', 395000],
      ['Sữa rửa mặt Cerave 236ml', 325000],
    ],
  },
  {
    path: ['Mỹ phẩm', 'Chăm sóc da', 'Kem chống nắng'],
    unit: 'tuýp',
    items: [
      ['Kem chống nắng Sunplay SPF50 70g', 135000],
      ['Kem chống nắng Biore UV 50g', 165000],
      ['Kem chống nắng Anessa 60ml', 495000],
      ['Kem chống nắng Skin Aqua 25g', 99000],
      ['Kem chống nắng La Roche-Posay 50ml', 465000],
      ['Kem chống nắng Nivea Sun 50ml', 175000],
    ],
  },
  {
    path: ['Mỹ phẩm', 'Chăm sóc da', 'Dưỡng da'],
    unit: 'hũ',
    items: [
      ['Kem dưỡng Nivea Soft 100ml', 85000],
      ['Sữa dưỡng thể Vaseline 350ml', 125000],
      ['Nước hoa hồng Thayers 355ml', 295000],
      ['Kem dưỡng ẩm Hada Labo 50g', 215000],
      ['Mặt nạ giấy Innisfree', 25000],
      ['Serum Vitamin C Melano CC 20ml', 255000],
      ['Nước tẩy trang Bioderma 500ml', 425000],
      ['Nước tẩy trang Garnier 400ml', 165000],
    ],
  },
  {
    path: ['Mỹ phẩm', 'Trang điểm'],
    unit: 'cây',
    items: [
      ['Son lì Maybelline SuperStay', 245000, LIPSTICK],
      ['Son dưỡng Vaseline Lip 7g', 55000],
      ['Son kem Black Rouge', 195000, LIPSTICK],
      ['Phấn phủ Maybelline Fit Me', 189000],
      ['Mascara Maybelline Hypercurl', 165000],
      ['Kẻ mắt nước Lemonade', 145000],
      ['Cushion Missha M Magic', 315000],
      ['Son Romand Juicy Lasting', 215000, LIPSTICK],
    ],
  },
  {
    path: ['Mỹ phẩm', 'Chăm sóc răng miệng'],
    unit: 'tuýp',
    items: [
      ['Kem đánh răng P/S trắng răng 230g', 38000],
      ['Kem đánh răng Colgate MaxFresh 225g', 42000],
      ['Kem đánh răng Sensodyne 100g', 75000],
      ['Bàn chải Oral-B Pro-Health', 35000],
      ['Nước súc miệng Listerine 750ml', 125000],
      ['Kem đánh răng Closeup 230g', 39000],
      ['Bàn chải P/S than hoạt tính', 25000],
      ['Chỉ nha khoa Oral-B 50m', 65000],
      ['Nước súc miệng Thái Dương 500ml', 45000],
      ['Kem đánh răng Darlie 225g', 48000],
    ],
  },
  // Appended later: keep new leaves at the END so existing SKUs (sequence-based) stay stable.
  {
    path: ['Thực phẩm', 'Gạo & ngũ cốc'],
    unit: 'túi',
    items: [
      ['Gạo ST25 túi 5kg', 185000],
      ['Gạo Nàng Hoa 5kg', 125000],
      ['Gạo lứt đỏ 2kg', 65000],
      ['Yến mạch Quaker 800g', 95000],
      ["Ngũ cốc Kellogg's Corn Flakes 275g", 89000],
      ['Bột mì Meizan 1kg', 24000],
      ['Nếp cái hoa vàng 2kg', 72000],
      ['Ngũ cốc dinh dưỡng Việt Đài 500g', 55000],
      ['Đậu xanh cà vỏ 500g', 32000],
      ['Bún khô Safoco 500g', 22000],
    ],
  },
  {
    path: ['Thực phẩm', 'Đông lạnh'],
    unit: 'gói',
    items: [
      ['Há cảo tôm thịt Cầu Tre 500g', 72000],
      ['Chả giò rế Cầu Tre 500g', 68000],
      ['Xúc xích CP 500g', 65000],
      ['Cá viên chiên 500g', 45000],
      ['Bánh bao nhân thịt Thọ Phát', 42000],
      ['Kem Merino hộp 450ml', 59000],
      ['Tôm viên Vissan 500g', 85000],
      ['Đùi gà CP 1kg', 95000],
    ],
  },
  {
    path: ['Hóa phẩm', 'Tã & khăn ướt'],
    unit: 'gói',
    items: [
      ['Tã quần Bobby size M 76 miếng', 365000],
      ['Tã dán Huggies size S 56 miếng', 289000],
      ['Khăn ướt Bobby 100 tờ', 45000],
      ['Khăn ướt Mamamy 80 tờ', 38000],
      ['Băng vệ sinh Diana 8 miếng', 22000],
      ['Băng vệ sinh Kotex 8 miếng', 24000],
      ['Tã người lớn Caryn size M', 165000],
      ['Khăn giấy ướt Nuby 100 tờ', 49000],
    ],
  },
  {
    path: ['Mỹ phẩm', 'Chăm sóc cơ thể'],
    unit: 'chai',
    items: [
      ['Sữa tắm Dove dưỡng ẩm 530g', 145000],
      ['Sữa tắm Lifebuoy 850g', 155000],
      ['Sữa tắm Hazeline 1kg', 165000],
      ['Lăn khử mùi Nivea Men 50ml', 75000],
      ['Lăn khử mùi Rexona 50ml', 65000],
      ['Xà bông cục Lux 90g', 15000],
      ['Sữa tắm Romano 650g', 135000],
      ['Nước hoa Enchanteur 50ml', 95000],
      ['Dung dịch vệ sinh Dạ Hương 120ml', 38000],
      ['Sữa tắm Palmolive 750ml', 125000],
      ['Xịt khử mùi X-Men 150ml', 85000],
      ['Kem tẩy lông Veet 50g', 89000],
    ],
  },
];

const round = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);

export async function seedCatalog(prisma: PrismaClient, branchIds: Map<string, string>): Promise<void> {
  // Categories (idempotent by full name path).
  const categoryIds = new Map<string, string>();
  for (const leaf of SEED_CATALOG) {
    let parent = null as { id: string; path: string } | null;
    for (let depth = 0; depth < leaf.path.length; depth++) {
      const key = leaf.path.slice(0, depth + 1).join(' > ');
      let id = categoryIds.get(key);
      if (!id) {
        const name = leaf.path[depth]!;
        const existing: { id: string; path: string } | null = await prisma.category.findFirst({
          where: { name, parentId: parent?.id ?? null },
          select: { id: true, path: true },
        });
        if (existing) id = existing.id;
        else {
          const newId = randomUUID();
          await prisma.category.create({
            data: { id: newId, name, parentId: parent?.id ?? null, path: `${parent?.path ?? '/'}${newId}/` },
          });
          id = newId;
        }
        categoryIds.set(key, id);
      }
      parent = await prisma.category.findUniqueOrThrow({ where: { id }, select: { id: true, path: true } });
    }
  }

  // Products, variants, barcodes.
  let seq = 0;
  const nextBarcode = () => toEan13(`20${String(++seq).padStart(10, '0')}`);
  let n = 0;
  for (const [leafIndex, leaf] of SEED_CATALOG.entries()) {
    const categoryId = categoryIds.get(leaf.path.join(' > '))!;
    for (const [name, price, variants] of leaf.items) {
      n++;
      const sku = `SP${String(leafIndex + 1).padStart(2, '0')}${String(n).padStart(4, '0')}`;
      const defaultPrice = round(price, 500);
      const costPrice = round(price * 0.75, 100);
      const vs = variants ?? [{ suffix: '', label: name, attrs: {}, factor: 1 }];
      const codes = vs.map(() => nextBarcode()); // consume barcodes deterministically even when skipping
      if (await prisma.product.findUnique({ where: { sku }, select: { id: true } })) continue;

      await prisma.product.create({
        data: {
          sku,
          name,
          searchText: normalizeSearch(`${name} ${sku}`),
          categoryId,
          unit: leaf.unit,
          defaultPrice,
          costPrice,
          minStock: 10,
          variants: {
            create: vs.map((v, i) => {
              const vSku = v.suffix ? `${sku}-${v.suffix}` : sku;
              const vName = v.suffix ? `${name} ${v.label}` : name;
              return {
                sku: vSku,
                name: vName,
                searchText: normalizeSearch(`${vName} ${vSku} ${Object.values(v.attrs).join(' ')}`),
                attributes: v.attrs,
                price: v.factor === 1 ? null : round(price * v.factor, 500),
                costPrice: v.factor === 1 ? null : round(price * v.factor * 0.75, 100),
                barcodes: { create: [{ code: codes[i]! }] },
              };
            }),
          },
        },
      });
    }
  }

  await seedPriceLists(prisma, branchIds);
}

const DAY = 86_400_000;

/**
 * CH-01 gets three non-overlapping lists to demo every pricing case: expired, current, future.
 * Dates are relative to the first seed run; re-runs skip lists that already exist (by name).
 */
async function seedPriceLists(prisma: PrismaClient, branchIds: Map<string, string>) {
  const ch01 = branchIds.get('CH-01');
  if (!ch01) return;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const at = (days: number) => new Date(today.getTime() + days * DAY);

  const variants = await prisma.productVariant.findMany({
    orderBy: { sku: 'asc' },
    take: 30,
    select: { id: true, price: true, product: { select: { defaultPrice: true } } },
  });
  const base = (v: (typeof variants)[number]) => v.price ?? v.product.defaultPrice;

  const lists = [
    { name: 'Khuyến mãi tháng trước (đã hết hạn)', from: at(-60), to: at(-7), factor: 0.85 },
    { name: 'Giá Quận 1 hiện hành', from: at(-7), to: at(30), factor: 0.9 },
    { name: 'Giá Quận 1 quý tới', from: at(30), to: null, factor: 1.05 },
  ];
  for (const l of lists) {
    if (await prisma.priceList.findFirst({ where: { branchId: ch01, name: l.name }, select: { id: true } }))
      continue;
    await prisma.priceList.create({
      data: {
        branchId: ch01,
        name: l.name,
        effectiveFrom: l.from,
        effectiveTo: l.to,
        items: { create: variants.map((v) => ({ variantId: v.id, price: round(base(v) * l.factor, 500) })) },
      },
    });
  }
}
