# ADR-001: Nơi lưu token đăng nhập ở admin web và POS

- **Trạng thái:** Đã chấp nhận
- **Ngày:** 2026-11-17
- **Sprint:** 1
- **Liên quan:** REQ-AUTH-01, REQ-AUTH-02, REQ-POS-05, R-09 (risk register)

## Bối cảnh

Hệ thống dùng JWT: access token sống ngắn và refresh token sống dài. Cần quyết định token được trả về và lưu ở đâu
trên hai ứng dụng web:

- **Admin web** dùng cho chủ chuỗi, quản lý, thủ kho, kế toán. Luôn có mạng.
- **POS** là PWA cho thu ngân, phải **bán được khi mất mạng** (REQ-POS-05). Máy có thể offline nhiều ngày, rồi mở lại
  ứng dụng vẫn phải vào được màn hình bán hàng.

Ràng buộc: API và hai frontend chạy ở origin khác nhau (cổng 3000, 5173, 5174), nên cookie sẽ là cookie cross-site.
Đội có ít thời gian, ưu tiên một cơ chế dùng chung cho cả hai ứng dụng.

## Các phương án

| # | Phương án | Ưu điểm | Nhược điểm |
|---|---|---|---|
| A | Trả token trong body; admin lưu `localStorage`, POS lưu IndexedDB | Đơn giản, một cơ chế cho cả hai app; POS lưu phiên được khi offline; không cần CSRF | JavaScript đọc được token: nếu có lỗ hổng XSS thì token bị đánh cắp |
| B | Refresh token trong cookie `httpOnly; Secure; SameSite`, access token chỉ giữ trong bộ nhớ | JavaScript không đọc được refresh token | Phải cấu hình CORS có credentials, chống CSRF, cookie cross-site; POS khi offline không biết phiên còn hay không; hai cơ chế khác nhau cho admin và POS |
| C | Chỉ giữ token trong bộ nhớ, không lưu | An toàn nhất trước XSS lưu trữ | Mỗi lần tải lại trang phải đăng nhập lại; POS mất phiên khi mất mạng, vi phạm REQ-POS-05 |

## Quyết định

Chọn **phương án A**, kèm các biện pháp bắt buộc sau.

### 1. Thời hạn token
| Token | Thời hạn |
|---|---|
| Access token (JWT HS256) | 15 phút (`JWT_ACCESS_TTL`) |
| Refresh token phiên **admin web** | 7 ngày (`JWT_REFRESH_TTL_ADMIN`) |
| Refresh token phiên **app POS** với vai trò **CASHIER** hoặc **BRANCH_MANAGER** | 30 ngày (`JWT_REFRESH_TTL_POS`) |
| Refresh token của **OWNER** ở mọi app | 7 ngày |

Client tự khai báo `client: 'admin' | 'pos'` khi đăng nhập. Server không tin hoàn toàn giá trị này: hạn 30 ngày chỉ được cấp
khi vai trò là CASHIER hoặc BRANCH_MANAGER (`refreshTtlFor()` trong `apps/api/src/auth/auth.constants.ts`). Tài khoản
quyền cao nhất (OWNER) luôn có phiên ngắn.

### 2. Xoay vòng refresh token và phát hiện dùng lại
- Mỗi lần gọi `/auth/refresh`, token cũ bị thu hồi và server cấp token mới. Thao tác này là một transaction, có điều kiện
  `revokedAt IS NULL`, nên hai request đồng thời không thể cùng xoay vòng một token.
- Nếu một token **đã bị xoay vòng** (đã có token thay thế, `replaced_by_id` khác null) được gửi lại, server coi là token
  đã bị đánh cắp: **thu hồi toàn bộ phiên của user** (tăng `users.token_version` và đánh dấu mọi refresh token là revoked),
  ghi audit `REFRESH_TOKEN_REUSE`, trả `401 REFRESH_TOKEN_REUSED`.
- Token bị thu hồi do **logout, đổi mật khẩu, đặt lại mật khẩu** (không có token thay thế) khi gửi lại chỉ nhận
  `401 INVALID_REFRESH_TOKEN`, không thu hồi các phiên khác. *Sửa trong Sprint 1 sau khi E2E phát hiện:* nếu coi các token
  này là bị đánh cắp, thì thiết bị cũ (ví dụ POS) refresh sau khi người dùng đổi mật khẩu sẽ làm mất luôn phiên mới vừa tạo.
