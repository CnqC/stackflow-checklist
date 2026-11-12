# Thiết kế thông báo StackFlow

## Quy tắc hiện tại

- `detectNewAssignmentNotices` là nơi duy nhất phát hiện việc lớn hoặc phần việc nhỏ vừa được giao. Mỗi notice có ID ổn định để không báo lặp khi đồng bộ lại.
- `NotificationService` lưu hộp chuông theo cặp dự án/thành viên. Đọc một việc, đánh dấu tất cả đã đọc và xóa lịch sử đã đọc đều dùng cùng kho này. Tắt báo trên thiết bị không làm mất notice trong app.
- Khi app đang nhận đồng bộ, notice mới đi tới hộp chuông và, nếu người dùng cho phép, thông báo Android hoặc trình duyệt. Thông báo hệ thống có người giao, tên việc và Stack; Stack được tra từ snapshot lúc phát, không lưu trùng trong notice.
- Android dùng channel `Việc được giao` với mức quan trọng mặc định. Web chỉ xin quyền sau khi người dùng bấm trong hộp chuông. Bấm thông báo hệ thống mở đúng đầu việc và đánh dấu notice đã đọc.
- Tab Web hiển thị số chưa đọc ổn định cùng tên Stack mới nhất, ví dụ `(3) StackFlow — Stack 2`.
- Một checkpoint nhỏ theo từng thành viên giúp đối chiếu việc được giao khi mở lại app trên cùng thiết bị. Các notice phát hiện lúc mở lại được thêm vào hộp chuông mà không phát một loạt thông báo hệ thống cũ.

## Giới hạn và bước mở rộng

Thông báo tức thì khi app/trình duyệt đã đóng hẳn cần một dịch vụ đẩy phía máy chủ. Android có thể nhận qua Firebase Cloud Messaging; Web cần Push API với service worker và nơi lưu đăng ký của thiết bị. StackFlow hiện dùng MQTT relay hoặc Supabase cho dữ liệu đang mở, chưa có dịch vụ gửi push và thông tin cấu hình Firebase/Web Push. Checkpoint chỉ đối chiếu trạng thái cuối khi mở lại trên cùng thiết bị, nên không thể tái dựng một lần giao việc rồi gỡ ra trong lúc app đóng. Trạng thái đã đọc hiện chưa đồng bộ giữa nhiều thiết bị.

Nếu thêm push sau này, máy chủ cần phát cùng `notice.id` để dùng chung kho chống trùng hiện có. Quyền thông báo và lựa chọn tắt báo trên thiết bị vẫn do người dùng kiểm soát.

## Tài liệu tham khảo chính thức

- [Android notification design](https://developer.android.com/design/ui/mobile/guides/home-screen/notifications): nội dung ngắn, kênh thông báo và mức quan trọng phù hợp.
- [Web permission best practices](https://web.dev/articles/permissions-best-practices): xin quyền sau thao tác chủ động, có ngữ cảnh.
- [MDN Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API): push từ máy chủ khi trang không còn mở.
- [Capacitor Local Notifications](https://capacitorjs.com/docs/apis/local-notifications): thông báo cục bộ Android và sự kiện khi người dùng bấm.
- [Firebase Cloud Messaging trên Android](https://firebase.google.com/docs/cloud-messaging/android/receive-messages): hướng xử lý thông báo khi app chạy nền hoặc đã đóng.
