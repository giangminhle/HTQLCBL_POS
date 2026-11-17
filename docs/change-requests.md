# Yêu cầu thay đổi (Change Requests)

Mọi tính năng ngoài phạm vi Sprint hiện tại phải ghi ở đây và được duyệt trước khi làm.

**Trạng thái:** `Đề xuất` → `Đã duyệt` / `Từ chối` → `Đã thực hiện`

## Mẫu

```markdown
## CR-XXX: <Tên ngắn gọn>

- **Ngày đề xuất:** YYYY-MM-DD
- **Người đề xuất:**
- **Sprint phát sinh:**
- **REQ liên quan:** REQ-...
- **Trạng thái:** Đề xuất

### Mô tả
Thay đổi cụ thể là gì.

### Lý do
Vì sao cần thay đổi (lỗi, góp ý của khách hàng, rủi ro kỹ thuật…).

### Tác động
| Khía cạnh | Đánh giá |
|---|---|
| Thời gian | +x ngày công; ảnh hưởng mốc Sprint nào |
| Chi phí | |
| Kỹ thuật | Module/bảng/API bị ảnh hưởng, migration, rủi ro hồi quy |
| Phạm vi | Thêm/bớt/sửa REQ nào |

### Phương án thay thế
Các lựa chọn khác và lý do không chọn.

### Quyết định
Người duyệt, ngày, kết luận.
```

## Danh sách CR

| Mã | Tên | Ngày | Trạng thái |
|---|---|---|---|
| CR-001 | Đăng nhập offline cho thu ngân khác | 2026-11-17 | Hoãn – xem xét ở Sprint 5 |
| CR-002 | Đặt lại mật khẩu nhân viên | 2026-11-17 | Đã duyệt – làm trong Sprint 1 |
| CR-003 | Quy đổi nhiều đơn vị tính | 2026-11-17 | Hoãn – xem xét lại sau Sprint 3 |
| CR-004 | Giá và thông số theo biến thể (sửa quy tắc 5) | 2026-11-17 | Đã duyệt – làm trong Sprint 2 |

---

## CR-001: Đăng nhập offline cho thu ngân khác

- **Ngày đề xuất:** 2026-11-17
- **Người đề xuất:** Nhóm phát triển (phát sinh khi lập kế hoạch Sprint 1)
- **Sprint phát sinh:** Sprint 1
- **REQ liên quan:** REQ-AUTH-01, REQ-POS-05
- **Trạng thái:** Hoãn – xem xét ở Sprint 5

### Mô tả
Khi máy POS mất mạng, một thu ngân **chưa đăng nhập trên máy đó** (ví dụ thu ngân ca sau) vẫn đăng nhập được. Cách làm
dự kiến: lúc còn mạng, POS tải về và lưu trong IndexedDB một bộ xác thực cục bộ cho các thu ngân của chi nhánh (hash
riêng cho máy hoặc mã PIN), kèm thời hạn hiệu lực và danh sách bị thu hồi.

### Lý do
Sprint 1 chỉ giữ phiên của người **đã** đăng nhập (ADR-001). Nếu mất mạng lúc đổi ca, thu ngân ca sau không vào được POS,
cửa hàng phải bán bằng tài khoản của người ca trước, làm sai số liệu ca và trách nhiệm.

### Tác động
| Khía cạnh | Đánh giá |
|---|---|
| Thời gian | Ước lượng ba điểm (ngày công): **O = 2, M = 4, P = 7** → E = (O + 4M + P) / 6 = (2 + 16 + 7) / 6 ≈ **4,2 ngày công**; σ = (P − O) / 6 ≈ 0,8 ngày |
| Chi phí | Khoảng 4–5 ngày công của 1 người, cộng thời gian kiểm thử bảo mật |
| Kỹ thuật | Endpoint mới cấp bộ xác thực offline theo chi nhánh; bảng Dexie mới; vô hiệu hóa khi user bị khóa hoặc đặt lại mật khẩu; hash lưu trên máy dùng chung làm tăng rủi ro dò mật khẩu offline (cần PIN và giới hạn số lần thử) |
| Phạm vi | Mở rộng REQ-POS-05 và REQ-AUTH-01; liên quan REQ-SHF-01 (mở/chốt ca) |

### Phương án thay thế
1. Giữ như Sprint 1: đăng xuất khi offline phải xác nhận cảnh báo "Không thể đăng nhập lại khi mất mạng".
2. Quy trình vận hành: chỉ đổi ca khi có mạng, hoặc dùng 4G dự phòng.
3. Mã PIN offline ngắn hạn do quản lý cấp.

### Quyết định
Hoãn. Xem xét lại ở Sprint 5 cùng REQ-SHF-01 (ca làm việc), vì cách đổi ca quyết định cần đăng nhập offline đến mức nào.

---

## CR-002: Đặt lại mật khẩu nhân viên

- **Ngày đề xuất:** 2026-11-17
- **Người đề xuất:** Nhóm phát triển (phát sinh khi lập kế hoạch Sprint 1)
- **Sprint phát sinh:** Sprint 1
- **REQ liên quan:** REQ-AUTH-01 → tạo mới **REQ-AUTH-02**
- **Trạng thái:** Đã duyệt – làm trong Sprint 1

### Mô tả
- OWNER đặt lại mật khẩu cho mọi người. BRANCH_MANAGER chỉ đặt lại cho nhân viên **chi nhánh mình** và **không** đặt lại
  cho người có vai trò ngang hoặc cao hơn. Không ai tự đặt lại cho chính mình (dùng Đổi mật khẩu).
- Hệ thống sinh **mật khẩu tạm** 12 ký tự, chỉ hiển thị một lần, và bật cờ `mustChangePassword`. Ở lần đăng nhập sau,
  người dùng chỉ được gọi API đổi mật khẩu và đăng xuất cho tới khi đổi xong.
