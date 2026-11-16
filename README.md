# RetailChain POS

Hệ thống quản lý chuỗi cửa hàng bán lẻ và điểm bán hàng (POS), đồ án môn Quản lý dự án phần mềm.

| Thành phần | Công nghệ | Địa chỉ khi chạy |
|---|---|---|
| `apps/api` | NestJS + Prisma + PostgreSQL 16 | http://localhost:3000 (Swagger: `/docs`) |
| `apps/admin` | React 18 + Vite + Tailwind | http://localhost:5173 |
| `apps/pos` | React 18 + Vite PWA + Dexie | http://localhost:5174 |
| `packages/shared` | Kiểu dữ liệu, schema Zod dùng chung | – |

## Chạy dự án từ đầu trong 5 bước

**Yêu cầu:** Node.js 22+, Git, Docker Desktop.

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
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
```
Giá trị mặc định đã chạy được ở máy cá nhân. Đổi `JWT_*_SECRET` trước khi triển khai thật.

> Nếu máy đã cài sẵn PostgreSQL chiếm cổng 5432: đặt `POSTGRES_PORT=5433` và sửa `DATABASE_URL` thành `...@localhost:5433/...` trong `.env`.

**4. Khởi động**

Cách A: chạy toàn bộ bằng Docker (giống môi trường triển khai):
```bash
docker compose up --build
```

Cách B: chỉ chạy PostgreSQL bằng Docker, code chạy trực tiếp (có hot reload khi phát triển):
```bash
docker compose up -d postgres
pnpm --filter @retailchain/api prisma:deploy
pnpm dev
```

**5. Kiểm tra**
- Mở http://localhost:5173 (quản trị) và http://localhost:5174 (POS): trang Hello hiển thị *API: Hoạt động*, *Cơ sở dữ liệu: Đã kết nối*.
- Mở http://localhost:3000/docs để xem Swagger.

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

- Quy tắc nghiệp vụ và quy trình làm việc: xem [CLAUDE.md](CLAUDE.md).
- Mỗi yêu cầu có mã `REQ-xxx`, truy vết trong [docs/RTM.md](docs/RTM.md).
- Commit theo Conventional Commits: `feat(inventory): ...`, `fix(pos): ...`, `test: ...`.
- Lỗi API luôn có dạng `{ "code": "...", "message": "...", "details": ... }`. Mỗi phản hồi có header `x-request-id`; hãy ghi lại id này khi báo lỗi.
