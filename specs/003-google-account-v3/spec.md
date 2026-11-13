# StackFlow v3: tài khoản và dự án nhóm

## Mục tiêu

Thay mã dự án/PIN và nhận diện thành viên ở thiết bị bằng tài khoản Google xác minh ở server. Dữ liệu cũ được phép bỏ. Hướng vận hành cho 3–20 người dùng, ưu tiên dịch vụ miễn phí, song không giả định gói Free được bảo đảm mãi mãi.

## Quy tắc

1. Một tài khoản có thể ở nhiều dự án; chỉ xem dữ liệu dự án mà mình là thành viên còn hoạt động. Admin toàn cục đọc được mọi dự án.
2. Người tạo dự án thường tự thành chủ. Admin tạo dự án cần chỉ định email chủ; admin không trở thành thành viên.
3. Chủ hoặc admin mời bằng email. Lời mời chỉ nhận được bằng tài khoản có email đã xác minh trùng khớp, hết hạn sau 7 ngày.
   Chủ hoặc admin có thể tạm ngưng/kích hoạt lại thành viên và chuyển quyền chủ cho thành viên đang hoạt động. Chủ hiện tại không thể bị tạm ngưng trước khi chuyển quyền.
4. Admin quản lý thông tin dự án và lời mời, không viết hoặc đánh dấu stack, task, subtask.
5. Chỉ người được giao task được bật/tắt hoàn thành task. Với subtask có người phụ trách riêng, chỉ người đó được tick; nếu không, người được giao task cha được tick.
6. Tối đa 20 thành viên đang hoạt động mỗi dự án. Version trên dữ liệu chỉnh sửa ngăn ghi đè khi hai người cùng thao tác.
7. Thiết bị giữ phiên đăng nhập và sở thích giao diện; dữ liệu nhóm có nguồn sự thật duy nhất ở PostgreSQL.

## Giới hạn hiện tại

Giao diện v3 hiện hỗ trợ dự án, lời mời, stack, task, subtask, người được giao, theme và kiểm tra cập nhật. Một số tiện ích của giao diện PIN cũ như nhật ký hoạt động, thông báo giao việc, tìm kiếm/lọc và chế độ offline chưa được chuyển. Không bật cờ v3 trên production trước khi những tiện ích cần giữ được quyết định và kiểm thử.
