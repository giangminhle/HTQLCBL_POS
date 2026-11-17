# Sổ đăng ký rủi ro (Risk Register)

**Thang điểm:** Khả năng (K) và Ảnh hưởng (A) từ 1 (thấp) đến 5 (cao). **Mức = K × A**: 1–6 Thấp, 8–12 Trung bình, 15–25 Cao.
**Chiến lược:** Tránh · Giảm thiểu · Chuyển giao · Chấp nhận.

| Mã | Rủi ro | K | A | Mức | Chiến lược / biện pháp | Phụ trách | Trạng thái |
|---|---|---|---|---|---|---|---|
| R-01 | Đồng bộ offline tạo hóa đơn trùng hoặc mất hóa đơn | 3 | 5 | 15 Cao | Giảm thiểu: id UUID v7 sinh tại POS, API sync idempotent theo id, outbox chỉ xóa khi server xác nhận, test E2E mất mạng | | Mở |
| R-02 | Tồn kho sai lệch giữa các chi nhánh do bán offline đồng thời | 4 | 3 | 12 TB | Chấp nhận có kiểm soát: server nhận hóa đơn offline, ghi cảnh báo `NEGATIVE_STOCK` để quản lý đối soát | | Mở |
| R-03 | Tích hợp HĐĐT / thanh toán QR thật chậm hoặc thiếu tài khoản thử nghiệm | 3 | 3 | 9 TB | Giảm thiểu: interface adapter, mặc định MOCK; adapter thật làm sau nếu còn thời gian | | Mở |
| R-04 | Chậm tiến độ do phạm vi lớn (20 REQ) | 4 | 4 | 16 Cao | Giảm thiểu: ưu tiên luồng bán hàng cốt lõi (AUTH, PRD, PRC, INV, POS-01/02/05), kiểm soát phạm vi qua `change-requests.md` | | Mở |
| R-05 | Thư mục dự án nằm trong OneDrive: đồng bộ `node_modules` gây chậm, khóa file, lỗi build | 3 | 2 | 6 Thấp | Giảm thiểu: tạm dừng OneDrive khi code hoặc chuyển repo ra ngoài OneDrive; mã nguồn đã có GitHub | | Mở |
| R-06 | Máy phát triển chưa cài Docker nên không kiểm tra được `docker compose up` tại chỗ | 3 | 2 | 6 Thấp | Giảm thiểu: CI build image Docker mỗi lần push; cài Docker Desktop khi cần chạy toàn hệ thống | | Mở |
| R-07 | Lộ khóa bí mật (JWT, API key) trong repo | 2 | 5 | 10 TB | Tránh: `.env` trong `.gitignore`, chỉ commit `.env.example`, kiểm tra env khi khởi động | | Mở |
| R-08 | Hiệu năng báo cáo không đạt p95 < 300 ms khi dữ liệu lớn | 2 | 3 | 6 Thấp | Giảm thiểu: index theo chi nhánh/ngày, bảng tổng hợp nếu cần, đo bằng dữ liệu mẫu | | Mở |
| R-09 | Đánh cắp token qua XSS (token lưu ở localStorage/IndexedDB theo ADR-001) | 2 | 4 | 8 TB | **Chấp nhận + Giảm thiểu**: CSP chặt không có unsafe-inline/eval; ESLint cấm dangerouslySetInnerHTML và innerHTML; access token 15 phút; refresh token xoay vòng, dùng lại thì thu hồi mọi phiên; chỉ lưu hash refresh token ở server. Xem docs/design/adr-001-token-storage.md | | Mở |
| R-10 | Máy phát triển chạy PostgreSQL 18.3, khác phiên bản quy định 16 (CI và Docker dùng 16): có thể có khác biệt hành vi mà tại máy không thấy | 2 | 2 | 4 Thấp | Chấp nhận + Giảm thiểu: CI (PostgreSQL 16) là chuẩn nghiệm thu; không dùng tính năng riêng của PG 17/18; khi cài Docker (trước Sprint 8) chuyển dev sang postgres:16 trong compose | | Mở |

## Lịch sử cập nhật
| Ngày | Thay đổi |
|---|---|
| 2026-11-16 | Tạo sổ rủi ro (Sprint 0), R-01 → R-08 |
| 2026-11-17 | Sprint 1: thêm R-09 (XSS đánh cắp token) theo ADR-001 |
| 2026-11-17 | Sprint 1: thêm R-10 (PostgreSQL 18 tại máy khác 16 quy định) |
