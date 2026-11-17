# Đặc tả yêu cầu phần mềm (SRS) – RetailChain POS

> Phiên bản 0.1 (khung, Sprint 0). Cấu trúc theo IEEE 830, rút gọn cho đồ án. Các mục _[Cần bổ sung]_ được điền dần theo từng Sprint.

## 1. Giới thiệu

### 1.1 Mục đích
Tài liệu mô tả yêu cầu của hệ thống quản lý chuỗi cửa hàng bán lẻ và điểm bán hàng (POS), dùng làm căn cứ cho thiết kế, kiểm thử và nghiệm thu.

### 1.2 Phạm vi
Chuỗi có nhiều chi nhánh và một kho tổng. Hệ thống gồm:
- **Web quản trị** (`apps/admin`): chủ chuỗi, quản lý chi nhánh, thủ kho, kế toán.
- **POS** (`apps/pos`): giao diện thu ngân, bán được khi mất mạng.
- **API trung tâm** (`apps/api`): quản lý tập trung, đồng bộ tồn kho và doanh thu.

Ngoài phạm vi: thương mại điện tử, kế toán tổng hợp, quản lý nhân sự/lương.

### 1.3 Thuật ngữ
| Thuật ngữ | Giải thích |
|---|---|
| POS | Point of Sale – máy bán hàng tại quầy |
| Outbox | Hàng đợi trên POS chứa giao dịch chưa gửi lên server |
| Idempotent | Gửi lại cùng một yêu cầu nhiều lần cho cùng một kết quả, không tạo bản ghi trùng |
| Sổ cái tồn kho | Ghi mọi biến động kho vào `stock_movements`; tồn = tổng các biến động |
| HĐĐT | Hóa đơn điện tử |

### 1.4 Tài liệu tham chiếu
- `README.md` – công nghệ, cách chạy, quy ước làm việc.
- `docs/RTM.md` – ma trận truy vết yêu cầu.

## 2. Mô tả tổng quan

### 2.1 Bối cảnh sản phẩm
Kiến trúc modular monolith (NestJS) + PostgreSQL. Hai ứng dụng web React gọi API qua HTTP/JSON. POS lưu dữ liệu cục bộ bằng IndexedDB và đồng bộ qua outbox.

### 2.2 Người dùng và vai trò
| Vai trò | Phạm vi dữ liệu | Công việc chính |
|---|---|---|
| OWNER | Toàn chuỗi | Cấu hình, xem báo cáo tổng, phân quyền |
| BRANCH_MANAGER | Chi nhánh của mình | Quản lý nhân viên, giá, đối soát ca, cảnh báo tồn |
| CASHIER | Chi nhánh của mình | Bán hàng, đổi trả, mở/chốt ca |
| WAREHOUSE_KEEPER | Chi nhánh/kho của mình | Nhập hàng, chuyển kho, kiểm kê |
| ACCOUNTANT | Chi nhánh của mình | Báo cáo doanh thu, đối soát |

### 2.3 Ràng buộc
Monorepo pnpm, TypeScript strict; NestJS + Prisma + PostgreSQL 16; React 18 + Vite; POS là PWA dùng Dexie (IndexedDB). Tích hợp bên ngoài qua adapter, mặc định MOCK. Tiền tệ VND lưu số nguyên. Giao diện tiếng Việt; mã nguồn và commit bằng tiếng Anh.

### 2.4 Giả định
- Mỗi quầy có một máy POS chạy trình duyệt Chromium hiện đại.
- Máy quét mã vạch hoạt động như bàn phím, kết thúc bằng Enter.

## 3. Yêu cầu chức năng
Mỗi mục: mô tả, tác nhân, luồng chính, luồng phụ, tiêu chí chấp nhận. _[Cần bổ sung ở Sprint tương ứng]_

### 3.1 Xác thực và phân quyền – REQ-AUTH-01, REQ-AUTH-02
**Tác nhân:** mọi người dùng; OWNER, BRANCH_MANAGER khi quản lý tài khoản.

**Đăng nhập (REQ-AUTH-01)**
1. Người dùng nhập tên đăng nhập (không phân biệt hoa thường) và mật khẩu. Ứng dụng gửi kèm loại client (`admin`/`pos`).
2. Hệ thống trả access token (15 phút) và refresh token: 7 ngày cho admin web và cho OWNER; 30 ngày cho app POS với vai
   trò CASHIER hoặc BRANCH_MANAGER (ADR-001).
