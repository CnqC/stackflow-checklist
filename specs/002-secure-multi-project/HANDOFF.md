# Bàn giao cho agent tiếp theo

**Thời điểm:** 2026-11-13, Asia/Saigon.
**Giới hạn 5 giờ:** Công cụ hiện có không cung cấp phần trăm quota còn lại; `get_goal` trả `goal: null`, `remainingTokens: null`. Không khẳng định đã đến ngưỡng 5%.

## Mục tiêu người dùng

Người dùng đồng ý cần khóa dữ liệu theo người/dự án ở database, có backup/restore và xử lý xung đột. Họ bổ sung mô hình nhiều dự án: một account thuộc nhiều dự án, người tạo là thành viên, owner mời thành viên bằng cơ chế an toàn; admin toàn cục thấy mọi dự án nhưng ẩn khỏi roster và không tạo/tick task. Họ yêu cầu nghiên cứu và phương án phù hợp architecture hiện tại.

## Đã làm trong lượt này

- Đọc `syncService`, `supabaseConfig`, `e2eeRelaySync`, `schema.sql`, `push.sql`, `push-device`, `App`, `taskCompletionPolicy`, constitution và specs hiện có. Không thay đổi dữ liệu production.
- Xác định nguồn rủi ro: `for all using (true)` trong schema, PIN rõ và kiểm tra ở client; task completion chỉ kiểm tra trong client; relay dùng snapshot retained theo giờ cuối; `members` chưa có user ID; push-device xác nhận PIN/member ID. Production GitHub Actions có biến Supabase URL/anon key được cấu hình, nhưng chưa kiểm tra policy live trong database.
- Tra tài liệu Supabase chính thức: Auth Email OTP, SMTP, invitation API, RLS/pgTAP, Edge Functions auth, backup. Đề xuất email OTP 6 chữ số để không cần deep link trên Android, với custom SMTP.
- Viết `spec.md`, `research.md`, `plan.md`, `tasks.md` trong thư mục này. Ở lượt nghiên cứu, chưa viết migration hoặc triển khai Auth/RLS vì cutover khi chưa claim member có thể khóa quyền truy cập dữ liệu hiện hữu.

## Tiến độ lượt thực thi tiếp theo

- Đã viết `supabase/audit/pre_cutover_audit.sql` (chỉ đọc) và `backup-runbook.md`. Chưa chạy audit/dump production; chưa có nơi lưu backup đã mã hóa hoặc bản restore staging được kiểm chứng.
- Đã viết migration **cộng thêm** `202611130001_identity_foundation.sql`: profile, `members.user_id`, `access_role`, bảng admin riêng, invitation, audit claim member và RPC claim dành cho admin. Chưa chạy migration trên database.
- Đã viết `202611130002_secure_completion_rpc.sql`: version từng task, RPC tick task/subtask kiểm tra JWT, người được giao và expected version. Đã viết `202611130003_account_projects_rpc.sql`: tạo dự án, mời/nhận lời mời; các RPC này bị khóa bằng `private.security_state.accounts_enabled=false` cho tới cutover RLS.
- Đã viết Auth adapter OTP, project catalog repository, secure task repository và màn hình `AccountPreview`. Chỉ bật màn hình staging khi `VITE_ACCOUNT_PREVIEW=true`; mặc định production vẫn chạy App PIN cũ. Chưa nối dashboard với toàn bộ bảng task và chưa đổi `push-device`.
- `npm run build`, `npm test` (46 test), `npm run lint` đã chạy thành công. SQL chưa thể test trên PostgreSQL: Docker Desktop engine không chạy và chưa có staging DB được cấp quyền. **Không được xem các migration là production-ready cho đến khi chạy trên staging và test quyền.**
- Không có phép đo quota 5 giờ; vẫn không thể xác nhận mốc 5%.

## Việc còn bắt buộc trước khi phát hành tài khoản

1. Lấy bản backup mã hóa và restore staging; audit policy/grants production. Cần SMTP, admin Auth UUID và danh sách email gắn với member cũ. Trả lời async của người dùng nếu có.
2. Chạy migration trên staging, sửa mọi lỗi SQL thực tế, viết pgTAP test cho RPC (admin/outsider/assignee, xung đột). Lưu ý `supabase/schema.sql` là bootstrap legacy có policy `true`, không chạy lại sau cutover.
3. Viết migration cutover RLS + thu hồi anon/direct write và chính sách RPC đầy đủ cho mọi thao tác của App; chỉ migration đó mới được set `accounts_enabled=true` trong cùng transaction. Hiện chưa có migration cutover, và các đường ghi legacy vẫn không an toàn.
4. Nối Auth/dashboard vào App thực tế, thay toàn bộ ghi trực tiếp bằng RPC, đổi push-device sang JWT, ngắt PIN/MQTT fallback cho dự án account. Kiểm thử Web/PWA/Android, nhiều dự án, member chưa claim và backup/restore.

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
