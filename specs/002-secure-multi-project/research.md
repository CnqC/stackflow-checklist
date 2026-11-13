# Nghiên cứu và đối chiếu với StackFlow

**Ngày kiểm tra:** 2026-11-13. Nguồn bên ngoài dưới đây là tài liệu chính thức. Các nhận xét về StackFlow được suy ra từ mã nguồn hiện tại, chưa kiểm tra chính sách đang chạy trong Supabase production.

| Chủ đề | Kết quả nghiên cứu | Quyết định cho StackFlow |
| --- | --- | --- |
| Xác thực dùng chung Web/Windows/Android | [Supabase Email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless) cho phép nhập mã 6 chữ số trong app; không bắt buộc xử lý deep link. Email template cần `{{ .Token }}`. | Dùng email OTP làm mặc định, định danh theo `auth.users.id`. Sau này có thể thêm Google OAuth mà không đổi khóa dữ liệu. |
| Gửi mã và lời mời | [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp) nói email mặc định chỉ phù hợp thử nghiệm, hạn chế người nhận và tần suất. [Admin invite API](https://supabase.com/docs/guides/auth/users) chỉ chạy trên server với secret key. | Cấu hình SMTP thật trước khi mở cho nhóm; lời mời đi qua Edge Function và được kiểm chứng bằng JWT + email đã xác minh. Không gọi Admin API từ frontend. |
| Phân quyền theo dự án | [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) cho phép chính sách theo `auth.uid()`; quyền bảng và policy đều phải đúng. [Supabase RLS testing](https://supabase.com/docs/guides/database/postgres/testing-row-level-security) yêu cầu kiểm tra cả ca người dùng khác và cả thao tác ghi. | Dùng membership `members.user_id`, chính sách tách READ/WRITE, index theo `user_id`; test phủ `anon`, outsider, member, owner, admin. |
| Quyền tác vụ nhạy cảm | [Securing Edge Functions](https://supabase.com/docs/guides/functions/auth) hướng dẫn xác thực JWT người dùng và client theo RLS. Security-definer có thể vượt RLS nếu cấu hình sai. | Các lệnh tạo dự án, mời/nhận lời mời, tick task và quản trị đi qua RPC/Edge Function có kiểm tra JWT và transaction. Secret key chỉ ở server. |
| Backup và phục hồi | [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups): backup tự động tùy plan; Free nên tự `db dump` và giữ bản ngoài. PITR là lựa chọn có chi phí riêng. | Trước migration lấy logical dump mã hóa ngoài project, diễn tập restore sang staging, rồi chọn lịch backup theo plan thực tế. Không suy đoán rằng production đã có backup. |

## Vấn đề thực tế trong repo

- `supabase/schema.sql` hiện dùng `for all using (true) with check (true)` trên các bảng nghiệp vụ; PIN nằm dạng rõ ở `workspaces.pin_code`. UI so PIN sau khi đã đọc hàng workspace. RLS và PIN hiện không bảo vệ dữ liệu khỏi người gọi API trực tiếp.
- `App.tsx` lưu `roomCode`, `pinCode`, `memberId` trong `localStorage`. Người dùng chọn tên thành viên, không có tài khoản cá nhân. `taskCompletionPolicy` chỉ kiểm tra `memberId` do client truyền.
- `members.id` đã được task, subtask và log tham chiếu. Giữ khóa này khi thêm `members.user_id` tránh phải viết lại mọi tham chiếu task trong lần chuyển đổi đầu.
- `syncService` chọn Supabase nếu có cấu hình; nếu không dùng localStorage + MQTT relay. Relay gửi **cả snapshot** và chọn theo `workspace.updatedAt`, không có merge/version từng bản ghi. Đường này không thể đồng tồn tại như quyền truy cập dự án secure.
- `push-device` hiện xác nhận PIN và `memberId`; cần đổi sang JWT người dùng và kiểm tra membership trước khi đăng ký token.
- Có dữ liệu `members` cũ không chứa email/`user_id`. Cần quy trình claim thủ công có đối chiếu, không có cách suy ra chủ tài khoản an toàn từ tên.