3. Sai tên đăng nhập hay sai mật khẩu đều nhận cùng một thông báo. Sai **5 lần liên tiếp** thì tài khoản bị **khóa 15 phút**,
   kể cả khi sau đó nhập đúng mật khẩu.
4. Tài khoản bị ngưng hoạt động không đăng nhập được. Ngưng hoạt động, đổi vai trò hoặc đổi chi nhánh làm mất hiệu lực mọi
   phiên **ngay lập tức**.
5. Refresh token xoay vòng sau mỗi lần dùng; nếu một token cũ bị dùng lại thì mọi phiên của người dùng bị thu hồi.
6. Đăng xuất thu hồi refresh token. Đổi mật khẩu thu hồi mọi phiên khác.
7. Người dùng mới được tạo và người vừa được đặt lại mật khẩu phải đổi mật khẩu ở lần đăng nhập đầu tiên; trước khi đổi,
   API chỉ cho phép đổi mật khẩu và đăng xuất.
8. Chính sách mật khẩu: tối thiểu 8 ký tự, có chữ và số. Lưu bằng argon2id.

**Phân quyền**
| Chức năng | OWNER | BRANCH_MANAGER | CASHIER | WAREHOUSE_KEEPER | ACCOUNTANT |
|---|---|---|---|---|---|
| Xem chi nhánh | Tất cả | Chi nhánh mình | Chi nhánh mình | Chi nhánh mình | Chi nhánh mình |
| Tạo/sửa chi nhánh | ✓ | | | | |
| Xem/tạo/sửa người dùng | Tất cả | Chi nhánh mình, chỉ vai trò Thu ngân/Thủ kho/Kế toán | | | |
| Đặt lại mật khẩu | Mọi người (trừ chính mình) | Nhân viên chi nhánh mình, vai trò thấp hơn | | | |
| Xem nhật ký thao tác | Tất cả | Chi nhánh mình | | | |
| Đăng nhập POS | | | ✓ | | |

Người dùng không phải OWNER truy cập dữ liệu chi nhánh khác nhận `403 BRANCH_FORBIDDEN`. Việc kiểm tra nằm ở tầng service,
không chỉ ở giao diện.

**Đặt lại mật khẩu (REQ-AUTH-02, CR-002)**
1. Người quản lý chọn nhân viên và bấm "Đặt lại mật khẩu", rồi xác nhận.
2. Hệ thống sinh mật khẩu tạm 12 ký tự và hiển thị **một lần**. Hệ thống đồng thời bật cờ bắt đổi mật khẩu, mở khóa tài
   khoản, đặt lại bộ đếm đăng nhập sai, thu hồi mọi phiên cũ và ghi nhật ký `RESET_PASSWORD` (không ghi mật khẩu).
3. Nhân viên đăng nhập bằng mật khẩu tạm rồi buộc phải đổi mật khẩu.

**Tiêu chí chấp nhận:** xem các test có mã REQ-AUTH-01 và REQ-AUTH-02 trong `docs/RTM.md`.

### 3.2 Chi nhánh và kho – REQ-BR-01
- Thông tin chi nhánh: mã (duy nhất, chữ in hoa/số/gạch ngang, không đổi sau khi tạo), tên, địa chỉ, loại (Cửa hàng/Kho),
  trạng thái hoạt động.
- Chỉ OWNER được tạo và sửa chi nhánh. Không xóa chi nhánh; chỉ ngưng hoạt động, vì dữ liệu khác còn tham chiếu tới nó.
- Người dùng (trừ OWNER) thuộc đúng một chi nhánh. Không gán người dùng vào chi nhánh đã ngưng hoạt động.
- Dữ liệu mẫu: 1 kho tổng (`KHO-TONG`) và 3 cửa hàng (`CH-01`, `CH-02`, `CH-03`).
### 3.3 Sản phẩm – REQ-PRD-01
- **Danh mục**: cây nhiều cấp. Không chuyển danh mục vào chính nó hoặc danh mục con của nó. Chỉ xóa được danh mục trống;
  danh mục còn dữ liệu thì ngưng hoạt động.
