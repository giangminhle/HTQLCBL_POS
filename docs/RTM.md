# Ma trận truy vết yêu cầu (RTM)

Mỗi yêu cầu có mã `REQ-xxx`. Test ghi mã REQ trong mô tả (`it('REQ-POS-05: ...')`), nên có thể tìm test của một yêu cầu bằng
`grep -r "REQ-POS-05" apps packages`.

**Trạng thái:** `Chưa bắt đầu` → `Đang làm` → `Hoàn thành` (đã qua DoD) · `Hoãn` · `Hủy`

| REQ | Mô tả | Thiết kế | Module code | Test case | Trạng thái |
|---|---|---|---|---|---|
| REQ-NFR-01 | Nền tảng hệ thống: health check, định dạng lỗi thống nhất `{ code, message, details }`, log có request id, kết nối admin/pos → API | SRS §4.5; README | `api/health`, `api/common`, `api/config`, `shared`, `admin`, `pos` | `apps/api/test/health.e2e-spec.ts`, `apps/api/src/common/filters/all-exceptions.filter.spec.ts`, `apps/api/src/config/env.spec.ts`, `packages/shared/src/*.test.ts`, `apps/admin/src/pages/HelloPage.test.tsx`, `apps/pos/src/pages/HelloPage.test.tsx` | Hoàn thành (Sprint 0) |
| REQ-AUTH-01 | Đăng nhập, phân quyền 5 vai trò. Gồm: khóa 15 phút sau 5 lần sai; refresh token xoay vòng, dùng lại thì thu hồi mọi phiên; người dùng mới phải đổi mật khẩu lần đầu (cờ `mustChangePassword`: chỉ cho đổi mật khẩu và đăng xuất); RBAC + giới hạn dữ liệu theo chi nhánh ở tầng service; POS giữ phiên khi offline | SRS §3.1; ADR-001 | `api/auth`, `api/users`, `api/common/authz`, `shared/auth*`, `admin` (đăng nhập, menu, route guard), `pos` (đăng nhập thu ngân, phiên offline) | `apps/api/src/common/authz/authz.spec.ts` (gồm ca **CASHIER chi nhánh A → B bị 403**), `apps/api/src/auth/auth.service.spec.ts`, `apps/api/src/auth/jwt-auth.guard.spec.ts`, `apps/api/src/common/security/password.spec.ts`, `apps/api/test/auth.e2e-spec.ts`, `apps/api/test/branches-users.e2e-spec.ts`, `packages/shared/src/{http,auth-session,csp}.test.ts`, `apps/admin/src/auth/auth-ui.test.tsx`, `apps/admin/src/security/lint-rules.test.ts`, `apps/pos/src/pos.test.tsx` | Hoàn thành (Sprint 1) – lint, unit, E2E, build qua tại máy và CI (commit 8d9ae3e) |
| REQ-AUTH-02 | Đặt lại mật khẩu nhân viên (CR-002): OWNER cho mọi người; BRANCH_MANAGER chỉ nhân viên chi nhánh mình và vai trò thấp hơn; mật khẩu tạm hiển thị 1 lần; bắt đổi ở lần đăng nhập sau; mở khóa, reset bộ đếm sai; thu hồi refresh token; ghi audit | SRS §3.1; CR-002 | `api/users` (`POST /users/:id/reset-password`), `api/common/authz/branch-scope`, `admin` (Người dùng → Đặt lại mật khẩu) | `apps/api/src/common/authz/authz.spec.ts` (policy), `apps/api/src/auth/jwt-auth.guard.spec.ts`, `apps/api/src/common/security/password.spec.ts`, `apps/api/test/branches-users.e2e-spec.ts` (reset password), `packages/shared/src/roles.test.ts`, `apps/admin/src/auth/auth-ui.test.tsx`, `apps/pos/src/pos.test.tsx` | Hoàn thành (Sprint 1) – lint, unit, E2E, build qua tại máy và CI (commit 8d9ae3e) |
| REQ-BR-01 | Quản lý chi nhánh, kho (OWNER ghi; người khác chỉ đọc chi nhánh mình; ngưng hoạt động thay vì xóa) | SRS §3.2 | `api/branches`, `admin` (Chi nhánh) | `apps/api/test/branches-users.e2e-spec.ts` (branches), `apps/api/src/common/authz/authz.spec.ts` | Hoàn thành (Sprint 1) – lint, unit, E2E, build qua tại máy và CI (commit 8d9ae3e) |
| REQ-PRD-01 | Quản lý sản phẩm, biến thể, mã vạch, đơn vị tính | SRS §3.3 | `api/products` | – | Chưa bắt đầu |
| REQ-PRC-01 | Bảng giá theo chi nhánh | SRS §3.4 | `api/pricing` | – | Chưa bắt đầu |
| REQ-INV-01 | Nhập hàng từ nhà cung cấp | SRS §3.5 | `api/inventory` | – | Chưa bắt đầu |
| REQ-INV-02 | Chuyển kho giữa chi nhánh | SRS §3.5 | `api/inventory` | – | Chưa bắt đầu |
| REQ-INV-03 | Kiểm kê, điều chỉnh tồn | SRS §3.5 | `api/inventory`, `api/audit` | – | Chưa bắt đầu |
| REQ-INV-04 | Cảnh báo tồn tối thiểu | SRS §3.5 | `api/inventory` | – | Chưa bắt đầu |
| REQ-POS-01 | Bán hàng bằng quét mã vạch / tìm kiếm | SRS §3.6 | `pos`, `api/sales` | – | Chưa bắt đầu |
| REQ-POS-02 | Thanh toán tiền mặt, thẻ, QR, kết hợp nhiều hình thức | SRS §3.6 | `pos`, `api/payments` | – | Chưa bắt đầu |
| REQ-POS-03 | In hóa đơn | SRS §3.6 | `pos` | – | Chưa bắt đầu |
| REQ-POS-04 | Đổi trả hàng | SRS §3.6 | `pos`, `api/sales`, `api/inventory` | – | Chưa bắt đầu |
| REQ-POS-05 | Bán hàng khi mất mạng và tự đồng bộ | SRS §3.6, §4.2 | `pos` (Dexie, PWA), `api/sync` | `apps/pos/src/db/index.test.ts` (IndexedDB, phiên lưu qua khởi động lại), `apps/pos/src/pos.test.tsx` (vào bán khi offline với token hết hạn, cảnh báo đăng xuất offline), `packages/shared/src/auth-session.test.ts` | Đang làm (Sprint 0: PWA + Dexie; Sprint 1: giữ phiên offline. Còn: outbox, đồng bộ hóa đơn) |
| REQ-SHF-01 | Mở ca, chốt ca, đối soát tiền mặt | SRS §3.7 | `api/shifts`, `pos` | – | Chưa bắt đầu |
| REQ-CUS-01 | Khách hàng thân thiết, tích điểm | SRS §3.8 | `api/customers` | – | Chưa bắt đầu |
| REQ-PRM-01 | Khuyến mãi (%, số tiền, mua X tặng Y) | SRS §3.9 | `api/promotions` | – | Chưa bắt đầu |
| REQ-EIV-01 | Hóa đơn điện tử (qua adapter) | SRS §3.10 | `api/einvoice` | – | Chưa bắt đầu |
| REQ-RPT-01 | Báo cáo doanh thu theo ngày/chi nhánh/nhân viên | SRS §3.11 | `api/reports`, `admin` | – | Chưa bắt đầu |
| REQ-RPT-02 | Báo cáo hàng bán chạy, tồn kho | SRS §3.11 | `api/reports`, `admin` | – | Chưa bắt đầu |
| REQ-AUD-01 | Nhật ký thao tác: interceptor `@Audited()` ghi before/after (che dữ liệu nhạy cảm); ghi đăng nhập, đăng nhập sai, khóa, đăng xuất, đổi/đặt lại mật khẩu, dùng lại token; xem log có lọc, quản lý chỉ thấy chi nhánh mình | SRS §3.12 | `api/audit`, `admin` (Nhật ký thao tác) | `apps/api/src/audit/audit.spec.ts`, `apps/api/test/branches-users.e2e-spec.ts` (audit logs), `apps/api/test/auth.e2e-spec.ts` (log khóa tài khoản, dùng lại token) | Hoàn thành (Sprint 1) – lint, unit, E2E, build qua tại máy và CI (commit 8d9ae3e) |
