# Đối chiếu tính năng bản PIN và bản tài khoản Google

Mốc đối chiếu: giao diện và luồng làm việc của bản PIN trên GitHub Pages, không chỉ danh sách bảng dữ liệu.

| Tính năng bản gốc | Trạng thái v3 | Việc còn lại |
|---|---|---|
| Danh sách Stack, việc lớn, phần việc nhỏ, nhiều người phụ trách | Có | Kiểm thử với tài khoản thật và Android |
| Tìm kiếm, lọc trạng thái, Việc của tôi, lọc theo thành viên | Đã thêm tại local | Kiểm thử trải nghiệm trên dữ liệu thật |
| Tiến độ dự án và Stack, thanh bên desktop, điều hướng mobile | Đã thêm tại local | Kiểm thử kích thước màn hình và tinh chỉnh bố cục |
| Stack tuần tự, thu gọn, đổi thứ tự Stack/việc | Đã thêm tại local và database v3 | Kiểm thử xung đột hai thiết bị |
| Tạo Stack có mô tả, màu, khóa tuần tự và ưu tiên; sắp xếp Stack theo ưu tiên | Đã thêm tại local và database v3 | Kiểm thử giao diện với tài khoản thật |
| Link tài liệu của việc | Đã thêm tại local và database v3 | Kiểm thử thêm/xóa bằng tài khoản thật |
| Nhật ký hoạt động | Đã thêm tại local và database v3 | Bổ sung sự kiện thành viên/phân công và kiểm thử tải lớn |
| Hộp thông báo giao việc, âm, badge, thông báo trình duyệt khi trang mở | Đã thêm tại local và database v3 | Kiểm thử thông báo thật, quyền trình duyệt và Android |
| Push khi ứng dụng đã đóng | Chưa chuyển sang xác thực tài khoản | Cần cập nhật Edge Function, thiết bị đăng ký bằng JWT và cấu hình Firebase/Web Push |
| Thao tác offline và đồng bộ khi có mạng trở lại | Chưa chuyển | Cần hàng đợi cục bộ có xử lý xung đột và kiểm thử mất mạng |
| Bảng chi tiết việc dạng drawer, chỉnh sửa phần việc nhỏ, bố cục sát bản cũ | Đã thêm tại local | Cần kiểm thử với dữ liệu thật, Android và tiếp tục tinh chỉnh giao diện |
| Tái sử dụng component Stack, drawer và nhật ký của giao diện V2 | Đã nối vào workspace tài khoản trên nhánh `v2-google-auth` | Kiểm thử thao tác thật và đối chiếu phần còn khác của khung ứng dụng |
| PWA Windows, APK Android đăng nhập Google | Mã callback đã có | Cần thử trên thiết bị thật |

Không bật production v3 cho tới khi các dòng còn thiếu được hoàn thành hoặc chủ dự án thay đổi phạm vi bằng quyết định mới. Schema v3 đã có migrations `001`–`010` trên project `xwzwsysekkizxmmjjjvn`; project PIN cũ và GitHub Pages chưa chuyển.