- **Sản phẩm**: SKU (duy nhất), tên, danh mục, đơn vị tính, giá bán mặc định, giá vốn, tồn tối thiểu, trạng thái. Tiền là
  số nguyên VND.
- **Biến thể** (CR-004): mọi sản phẩm có ít nhất 1 biến thể; nếu không khai báo, hệ thống tạo biến thể mặc định có SKU
  trùng SKU sản phẩm. Biến thể có SKU riêng, thuộc tính (dung tích, màu…), và có thể có giá bán, giá vốn, tồn tối thiểu
  riêng; để trống thì lấy giá trị của sản phẩm. Biến thể bị bỏ khỏi sản phẩm được ngưng bán, không xóa.
- **Mã vạch**: một biến thể có nhiều mã vạch; mã vạch duy nhất trong toàn chuỗi. Mã 8 hoặc 13 chữ số phải đúng chữ số kiểm
  tra EAN-8/EAN-13; mã nội bộ 4–32 ký tự chữ/số.
- **Đơn vị tính**: Sprint 2 một đơn vị cho mỗi sản phẩm. Quy đổi thùng/lốc/lon: CR-003 (hoãn).
- **Tìm kiếm**: theo tên không phân biệt dấu ("sua" tìm được "Sữa"), theo SKU, theo mã vạch chính xác; lọc theo danh mục
  (gồm danh mục con) và trạng thái. Tra nhanh theo mã vạch cho máy quét.
- **Giá vốn**: CASHIER không bao giờ nhận được giá vốn (ẩn ở tầng serializer phía server, không có trong đồng bộ POS).
  Các vai trò khác xem được.
- **Phân quyền**: chỉ OWNER tạo/sửa danh mục, sản phẩm, import. Mọi vai trò được xem sản phẩm.
- **Import CSV**: UTF-8 có hoặc không BOM, phân cách bằng dấu phẩy hoặc chấm phẩy, tối đa 5.000 dòng hoặc 2 MB. Mỗi dòng là
  một biến thể, các dòng cùng `product_sku` là một sản phẩm; SKU đã có thì cập nhật. **Tất cả hoặc không có gì**: có lỗi thì
  không ghi gì, trả lỗi theo dòng và cột, kèm file lỗi (CSV gốc thêm cột "Lỗi"). `dryRun=true` chỉ kiểm tra. Có file mẫu.

### 3.4 Bảng giá – REQ-PRC-01
- **Quy tắc giá (quy tắc 5, sửa theo CR-004)**: giá bán của một biến thể tại chi nhánh, thời điểm `at` =
  1) giá trong bảng giá của chi nhánh đang hiệu lực tại `at`; nếu không có thì
  2) `variant.price`; nếu để trống thì
  3) `product.defaultPrice`.
- **Hiệu lực**: khoảng nửa mở [ngày bắt đầu, ngày kết thúc); ngày kết thúc để trống = vô thời hạn. Hai bảng giá đang hoạt
  động của cùng chi nhánh **không được chồng thời gian**; ràng buộc nằm ở CSDL nên hai yêu cầu gửi đồng thời cũng chỉ một
  được chấp nhận. Vi phạm trả 409 kèm tên bảng giá bị chồng.
- **Thao tác**: tạo bảng giá, sửa, "kết thúc bảng giá vào ngày X" (bảng mới có thể bắt đầu đúng ngày X), đặt/bỏ giá từng biến
  thể, xem giá áp dụng tại một thời điểm.
- **Phân quyền**: OWNER cho mọi chi nhánh; BRANCH_MANAGER chỉ chi nhánh mình; người khác chỉ xem chi nhánh mình.
- **Kiểm soát**: mọi thay đổi giá (giá mặc định, giá vốn, giá biến thể, giá trong bảng giá) ghi nhật ký `PRICE_CHANGE` với
  giá trước/sau. Giá bán thấp hơn giá vốn: cảnh báo, không chặn.
- **Đồng bộ POS**: `GET /sync/catalog?branchId&since` trả danh mục, sản phẩm, biến thể, mã vạch (cả mã đã xóa), bảng giá của
  chi nhánh kèm khoảng hiệu lực và các dòng giá thay đổi từ `since`; không có giá vốn. POS tính giá bằng chính hàm của
  server (`resolveEffectivePrice` trong `packages/shared`) nên giá offline luôn khớp.

