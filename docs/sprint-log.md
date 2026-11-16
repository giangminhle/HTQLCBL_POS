# Nhật ký Sprint

## Sprint 0 – Khởi tạo nền tảng

- **Thời gian:** 2026-11-16
- **Mục tiêu:** Dựng monorepo và hạ tầng chạy được từ đầu đến cuối, chưa có nghiệp vụ.
- **REQ:** REQ-NFR-01 (mới thêm cho phần nền tảng); dựng khung cho REQ-POS-05 (PWA + Dexie).

### Đã làm
- Monorepo pnpm: `apps/api`, `apps/admin`, `apps/pos`, `packages/shared`; TypeScript strict, ESLint 9 (flat config), Prettier dùng chung.
- `apps/api`: NestJS + Prisma (PostgreSQL), `GET /health` (kiểm tra DB), Swagger `/docs`, exception filter toàn cục trả `{ code, message, details }`, logger pino có request id (`x-request-id`), kiểm tra biến môi trường bằng Zod khi khởi động.
- `apps/admin`, `apps/pos`: React 18 + Vite + Tailwind + TanStack Query + React Router, trang Hello gọi `/health`.
- `apps/pos`: PWA (vite-plugin-pwa, precache app shell), Dexie `PosDatabase` version 1 chưa có bảng.
- `packages/shared`: schema Zod `HealthResponse`, `ApiError`, mã lỗi, vai trò, API client dùng chung cho frontend.
- Docker Compose (postgres, api, admin, pos), `.env.example`, GitHub Actions (lint, format, migrate, test, build, build Docker).
- Tài liệu: SRS (khung), RTM, change-requests, risk-register, sprint-log, README, CHANGELOG.

### Quyết định kỹ thuật
| Quyết định | Lý do |
|---|---|
| Thêm bảng hạ tầng `app_meta` (key/value) và migration `init` | Prisma không sinh client khi schema chưa có model nào. Bảng này không thuộc nghiệp vụ. |
| Frontend dùng `@retailchain/shared` trực tiếp từ mã nguồn (alias Vite) | Tránh lỗi trộn CommonJS/ESM khi Vite dùng package liên kết; API dùng bản build CommonJS. |
| `/health` luôn trả 200, báo `status: degraded`, `db: down` khi mất DB | API vẫn khởi động khi DB chưa sẵn sàng; container không bị restart liên tục. |
| Thêm REQ-NFR-01 | Để test Sprint 0 có mã REQ truy vết được. |

### Kết quả kiểm chứng
- `pnpm lint` (ESLint + typecheck 4 package): qua.
- `pnpm test`: 23 test qua (api 12, shared 6, admin 2, pos 3).
- `pnpm build`: qua (api, admin, pos + service worker).
- Chạy thử API build: `/health`, `/docs`, lỗi 404 đúng định dạng, header `x-request-id`.
- **Chưa kiểm chứng tại máy:** `docker compose up` (máy chưa cài Docker). CI có job build image.

### Tồn đọng / chuyển Sprint sau
- Playwright E2E: chưa cài, đưa vào Sprint có luồng bán hàng đầu tiên.
- Icon PWA hiện là SVG tạm; cần icon PNG 192/512 trước khi triển khai thật.
