# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), phiên bản theo [SemVer](https://semver.org/).

## [Unreleased]

### Added – Sprint 4
- Quản lý ca làm việc (`Shift`): mở ca thu ngân với tiền mặt đầu ca (`openingCash`), theo dõi doanh thu thời gian thực, chốt ca tự động tính tiền mặt lý thuyết (`expectedCash = openingCash + cashSales - cashReturns`), đối soát với tiền kiểm đếm thực tế (`closingCash`), tính chênh lệch và bắt buộc giải trình nếu có sai lệch. (REQ-SHF-01)
- Bán hàng tại quầy POS: quét mã vạch EAN-13/SKU auto-focus, tìm kiếm sản phẩm F2, mở thanh toán F9, giỏ hàng sửa số lượng, xóa dòng, chiết khấu dòng hàng; chiết khấu > 10% yêu cầu xác thực cấp quyền tức thời từ Quản lý chi nhánh hoặc Chủ chuỗi (`POST /sales/authorize-discount`). (REQ-POS-01)
- Thanh toán đa phương thức (`PaymentMethod` CASH, CARD, QR): hỗ trợ chia nhỏ thanh toán (split payment), tự động tính tiền thừa trả khách; tích hợp MOCK PaymentAdapter cho QR payment kèm nút giả lập giao dịch thành công. (REQ-POS-02)
- Idempotent sale creation: ID đơn hàng là UUID v7 do client sinh (`uuidv7()` tuân thủ RFC 9562); server kiểm tra trùng id, không trừ kho hoặc nhân đôi doanh thu nếu client gửi lại. Bán hàng tự động trừ kho qua movement `SALE` âm trong cùng transaction. (REQ-POS-01, REQ-POS-02)
- In hóa đơn nhiệt chuẩn 80mm tối ưu bằng CSS `@media print`: trình bày tên cửa hàng, địa chỉ, mã số HĐ, chi tiết dòng hàng, giảm giá, phương thức thanh toán, tiền thừa và mã vạch. (REQ-POS-03)
- Quy trình Đổi trả hàng (`SaleReturn`): tra cứu theo mã hóa đơn gốc, ràng buộc thời hạn 7 ngày, kiểm soát chặt chẽ số lượng trả không vượt số lượng đã mua trừ đi các lần đổi trả trước đó; tự động hoàn lại tồn kho chi nhánh bằng movement `RETURN` dương qua `InventoryService.applyMovements`, cập nhật trạng thái đơn hàng sang `RETURNED_PARTIAL` hoặc `RETURNED_FULL`. (REQ-POS-04)

### Added – Sprint 3
- Quản lý kho theo mô hình sổ cái (Ledger-based): bảng `stock_movements` (bất biến) và bảng cache `stock_balances`. (REQ-INV-01)
- Hàm duy nhất ghi sổ `applyMovements(movements[], tx)` đồng thời cập nhật cả `stock_movements` và `stock_balances` với row-locking `SELECT ... FOR UPDATE` sắp xếp theo `${branchId}:${variantId}` chống race condition và triệt tiêu deadlock.
- Quản lý nhà cung cấp (`Supplier`) và phiếu nhập kho (`GoodsReceipt` DRAFT → COMPLETED tạo movement `IMPORT`). (REQ-INV-01)
- Chuyển kho liên chi nhánh (`StockTransfer` DRAFT → SENT → RECEIVED): trừ kho xuất bằng `TRANSFER_OUT`, nhận kho đích bằng `TRANSFER_IN` với số lượng thực tế nhận được; tự tính chênh lệch nhận thiếu `shortageQuantity`. (REQ-INV-02)
- Kiểm kê kho (`StockCount` DRAFT → COMPLETED): snapshot tồn sổ sách `systemQuantity`, ghi nhận số đếm thực tế `actualQuantity`, chốt phiếu tự động tính delta và tạo movement `ADJUSTMENT`. (REQ-INV-03)
- Cảnh báo tồn tối thiểu `GET /inventory/low-stock` so sánh với `minStock` của biến thể hoặc sản phẩm. (REQ-INV-04)
- Admin web: 5 màn hình quản lý kho gồm Nhà cung cấp, Nhập kho, Chuyển kho, Kiểm kê, Tồn kho & Cảnh báo tồn tối thiểu kèm modal Thẻ kho (Stock card) tra cứu lịch sử movement.
- Concurrency test 50 lệnh trừ kho song song trên cùng một sản phẩm và invariant test `sum(StockMovement.quantity) === StockBalance.quantity`.

### Added – Sprint 2
- Danh mục sản phẩm dạng cây nhiều cấp; sản phẩm có biến thể (thuộc tính, giá/giá vốn/tồn tối thiểu riêng), nhiều mã vạch
  EAN-8/13 kiểm tra chữ số; tìm theo tên không dấu, SKU, mã vạch. (REQ-PRD-01, CR-004)
- Import sản phẩm từ CSV: tất cả-hoặc-không, `dryRun`, lỗi theo dòng, file lỗi, file mẫu. (REQ-PRD-01)
- Bảng giá chi nhánh với khoảng hiệu lực [from, to), không chồng thời gian (ràng buộc DB), kết thúc vào ngày X; giá áp
  dụng theo thứ tự bảng giá chi nhánh → giá biến thể → giá mặc định. (REQ-PRC-01, CR-004)
- `GET /sync/catalog?branchId&since` cho POS offline (chuẩn bị REQ-POS-05).
- Audit `PRICE_CHANGE` cho mọi thay đổi giá; cảnh báo giá bán < giá vốn.
- Admin: Danh mục, Sản phẩm, Bảng giá, Nhập CSV.
- Seed 202 sản phẩm tạp hóa/mỹ phẩm, mã EAN-13 hợp lệ; bảng giá mẫu CH-01.

### Changed – Sprint 2
- Quy tắc giá 5 (CR-004): thêm bậc `variant.price`.
- Giá vốn (`costPrice`) không bao giờ trả cho CASHIER.

### Fixed – Sprint 2
- Đổi danh mục cha bị lỗi 500; import không còn trả chi tiết lỗi nội bộ cho người dùng.


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
