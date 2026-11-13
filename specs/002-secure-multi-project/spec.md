# Feature specification: Tài khoản thật, nhiều dự án, quyền admin và dữ liệu an toàn

**Ngày:** 2026-11-13
**Trạng thái:** Thiết kế, chưa chuyển dữ liệu production
**Nguồn yêu cầu:** Một người có thể thuộc nhiều dự án; người tạo dự án là thành viên; admin toàn hệ thống thấy mọi dự án nhưng ẩn khỏi danh sách thành viên và không tạo/tick task. Trước khi dùng dữ liệu quan trọng cần khóa database, backup/restore và xử lý sửa đồng thời.

## Người dùng và quyền

- Mỗi người đăng nhập bằng **một tài khoản Supabase Auth**. Đề xuất mặc định là email + mã OTP 6 chữ số để dùng cùng một luồng trên Web, PWA Windows và Android APK. ID bất biến là `auth.users.id`, không dùng tên hiển thị, email hoặc PIN làm định danh nội bộ.
- Người tạo dự án được thêm ngay vào `members` của dự án với vai trò `owner`; họ có thể quản lý thành viên và làm task nếu được giao. Một tài khoản có thể có một hàng `members` ở nhiều dự án; dữ liệu task tiếp tục trỏ tới `members.id` để giữ tương thích.
- Thành viên chỉ thấy dự án mà tài khoản đã được gắn vào. Người có quyền quản lý dự án mời đồng nghiệp bằng email; người nhận chỉ được thêm sau khi đăng nhập bằng email đã xác minh và chấp nhận lời mời.
- `global_admin` là tài khoản riêng được cấp quyền bằng UUID Auth trong database. Admin thấy và quản lý metadata của mọi dự án, có thể chỉ định owner, khóa/khôi phục dự án và xem báo cáo. Admin không được thêm vào `members`, không chiếm một suất trong giới hạn 10 người, không tạo/sửa/tick/xóa task hoặc subtasks. Nếu admin tự tạo dự án, phải chỉ định một owner thành viên trước khi dự án hoạt động.
- Trong một dự án, `owner` có quyền quản lý lời mời, membership và metadata. `member` có quyền theo quy tắc công việc hiện có. Người ngoài dự án không thể đọc hay sửa bất kỳ hàng công việc nào, ngay cả khi biết mã dự án cũ.

## Tình huống cần đạt

1. A đăng nhập một lần, thấy hai dự án được mời; B thấy một dự án; C chưa được mời không đọc được các hàng qua REST hoặc Realtime.
2. A tạo dự án, A tự xuất hiện trong roster; A mời B qua email, B xác minh email rồi chấp nhận; cùng B không bị tạo thành hai tài khoản khi vào dự án khác.
3. Admin đăng nhập và thấy mọi dự án trong màn hình quản trị, nhưng không xuất hiện ở roster; thử gọi API ghi task bằng JWT admin phải bị từ chối ở database.
4. Người được giao task/subtask được tick qua thao tác server xác định từ JWT; người khác và người giả mạo `actorId` bị từ chối.
5. Trước khi chuyển quyền production phải có bản backup ngoài project, phép thử khôi phục, danh sách hàng `members` cũ chưa gắn tài khoản và đường quay lại không làm lộ dữ liệu.
6. Hai người sửa cùng task dựa trên cùng version: chỉ một thao tác thành công; người còn lại nhận xung đột và được chọn tải lại/áp dụng lại thay đổi. Không âm thầm ghi đè.

## Ranh giới và điều kiện

- Dữ liệu production hiện có phải được giữ nguyên. Không tự gán tên thành viên cũ cho tài khoản mới chỉ dựa vào tên, mã PIN hoặc email chưa xác minh.
- Không bật policy `using (true)` như phương án chuyển tiếp. Khi cutover, thu hồi quyền `anon`, kiểm thử RLS và triển khai client Auth tương thích trong cùng cửa sổ phát hành.
- `localStorage`/MQTT chỉ còn là demo hoặc dữ liệu cá nhân tách biệt; không là đường thay thế tự động vào dự án đã bảo vệ bằng tài khoản.
- Email OTP cần cấu hình SMTP riêng và template chứa `{{ .Token }}`; không đưa secret SMTP hoặc Supabase secret key vào Vite/ứng dụng.
- Backup là server-side, được mã hóa và giữ ngoài database chính. Export JSON do người dùng thực hiện là tính năng bổ sung, không thay thế backup.

## Tiêu chí hoàn thành

- Test RLS cho `anon`, thành viên dự án A/B, owner và global admin trên `SELECT/INSERT/UPDATE/DELETE`, gồm tình huống gọi REST trực tiếp ngoài UI.
- Test tích hợp đăng nhập, mời, nhận lời mời, chuyển dự án, quyền task và khôi phục backup trên môi trường staging có bản dữ liệu mẫu.
- Production không còn PIN rõ trong bảng/dữ liệu client mới; không còn policy `for all using (true)` trên bảng nghiệp vụ.
- Có runbook backup/restore và log kiểm chứng một lần diễn tập; xung đột sửa cùng hàng được báo rõ cho người dùng.
