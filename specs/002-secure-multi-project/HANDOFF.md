# Bàn giao cho agent tiếp theo

**Thời điểm:** 2026-11-13, Asia/Saigon.
**Giới hạn 5 giờ:** Công cụ hiện có không cung cấp phần trăm quota còn lại; `get_goal` trả `goal: null`, `remainingTokens: null`. Không khẳng định đã đến ngưỡng 5%.

## Mục tiêu người dùng

Người dùng đồng ý cần khóa dữ liệu theo người/dự án ở database, có backup/restore và xử lý xung đột. Họ bổ sung mô hình nhiều dự án: một account thuộc nhiều dự án, người tạo là thành viên, owner mời thành viên bằng cơ chế an toàn; admin toàn cục thấy mọi dự án nhưng ẩn khỏi roster và không tạo/tick task. Họ yêu cầu nghiên cứu và phương án phù hợp architecture hiện tại.

## Đã làm trong lượt này

- Đọc `syncService`, `supabaseConfig`, `e2eeRelaySync`, `schema.sql`, `push.sql`, `push-device`, `App`, `taskCompletionPolicy`, constitution và specs hiện có. Không thay đổi dữ liệu production.
- Xác định nguồn rủi ro: `for all using (true)` trong schema, PIN rõ và kiểm tra ở client; task completion chỉ kiểm tra trong client; relay dùng snapshot retained theo giờ cuối; `members` chưa có user ID; push-device xác nhận PIN/member ID. Production GitHub Actions có biến Supabase URL/anon key được cấu hình, nhưng chưa kiểm tra policy live trong database.
- Tra tài liệu Supabase chính thức: Auth Email OTP, SMTP, invitation API, RLS/pgTAP, Edge Functions auth, backup. Đề xuất email OTP 6 chữ số để không cần deep link trên Android, với custom SMTP.
- Viết `spec.md`, `research.md`, `plan.md`, `tasks.md` trong thư mục này. Chưa viết migration, chưa triển khai Auth/RLS, chưa đẩy code vì cutover khi chưa claim member có thể khóa/mất quyền truy cập dữ liệu hiện hữu.

## Quyết định kiến trúc đề xuất

Giữ `members.id` cho mọi task lịch sử; thêm `members.user_id` trỏ `auth.users.id` và `access_role` tách khỏi chức danh hiện có. Thêm `profiles`, invitations và bảng `private.global_admins`. Admin global không là member, chỉ đọc mọi dự án; thao tác quản trị metadata qua server, mọi mutation task từ admin bị database chặn. Client mới đọc qua RLS, ghi qua RPC/Edge Functions xác định người gọi từ JWT. Secure projects không có fallback sang PIN/relay. Backup trước cutover; optimistic version từng hàng sau khi auth và backup ổn định.

## Việc tiếp theo

1. Đọc `spec.md`/`plan.md`/`tasks.md`; kiểm tra lựa chọn OTP với người dùng nếu họ nêu yêu cầu khác. Cần UUID tài khoản admin sau lần login đầu, cấu hình SMTP và cách claim member cũ; không hard-code email/UUID admin vào client.
2. Bắt đầu A1/A2: audit production chỉ đọc, dump mã hóa và restore staging. Không chạy SQL revoke/overwrite lên production trước khi có backup.
3. Xây migration bổ sung và Auth/client trong staging, test RLS allow/deny theo `tasks.md` rồi mới hẹn cutover. Không giữ policy `true` để tương thích.
4. Sau khi quyền server ổn, triển khai lịch backup/restore rồi revision/compare-and-swap. Báo cho người dùng rõ giới hạn nếu thiếu credential/SMTP/điểm lưu backup.

## Liên kết nguồn chính

- Supabase Auth OTP: https://supabase.com/docs/guides/auth/auth-email-passwordless
- SMTP: https://supabase.com/docs/guides/auth/auth-smtp
- RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- pgTAP: https://supabase.com/docs/guides/database/postgres/testing-row-level-security
- Backup: https://supabase.com/docs/guides/platform/backups
