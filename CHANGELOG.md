# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), phiên bản theo [SemVer](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-16 – Sprint 0

### Added
- Monorepo pnpm (`apps/api`, `apps/admin`, `apps/pos`, `packages/shared`), TypeScript strict, ESLint, Prettier.
- API: `GET /health`, Swagger tại `/docs`, định dạng lỗi `{ code, message, details }`, log JSON có `x-request-id`, kiểm tra biến môi trường. (REQ-NFR-01)
- Prisma + PostgreSQL 16, migration `init` (bảng hạ tầng `app_meta`).
- Admin và POS: trang Hello hiển thị trạng thái API/CSDL. (REQ-NFR-01)
- POS: PWA (cài được, mở khi mất mạng) và IndexedDB (Dexie) chưa có bảng. (REQ-POS-05, khung)
- Docker Compose, `.env.example`, GitHub Actions CI.
- Tài liệu dự án trong `docs/`.