- Để tránh báo nhầm khi người dùng mở nhiều tab: client chỉ chạy một lần refresh tại một thời điểm và khóa giữa các tab
  bằng Web Locks API. Trước khi refresh, client đọc lại storage; nếu tab khác đã xoay vòng thì dùng token mới đó.

### 3. Lưu trữ phía server
- Bảng `refresh_tokens` chỉ lưu **SHA-256** của token, không bao giờ lưu token gốc.
- **Logout** thu hồi refresh token đã gửi. **Đổi mật khẩu** thu hồi mọi refresh token và cấp cặp mới cho phiên hiện tại.
  **Đặt lại mật khẩu** (REQ-AUTH-02), **ngưng hoạt động** user hoặc **đổi vai trò/chi nhánh** đều thu hồi mọi phiên.
- Access token mang `ver` (bằng `token_version`). Guard đọc lại user trong DB ở mỗi request, nên việc thu hồi có hiệu lực
  **ngay lập tức** thay vì chờ access token hết hạn.

### 4. Giảm thiểu XSS
- **Content-Security-Policy chặt** cho admin và POS (nguồn duy nhất: `buildCsp()` trong `packages/shared/src/csp.ts`):
  `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' <API>; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`.
  Không có `unsafe-inline` hay `unsafe-eval`.
  - Docker/nginx: header CSP đặt trong `docker/nginx-spa.conf.template`, có unit test so khớp với `buildCsp()`.
  - `vite preview`: cùng header.
  - `vite dev`: **không** áp CSP, vì HMR của Vite cần script inline. Chỉ dùng cho phát triển.
- **Cấm `dangerouslySetInnerHTML`** và gán `innerHTML`/`outerHTML` bằng luật ESLint (`no-restricted-syntax`), cùng `no-eval`.
  Có test xác nhận luật hoạt động (`apps/admin/src/security/lint-rules.test.ts`).
- Thêm các header `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`.
- Nhật ký audit được hiển thị dạng text trong thẻ `<pre>`, không bao giờ render thành HTML.

### 5. Hành vi POS khi offline
- Phiên (token và thông tin user) lưu trong IndexedDB (Dexie, bảng `session`).
- Khi có phiên lưu sẵn, POS vào thẳng màn hình bán hàng, **kể cả khi access token đã hết hạn và đang offline**.
- Khi có mạng lại, POS tự gọi refresh:
  - Lỗi mạng: giữ nguyên phiên.
  - Server từ chối (401): giữ phiên, đặt `needsReauth = true`, hiện banner "Đăng nhập lại để đồng bộ" và **không chặn bán**.
- Đăng xuất khi offline phải xác nhận qua cảnh báo "Không thể đăng nhập lại khi mất mạng".
- Đăng nhập offline cho thu ngân khác: hoãn, xem **CR-001**.

## Hệ quả

**Tích cực**
- Một cơ chế cho cả hai app; POS hoạt động offline đúng yêu cầu.
- Không cần chống CSRF, vì không dùng cookie để xác thực.
- Token bị lộ có thời gian sống giới hạn. Token bị dùng lại sẽ khiến mọi phiên của user bị thu hồi.

**Tiêu cực / rủi ro chấp nhận**
- Nếu XSS vẫn lọt qua được CSP và luật lint, kẻ tấn công đọc được token trong storage (rủi ro **R-09**). Hạn chế: access
  token 15 phút, refresh token xoay vòng, có phát hiện dùng lại.
- Phiên POS 30 ngày trên máy dùng chung tại quầy: cần quy trình đăng xuất khi đổi ca (Sprint ca làm việc REQ-SHF-01).
- Mỗi request API tốn thêm một truy vấn khóa chính vào `users`. Chi phí nhỏ so với mục tiêu p95 < 300 ms.
- Khi chạy `vite dev` không có CSP. Kiểm thử bảo mật phải dùng bản build (`vite preview` hoặc Docker).

## Xem xét lại khi
- Admin web được triển khai cùng domain với API (khi đó cookie `httpOnly` SameSite=Strict trở nên đơn giản).
- Có yêu cầu đăng nhập offline nhiều thu ngân (CR-001).
