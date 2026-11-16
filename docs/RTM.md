# Ma trận truy vết yêu cầu (RTM)

Mỗi yêu cầu có mã `REQ-xxx`. Test ghi mã REQ trong mô tả (`it('REQ-POS-05: ...')`), nên có thể tìm test của một yêu cầu bằng
`grep -r "REQ-POS-05" apps packages`.

**Trạng thái:** `Chưa bắt đầu` → `Đang làm` → `Hoàn thành` (đã qua DoD) · `Hoãn` · `Hủy`

| REQ | Mô tả | Thiết kế | Module code | Test case | Trạng thái |
|---|---|---|---|---|---|
| REQ-NFR-01 | Nền tảng hệ thống: health check, định dạng lỗi thống nhất `{ code, message, details }`, log có request id, kết nối admin/pos → API | SRS §4.5; README | `api/health`, `api/common`, `api/config`, `shared`, `admin`, `pos` | `apps/api/test/health.e2e-spec.ts`, `apps/api/src/common/filters/all-exceptions.filter.spec.ts`, `apps/api/src/config/env.spec.ts`, `packages/shared/src/*.test.ts`, `apps/admin/src/pages/HelloPage.test.tsx`, `apps/pos/src/pages/HelloPage.test.tsx` | Hoàn thành (Sprint 0) |
| REQ-AUTH-01 | Đăng nhập, phân quyền 5 vai trò | SRS §3.1 | `api/auth`, `api/users` | – | Chưa bắt đầu |
| REQ-BR-01 | Quản lý chi nhánh, kho | SRS §3.2 | `api/branches` | – | Chưa bắt đầu |
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
| REQ-POS-05 | Bán hàng khi mất mạng và tự đồng bộ | SRS §3.6, §4.2 | `pos` (Dexie, PWA), `api/sync` | `apps/pos/src/db/index.test.ts` (khung IndexedDB) | Đang làm (Sprint 0 mới dựng khung PWA + Dexie) |
| REQ-SHF-01 | Mở ca, chốt ca, đối soát tiền mặt | SRS §3.7 | `api/shifts`, `pos` | – | Chưa bắt đầu |
| REQ-CUS-01 | Khách hàng thân thiết, tích điểm | SRS §3.8 | `api/customers` | – | Chưa bắt đầu |
| REQ-PRM-01 | Khuyến mãi (%, số tiền, mua X tặng Y) | SRS §3.9 | `api/promotions` | – | Chưa bắt đầu |
| REQ-EIV-01 | Hóa đơn điện tử (qua adapter) | SRS §3.10 | `api/einvoice` | – | Chưa bắt đầu |
| REQ-RPT-01 | Báo cáo doanh thu theo ngày/chi nhánh/nhân viên | SRS §3.11 | `api/reports`, `admin` | – | Chưa bắt đầu |
| REQ-RPT-02 | Báo cáo hàng bán chạy, tồn kho | SRS §3.11 | `api/reports`, `admin` | – | Chưa bắt đầu |
| REQ-AUD-01 | Nhật ký thao tác | SRS §3.12 | `api/audit` | – | Chưa bắt đầu |
