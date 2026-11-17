# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), phiên bản theo [SemVer](https://semver.org/).

## [Unreleased]

### Added – Sprint 1
- Đăng nhập JWT (access 15 phút, refresh xoay vòng: admin 7 ngày, POS 30 ngày cho CASHIER/BRANCH_MANAGER), khóa 15 phút
  sau 5 lần sai, đăng xuất, đổi mật khẩu, bắt đổi mật khẩu lần đầu. (REQ-AUTH-01)
- Phân quyền 5 vai trò: `@Roles`, giới hạn dữ liệu theo chi nhánh ở tầng service (`BranchScope`). (REQ-AUTH-01)
- Đặt lại mật khẩu nhân viên với mật khẩu tạm. (REQ-AUTH-02, CR-002)
- Quản lý chi nhánh/kho và người dùng. (REQ-BR-01, REQ-AUTH-01)
- Nhật ký thao tác: `@Audited` + interceptor, `GET /audit-logs`. (REQ-AUD-01)
- Admin: trang đăng nhập, menu theo vai trò, Chi nhánh, Người dùng, Nhật ký, Đổi mật khẩu.
- POS: đăng nhập thu ngân, phiên lưu IndexedDB, tiếp tục bán khi offline. (REQ-POS-05)
- CSP chặt cho admin/POS, luật ESLint cấm `dangerouslySetInnerHTML`. (ADR-001)
- Seed: kho tổng, 3 cửa hàng, tài khoản mẫu cho 5 vai trò.

### Fixed
- E2E nạp nhầm `DATABASE_URL` của DB dev (Prisma tự nạp `.env`); `.env.test` giờ ghi đè. Script E2E in tên DB đang kết nối
  và dừng trước khi reset nếu không phải `retailchain_test`.
- Refresh token bị thu hồi do logout/đổi mật khẩu khi gửi lại không còn bị coi là đánh cắp (trước đây làm mất phiên mới
  sau khi đổi mật khẩu). Chỉ token đã xoay vòng mới kích hoạt thu hồi toàn bộ phiên.

### Changed
- Biến môi trường `JWT_REFRESH_TTL` tách thành `JWT_REFRESH_TTL_ADMIN` và `JWT_REFRESH_TTL_POS`.
- API dùng `apps/api/.env` (Prisma đọc trực tiếp); E2E dùng `apps/api/.env.test`.
- Validation chuyển từ class-validator sang Zod (`nestjs-zod`), lỗi trả `VALIDATION_ERROR` kèm `details[{path, message}]`.

## [0.1.0] - 2026-11-16 – Sprint 0

### Added
- Monorepo pnpm (`apps/api`, `apps/admin`, `apps/pos`, `packages/shared`), TypeScript strict, ESLint, Prettier.
- API: `GET /health`, Swagger tại `/docs`, định dạng lỗi `{ code, message, details }`, log JSON có `x-request-id`, kiểm tra biến môi trường. (REQ-NFR-01)
- Prisma + PostgreSQL 16, migration `init` (bảng hạ tầng `app_meta`).
- Admin và POS: trang Hello hiển thị trạng thái API/CSDL. (REQ-NFR-01)
- POS: PWA (cài được, mở khi mất mạng) và IndexedDB (Dexie) chưa có bảng. (REQ-POS-05, khung)
- Docker Compose, `.env.example`, GitHub Actions CI.
- Tài liệu dự án trong `docs/`.
