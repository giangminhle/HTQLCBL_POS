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

## Sprint 1 – Xác thực, chi nhánh, nhật ký

- **Thời gian:** 2026-11-17
- **Mục tiêu:** Đăng nhập và phân quyền 5 vai trò, quản lý chi nhánh và người dùng, nhật ký thao tác; admin web và POS có
  đăng nhập; POS giữ phiên khi offline.
- **REQ:** REQ-AUTH-01, REQ-AUTH-02 (mới, từ CR-002), REQ-BR-01, REQ-AUD-01; một phần REQ-POS-05 (phiên offline).
- **Trạng thái:** ✅ **Hoàn thành** – `pnpm lint && pnpm test && pnpm build` qua tại máy (PostgreSQL 18) và trên CI
  (commit `8d9ae3e`, 2/2 job xanh: lint/test/build với E2E trên PostgreSQL 16, build image Docker).
  Ngoại lệ DoD: "chạy bằng `docker compose up` với dữ liệu mẫu" chưa chạy thật vì chưa có Docker (R-06); image đã build
  được trên CI. Kiểm chứng khi cài Docker (trước Sprint 8).

### Quyết định đã duyệt trước khi code
| # | Quyết định | Ghi ở |
|---|---|---|
| 1 | E2E tại máy chạy trên `retailchain_test` (reset schema mỗi lần); CI dùng Postgres riêng; Docker cài trước Sprint 8 | README, CI |
| 2 | Token trả trong body; admin lưu localStorage, POS lưu IndexedDB; refresh token xoay vòng, dùng lại thì thu hồi mọi phiên; chỉ lưu hash; CSP chặt; cấm `dangerouslySetInnerHTML` | ADR-001, R-09 |
| 2a | Refresh token 30 ngày cho phiên app POS với vai trò CASHIER/BRANCH_MANAGER; OWNER luôn 7 ngày; admin web 7 ngày | ADR-001 |
| 3 | Đăng nhập offline cho thu ngân khác: hoãn | CR-001 |
| 4 | Đặt lại mật khẩu nhân viên: làm trong Sprint 1 | CR-002, REQ-AUTH-02 |
| b | Đặt lại mật khẩu thì mở khóa, reset bộ đếm sai, ghi audit | CR-002 |
| c | Người dùng mới phải đổi mật khẩu lần đầu; khi cờ bật API chỉ cho đổi mật khẩu và đăng xuất | REQ-AUTH-01 (RTM) |

### Đã làm
- **DB (migration `sprint1_auth_branches_audit`):** `branches`, `users`, `refresh_tokens`, `audit_logs`, enum `Role`,
  `BranchType`, `AuthClient`.
- **API:**
  - `auth`: login, refresh (xoay vòng + phát hiện dùng lại), logout, change-password, me; argon2id; khóa 15 phút sau 5 lần sai.
  - `common/authz`: `@Roles` + `RolesGuard`, `BranchScope` (helper ở service) + `@BranchScoped` + `BranchScopeGuard`,
    `@Public`, `@AllowWhenPasswordChangeRequired`.
  - `branches`: CRUD (OWNER ghi, người khác chỉ đọc chi nhánh mình).
  - `users`: CRUD theo phạm vi, đặt lại mật khẩu.
  - `audit`: `@Audited` + interceptor, `GET /audit-logs`.
  - DTO dùng chung bằng Zod (`nestjs-zod`), Swagger tự sinh từ schema.
  - Seed: 1 kho tổng, 3 cửa hàng, 7 tài khoản (đủ 5 vai trò).
- **Admin:** đăng nhập, bắt đổi mật khẩu, layout có menu theo vai trò, trang Chi nhánh, Người dùng (kèm đặt lại mật khẩu,
  mật khẩu tạm hiển thị 1 lần), Nhật ký (xem before/after).
- **POS:** đăng nhập chỉ cho thu ngân, phiên lưu trong IndexedDB (Dexie v2), vào bán được khi offline dù token hết hạn,
  banner "đăng nhập lại để đồng bộ", cảnh báo đăng xuất khi offline.
- **Bảo mật frontend:** CSP chung (`buildCsp`) cho nginx và `vite preview`; luật ESLint cấm `dangerouslySetInnerHTML`,
  `innerHTML`, `eval`.
- **Tài liệu:** ADR-001, R-09, CR-001, CR-002, RTM, SRS §3.1/3.2/3.12, README.

