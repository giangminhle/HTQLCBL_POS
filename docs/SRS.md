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

### 3.1 Xác thực và phân quyền – REQ-AUTH-01
Đăng nhập, JWT access 15 phút + refresh token, RBAC 5 vai trò, giới hạn dữ liệu theo chi nhánh ở tầng service.

### 3.2 Chi nhánh và kho – REQ-BR-01
### 3.3 Sản phẩm – REQ-PRD-01
### 3.4 Bảng giá – REQ-PRC-01
Giá bán lấy theo bảng giá chi nhánh; không có thì lấy giá mặc định của sản phẩm.

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