- Thu hồi mọi refresh token cũ; mở khóa tài khoản và đặt lại bộ đếm đăng nhập sai; ghi audit log `RESET_PASSWORD`.

### Lý do
Không có chức năng này thì nhân viên quên mật khẩu không làm việc được, hoặc phải sửa thẳng DB (sai quy trình, không có
audit).

### Tác động
| Khía cạnh | Đánh giá |
|---|---|
| Thời gian | Khoảng 1 ngày công (1 endpoint, 1 hộp thoại admin, test), nằm trong dung lượng Sprint 1 |
| Chi phí | Không đáng kể |
| Kỹ thuật | Thêm cột `must_change_password`, `token_version` vào `users`; guard chặn API khi phải đổi mật khẩu |
| Phạm vi | Thêm REQ-AUTH-02. Cờ `mustChangePassword` dùng chung cho người dùng mới tạo (quyết định c của Sprint 1) |

### Quyết định
Đã duyệt ngày 2026-11-17, làm trong Sprint 1.

---

## CR-003: Quy đổi nhiều đơn vị tính

- **Ngày đề xuất:** 2026-11-17
- **Người đề xuất:** Nhóm phát triển (phát sinh khi lập kế hoạch Sprint 2)
- **Sprint phát sinh:** Sprint 2
- **REQ liên quan:** REQ-PRD-01 (đơn vị tính), REQ-INV-01..03, REQ-POS-01
- **Trạng thái:** Hoãn – xem xét lại sau Sprint 3
- **Giá trị nghiệp vụ:** **Cao.** Bán lẻ tạp hóa thường nhập theo thùng nhưng bán theo thùng, lốc hoặc lon; thiếu tính
  năng này thì thu ngân phải tự quy đổi và tồn kho dễ lệch.

### Mô tả
Một sản phẩm có đơn vị cơ sở (ví dụ lon) và nhiều đơn vị quy đổi (lốc = 6 lon, thùng = 24 lon). Mỗi đơn vị có thể có mã
vạch và giá riêng. Nhập kho, bán và kiểm kê theo bất kỳ đơn vị nào; sổ cái tồn kho luôn ghi theo đơn vị cơ sở.

### Lý do hoãn
Sprint 2 dùng một đơn vị cho mỗi sản phẩm. Quy đổi đơn vị ảnh hưởng trực tiếp tới sổ cái tồn kho (`stock_movements`) của
Sprint 3, nên cần chốt thiết kế tồn kho trước.

### Tác động
| Khía cạnh | Đánh giá |
|---|---|
| Thời gian | Ước lượng O/M/P = 3/5/9 ngày công → E = (3 + 20 + 9)/6 ≈ 5,3 ngày công |
| Chi phí | Khoảng 5–6 ngày công của 1 người |
| Kỹ thuật | Bảng `product_units` (hệ số quy đổi), mã vạch và giá theo đơn vị; `getEffectivePrice` thêm tham số đơn vị; sổ cái quy về đơn vị cơ sở; import CSV và đồng bộ POS thêm cột |
| Phạm vi | Mở rộng REQ-PRD-01, ảnh hưởng REQ-PRC-01, REQ-INV-*, REQ-POS-01 |

### Phương án tạm thời
Tạo biến thể riêng cho từng cách đóng gói (ví dụ "Bia lon" và "Bia thùng 24") với mã vạch và giá riêng. Nhược điểm: tồn
kho của hai biến thể không tự quy đổi.

### Quyết định
Hoãn, xem xét lại sau Sprint 3.

---

## CR-004: Giá và thông số theo biến thể (sửa quy tắc 5)

- **Ngày đề xuất:** 2026-11-17
- **Người đề xuất:** Nhóm phát triển; chủ dự án mở rộng phạm vi
- **Sprint phát sinh:** Sprint 2
- **REQ liên quan:** REQ-PRC-01, REQ-PRD-01
- **Trạng thái:** Đã duyệt – làm trong Sprint 2

### Mô tả
- `ProductVariant` có `price`, `costPrice`, `minStock`, cả ba có thể để trống; để trống thì lấy giá trị của `Product`.
- Mọi sản phẩm luôn có ít nhất 1 biến thể. Sản phẩm không khai báo biến thể được tự tạo một biến thể mặc định.
- **Quy tắc 5 mới:** giá bán = bảng giá chi nhánh đang hiệu lực → `variant.price` → `product.defaultPrice`.
- Bảng giá của cùng chi nhánh không được chồng thời gian. Khoảng hiệu lực là `[effectiveFrom, effectiveTo)`,
  `effectiveTo` để trống nghĩa là vô thời hạn. Ràng buộc nằm ở DB (exclusion constraint).

### Lý do
Các biến thể của cùng sản phẩm (dầu gội 200 ml và 400 ml) có giá khác nhau. Quy tắc 5 cũ chỉ có một giá mặc định cho
sản phẩm, nên muốn khác giá phải tách thành sản phẩm riêng hoặc lập bảng giá cho mọi chi nhánh.

### Tác động
| Khía cạnh | Đánh giá |
|---|---|
| Thời gian | Khoảng +1 ngày công trong Sprint 2 (3 cột, thêm một bậc trong hàm giá, test) |
| Chi phí | Không đáng kể |
| Kỹ thuật | Thay đổi baseline: CLAUDE.md quy tắc 5, SRS §3.4, RTM REQ-PRC-01. Hàm `getEffectivePrice` trong `shared` dùng chung cho server và POS offline |
| Phạm vi | Sửa REQ-PRC-01, mở rộng REQ-PRD-01 |

### Quyết định
Đã duyệt ngày 2026-11-17, làm trong Sprint 2.