### Quyết định kỹ thuật phát sinh
| Quyết định | Lý do |
|---|---|
| Thêm `users.token_version`; access token mang `ver`; guard đọc lại user mỗi request | Thu hồi phiên có hiệu lực **ngay** khi đặt lại mật khẩu, khóa, đổi vai trò, mà module `users` không cần gọi module `auth` (tránh phụ thuộc vòng) |
| `audit_logs` có thêm `username` (bản chụp) và `branch_id`, `request_id` | Nhật ký giữ nguyên khi user đổi tên; lọc log theo chi nhánh cho quản lý; nối log với log server |
| Module audit lấy `before` qua `AuditSnapshotRegistry` do từng module đăng ký | Tuân thủ quy tắc "module không đọc bảng của module khác" |
| Ghi audit lỗi thì chỉ log lỗi, không hủy thao tác | Audit ghi sau khi thao tác đã commit; muốn chung transaction cần Unit of Work, để dành cho Sprint hóa đơn |
| Client chỉ chạy một lần refresh tại một thời điểm, khóa giữa các tab bằng Web Locks | Tránh báo nhầm "dùng lại token" khi mở nhiều tab |
| POS chỉ cho CASHIER đăng nhập (đúng yêu cầu Sprint 1) dù server đã hỗ trợ hạn 30 ngày cho BRANCH_MANAGER trên POS | Quản lý bán hàng trên POS chưa có yêu cầu; bật bằng cách thêm vai trò vào `POS_ROLES` |
| Mã lỗi riêng: `423 ACCOUNT_LOCKED`, `403 PASSWORD_CHANGE_REQUIRED`, `400 WRONG_PASSWORD` (không dùng 401 khi sai mật khẩu hiện tại) | 401 sẽ khiến client tưởng phiên hết hạn và tự refresh |
| Bỏ `class-validator`, dùng `nestjs-zod` | Một nguồn schema (Zod trong `shared`) cho API, admin, POS |

### Kết quả kiểm chứng (tại máy, 2026-11-17)
- DB: PostgreSQL **18.3** cài trên máy (dự án quy định 16; CI dùng 16). `retailchain_dev`: đã áp 2 migration, seed
  4 chi nhánh và 7 tài khoản.
- `pnpm lint`: qua (0 lỗi, 13 cảnh báo `react-refresh/only-export-components` vì file trang export kèm hàm tiện ích).
- `pnpm test`: qua.
  - Unit: **123** (api 72, shared 21, admin 16, pos 14).
  - E2E API trên `retailchain_test`: **41**.
- `pnpm build`: qua. Bản build admin/POS không có script inline; `vite preview` trả đúng header CSP.
- Sau khi chạy E2E, `retailchain_dev` vẫn nguyên (7 user, không có user `e2e.*`).

### Lỗi phát hiện và sửa trong Sprint (test tái hiện trước, sửa sau)
| # | Lỗi | Phát hiện bởi | Test tái hiện | Sửa |
|---|---|---|---|---|
| 1 | E2E kết nối nhầm **`retailchain_dev`**: `@prisma/client` tự nạp `apps/api/.env` khi import, `dotenv` không ghi đè nên `.env.test` bị bỏ qua. Nếu không có chốt chặn, `migrate reset` đã xóa DB dev | Chốt chặn tên DB (in `current_database()`, chỉ cho phép `retailchain_test`) | `test/load-test-env.spec.ts` | `loadTestEnv` dùng `override: true` (commit `be4e85e`) |
| 2 | Thiết bị cũ refresh sau khi người dùng **đổi mật khẩu** bị coi là "dùng lại token", làm thu hồi luôn phiên mới vừa tạo | E2E `change-password` | `auth.service.spec.ts`: token bị thu hồi nhưng chưa xoay vòng → 401, không thu hồi phiên khác; E2E "old device refreshing after a password change…" | Chỉ coi là đánh cắp khi token **đã xoay vòng** (`replaced_by_id` khác null). ADR-001 đã cập nhật (commit `50b0685`) |

### Bổ sung theo yêu cầu khi chạy E2E
- `test/prepare-test-database.ts`: mỗi lần chạy E2E đều in host, DB và user (không in mật khẩu), sau đó in
  `Connected database: …` lấy từ `SELECT current_database()`. Script **dừng trước khi reset** nếu tên DB trong URL hoặc DB
  thực sự đang kết nối khác `retailchain_test`. Có 7 unit test (`test/db-guard.spec.ts`).

### Tồn đọng
- Kiểm chứng `docker compose up` khi cài Docker (trước Sprint 8).
- Playwright E2E giao diện: để Sprint POS đầu tiên.
