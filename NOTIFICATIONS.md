# Thiết kế thông báo StackFlow

## Quy tắc hiện tại

- `detectNewAssignmentNotices` là nơi duy nhất phát hiện việc lớn hoặc phần việc nhỏ vừa được giao. Mỗi notice có ID ổn định để không báo lặp khi đồng bộ lại.
- `NotificationService` lưu hộp chuông theo cặp dự án/thành viên. Đọc một việc, đánh dấu tất cả đã đọc và xóa lịch sử đã đọc đều dùng cùng kho này. Tắt báo trên thiết bị không làm mất notice trong app.
- Khi app đang nhận đồng bộ, notice mới đi tới hộp chuông và, nếu người dùng cho phép, thông báo Android hoặc trình duyệt. Thông báo hệ thống có người giao, tên việc và Stack; Stack được tra từ snapshot lúc phát, không lưu trùng trong notice.
- Android dùng channel `Việc được giao` với mức quan trọng mặc định. Web chỉ xin quyền sau khi người dùng bấm trong hộp chuông. Bấm thông báo hệ thống mở đúng đầu việc và đánh dấu notice đã đọc.
- Tab Web hiển thị số chưa đọc ổn định cùng tên Stack mới nhất, ví dụ `(3) StackFlow — Stack 2`.
- Một checkpoint nhỏ theo từng thành viên giúp đối chiếu việc được giao khi mở lại app trên cùng thiết bị. Các notice phát hiện lúc mở lại được thêm vào hộp chuông mà không phát một loạt thông báo hệ thống cũ.

## Push khi đóng ứng dụng

Trong chế độ Supabase, `supabase/push.sql` ghi sự kiện giao việc tại database. Database Webhook gửi sự kiện tới Edge Function `push-send`; function gửi FCM cho Android và Web Push cho trình duyệt. `push-device` đăng ký thiết bị sau khi người dùng cho quyền. Cùng `notice.id` được dùng cho hộp chuông, push và điều hướng để không báo hai lần. Xem [PUSH_SETUP.md](./PUSH_SETUP.md) để cấu hình dịch vụ và khóa.

## Giới hạn

Push khi đóng ứng dụng chỉ hoạt động sau khi Supabase, Firebase và Web Push được cấu hình và deploy theo `PUSH_SETUP.md`. Chế độ local/MQTT relay chưa có máy chủ xử lý sự kiện push khi mọi app đã đóng. Checkpoint chỉ đối chiếu trạng thái cuối khi mở lại trên cùng thiết bị, nên không thể tái dựng một lần giao việc rồi gỡ ra trong lúc app đóng. Trạng thái đã đọc hiện chưa đồng bộ giữa nhiều thiết bị. Android có thể bị hệ điều hành trì hoãn hoặc chặn nếu app bị force stop hoặc người dùng tắt quyền/thông báo kênh. Web phụ thuộc trình duyệt, quyền thông báo và cài đặt âm thanh Windows.

Mô hình đăng nhập hiện tại dùng PIN chung của phòng và chọn tên thành viên. Edge Function xác nhận PIN trước khi đăng ký thiết bị và giữ token ngoài quyền truy cập anon, nhưng chưa thể phân biệt chắc chắn hai người cùng biết PIN nếu một người chọn tên người khác. Muốn bảo mật danh tính cá nhân cần tài khoản hoặc mã riêng cho từng thành viên.

## Tài liệu tham khảo chính thức

- [Android notification design](https://developer.android.com/design/ui/mobile/guides/home-screen/notifications): nội dung ngắn, kênh thông báo và mức quan trọng phù hợp.
- [Web permission best practices](https://web.dev/articles/permissions-best-practices): xin quyền sau thao tác chủ động, có ngữ cảnh.
- [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API): push từ máy chủ khi trang không còn mở.
- [Capacitor Local Notifications](https://capacitorjs.com/docs/apis/local-notifications): thông báo cục bộ Android và sự kiện khi người dùng bấm.
- [Firebase Cloud Messaging trên Android](https://firebase.google.com/docs/cloud-messaging/android/receive-messages): hướng xử lý thông báo khi app chạy nền hoặc đã đóng.