### 3.5 Kho – REQ-INV-01..04
Tồn kho dạng sổ cái (IMPORT, SALE, RETURN, TRANSFER_OUT, TRANSFER_IN, ADJUSTMENT), `stock_balances` là cache cập nhật trong cùng transaction.

### 3.6 Bán hàng tại quầy – REQ-POS-01..05
Hóa đơn COMPLETED bất biến; đổi trả tạo phiếu RETURN. Hóa đơn offline có id UUID v7 sinh tại máy, đồng bộ idempotent; server luôn nhận hóa đơn offline, tồn âm thì ghi cảnh báo `NEGATIVE_STOCK`.

### 3.7 Ca làm việc – REQ-SHF-01
### 3.8 Khách hàng thân thiết – REQ-CUS-01
### 3.9 Khuyến mãi – REQ-PRM-01
### 3.10 Hóa đơn điện tử – REQ-EIV-01
Qua interface adapter; mặc định adapter MOCK.

### 3.11 Báo cáo – REQ-RPT-01, REQ-RPT-02
### 3.12 Nhật ký thao tác – REQ-AUD-01
Ghi `audit_logs` cho: tạo/hủy hóa đơn, điều chỉnh kho, đổi giá, đổi quyền.

Mỗi bản ghi gồm: người thực hiện (id và tên đăng nhập tại thời điểm đó), chi nhánh, thao tác, đối tượng và id, dữ liệu
**trước** và **sau**, IP, request id, thời gian. Trường nhạy cảm (mật khẩu, hash, token) luôn bị thay bằng `[REDACTED]`.
Nhật ký chỉ được thêm, không có API sửa hay xóa.

Đã ghi từ Sprint 1:
| Thao tác | Khi nào |
|---|---|
| LOGIN, LOGIN_FAILED, ACCOUNT_LOCKED, LOGOUT | Đăng nhập thành công/thất bại, bị khóa, đăng xuất |
| CHANGE_PASSWORD, RESET_PASSWORD | Đổi mật khẩu, đặt lại mật khẩu |
| REFRESH_TOKEN_REUSE | Phát hiện dùng lại refresh token đã thu hồi |
| CREATE, UPDATE (User) | Tạo/sửa người dùng, kể cả đổi vai trò (đổi quyền) và khóa |
| CREATE, UPDATE (Branch) | Tạo/sửa/ngưng hoạt động chi nhánh |

Xem nhật ký: OWNER xem tất cả; BRANCH_MANAGER chỉ xem nhật ký của chi nhánh mình. Lọc theo thao tác, đối tượng, người
dùng, khoảng ngày; có phân trang.

**Kỹ thuật:** endpoint ghi được đánh dấu `@Audited({ action, entity })`. Interceptor lấy trạng thái **trước** qua hàm đọc
do module sở hữu entity đăng ký, nên module audit không đọc bảng của module khác. Interceptor chỉ ghi khi thao tác thành
công.

## 4. Yêu cầu phi chức năng

### 4.1 Hiệu năng
- Tạo hóa đơn trên POS < 2 giây, kể cả offline.
- API p95 < 300 ms với dữ liệu mẫu.

### 4.2 Khả dụng và offline
POS là PWA, mở được khi không có mạng (app shell precache), dữ liệu bán hàng lưu IndexedDB và tự đồng bộ khi có mạng.

### 4.3 Bảo mật
JWT, RBAC, không hard-code khóa bí mật (đọc từ biến môi trường), che header `authorization`/`cookie` trong log.

### 4.4 Khả năng sử dụng
Thao tác POS hoàn toàn bằng bàn phím và máy quét mã vạch. Giao diện tiếng Việt.

### 4.5 Vận hành – REQ-NFR-01
- `GET /health` báo trạng thái API và kết nối CSDL.
- Mọi lỗi API trả về `{ code, message, details? }`.
- Mỗi request có `x-request-id` (nhận từ client hoặc tự sinh), ghi trong log JSON và trả lại trong header phản hồi.
- Tài liệu API (Swagger) tại `/docs`.
- Chạy toàn bộ hệ thống bằng `docker compose up`.

## 5. Phụ lục
_[Sơ đồ use case, ERD, sơ đồ tuần tự đồng bộ offline: bổ sung ở các Sprint sau]_
