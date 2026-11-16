# RetailChain POS

Hệ thống quản lý chuỗi cửa hàng bán lẻ và điểm bán hàng (POS), đồ án môn Quản lý dự án phần mềm.

| Thành phần | Công nghệ | Địa chỉ khi chạy |
|---|---|---|
| `apps/api` | NestJS + Prisma + PostgreSQL 16 | http://localhost:3000 (Swagger: `/docs`) |
| `apps/admin` | React 18 + Vite + Tailwind | http://localhost:5173 |
| `apps/pos` | React 18 + Vite PWA + Dexie | http://localhost:5174 |
| `packages/shared` | Kiểu dữ liệu, schema Zod dùng chung | – |

## Chạy dự án từ đầu trong 5 bước

**Yêu cầu:** Node.js 22+, Git, và PostgreSQL 16 (cài trên máy hoặc qua Docker Desktop).

**1. Lấy mã nguồn**
```bash
git clone https://github.com/giangminhle/HTQLCBL_POS.git
cd HTQLCBL_POS
```

**2. Bật pnpm và cài thư viện**
```bash
corepack enable
pnpm install
```

**3. Tạo file môi trường**
```bash
cp .env.example .env                                  # dùng cho docker compose
cp apps/api/.env.example apps/api/.env                # API chạy trực tiếp (pnpm dev)
cp apps/api/.env.test.example apps/api/.env.test      # E2E test (DB tên phải kết thúc bằng _test)
```
(Windows PowerShell: dùng `Copy-Item` thay cho `cp`.) Thay `CHANGE_ME` trong `DATABASE_URL` bằng mật khẩu PostgreSQL.
Các file `.env`, `.env.test` đã nằm trong `.gitignore`, không bao giờ commit.

> Nếu máy đã có PostgreSQL chiếm cổng 5432: dùng luôn PostgreSQL đó (tạo user `retailchain` có quyền CREATEDB, hai DB
> `retailchain_dev` và `retailchain_test`), hoặc đặt `POSTGRES_PORT=5433` cho Docker.

**4. Khởi động**

Cách A: chạy toàn bộ bằng Docker (giống môi trường triển khai):
```bash
docker compose up --build
docker compose exec api pnpm exec prisma db seed      # dữ liệu mẫu, chạy một lần
```

Cách B: PostgreSQL có sẵn trên máy, code chạy trực tiếp (có hot reload):
```bash
pnpm --filter @retailchain/api prisma:deploy          # tạo bảng theo migration
pnpm --filter @retailchain/api prisma:seed            # dữ liệu mẫu (chạy lại nhiều lần không bị trùng)
pnpm dev
```

**5. Kiểm tra**
- Admin http://localhost:5173: đăng nhập `owner` / `Owner@2026`, thấy menu Chi nhánh, Người dùng, Nhật ký thao tác.
- POS http://localhost:5174: đăng nhập `cashier01` / `Cashier@2026`. Tắt mạng (DevTools → Network → Offline) rồi tải
  lại trang: POS vẫn vào màn hình bán hàng.
- Swagger http://localhost:3000/docs: gọi `POST /auth/login`, bấm **Authorize** và dán `accessToken`.

### Tài khoản mẫu (chỉ dùng cho môi trường dev)

| Tên đăng nhập | Mật khẩu | Vai trò | Chi nhánh |
|---|---|---|---|
| `owner` | `Owner@2026` | Chủ chuỗi (OWNER) | – (toàn chuỗi) |
| `manager01` | `Manager@2026` | Quản lý chi nhánh | CH-01 Cửa hàng Quận 1 |
| `manager02` | `Manager@2026` | Quản lý chi nhánh | CH-02 Cửa hàng Quận 3 |
| `cashier01` | `Cashier@2026` | Thu ngân | CH-01 |
| `cashier02` | `Cashier@2026` | Thu ngân | CH-02 |
| `warehouse01` | `Warehouse@2026` | Thủ kho | KHO-TONG Kho tổng |
| `accountant01` | `Accountant@2026` | Kế toán | CH-01 |

Chi nhánh mẫu: `KHO-TONG` (kho tổng), `CH-01`, `CH-02`, `CH-03` (cửa hàng). Seed không ghi đè mật khẩu đã đổi.
**Không dùng các mật khẩu này ở môi trường thật.**

### Test

- `pnpm test` chạy unit test (Jest/Vitest) **và** E2E của API trên PostgreSQL thật.
- E2E đọc `apps/api/.env.test`, rồi **xóa sạch và tạo lại schema** của DB đó (`prisma migrate reset`) và seed trước mỗi lần
  chạy. Để an toàn, test từ chối chạy nếu tên DB không kết thúc bằng `_test`.
- Chỉ chạy unit test của API: `pnpm --filter @retailchain/api test:unit`. Chỉ E2E: `pnpm --filter @retailchain/api test:e2e`.

## Lệnh thường dùng

| Lệnh | Tác dụng |
|---|---|
| `pnpm dev` | Chạy api, admin, pos ở chế độ phát triển |
| `pnpm lint` | ESLint + kiểm tra kiểu cho mọi package |
| `pnpm test` | Chạy toàn bộ test (Jest cho api, Vitest cho phần còn lại) |
| `pnpm build` | Build mọi package |
| `pnpm format` | Định dạng mã bằng Prettier |
| `pnpm --filter @retailchain/api prisma:migrate` | Tạo migration mới khi sửa `schema.prisma` |

Một Sprint chỉ được đánh dấu hoàn thành khi `pnpm lint && pnpm test && pnpm build` đều qua.

## Cấu trúc thư mục

```
apps/
  api/        NestJS: src/<module>/, prisma/schema.prisma, test/ (e2e)
  admin/      Web quản trị
  pos/        Giao diện thu ngân (PWA, offline)
packages/
  shared/     DTO, schema Zod, API client dùng chung
docker/       Dockerfile + nginx cho frontend
docs/         SRS, RTM, change requests, risk register, sprint log
```

## Quy ước

- Yêu cầu và quy tắc nghiệp vụ: xem [docs/SRS.md](docs/SRS.md).
- Trước khi code một Sprint: trình bày kế hoạch, chờ duyệt. Tính năng ngoài phạm vi ghi vào [docs/change-requests.md](docs/change-requests.md).
- Khi sửa lỗi: viết test tái hiện lỗi trước rồi mới sửa.
- Mỗi yêu cầu có mã `REQ-xxx`, truy vết trong [docs/RTM.md](docs/RTM.md).
- Commit theo Conventional Commits: `feat(inventory): ...`, `fix(pos): ...`, `test: ...`.
- Bảo mật frontend (token, CSP): xem [docs/design/adr-001-token-storage.md](docs/design/adr-001-token-storage.md). Không dùng `dangerouslySetInnerHTML` (lint sẽ báo lỗi).
- Lỗi API luôn có dạng `{ "code": "...", "message": "...", "details": ... }`. Mỗi phản hồi có header `x-request-id`; hãy ghi lại id này khi báo lỗi.
