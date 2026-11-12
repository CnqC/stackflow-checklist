# Bật thông báo khi StackFlow đã đóng

Code push đã có sẵn; cần cấu hình các dịch vụ bên dưới trước khi thiết bị nhận được thông báo. Không đưa private key, service account hoặc PIN vào Git.

## 1. Supabase

Chạy `supabase/schema.sql` (nếu dự án chưa có), rồi chạy `supabase/push.sql` trong SQL Editor. Script chỉ thêm hai bảng riêng và trigger trên `checklist_items`; dữ liệu việc cũ không bị sửa. Deploy hai Edge Functions `push-device` và `push-send` trong `supabase/functions/`. `supabase/config.toml` tắt JWT check cho hai function vì `push-device` tự kiểm tra PIN phòng, còn `push-send` kiểm tra secret của webhook.

Tạo secret `PUSH_WEBHOOK_SECRET` đủ dài cho Edge Function. Lưu cùng giá trị đó trong Supabase Vault với tên `stackflow_push_webhook_secret`, và lưu URL project trong Vault với tên `stackflow_project_url`. Sau đó chạy [`supabase/webhook.sql`](./supabase/webhook.sql) để bật `pg_net` và gắn webhook **INSERT** trên `public.assignment_push_events` gọi function `push-send`. Không đưa giá trị secret vào Git. Có thể xem các sự kiện chưa gửi bằng SQL `select id, last_error from public.assignment_push_events where sent_at is null;`.

## 2. Android qua Firebase

Tạo Firebase project, thêm Android app với package **`com.quang.stackflow`**. Tải `google-services.json` vào `android/app/google-services.json` khi build local. Tệp này được Android build dùng để đăng ký FCM; plugin đã có trong `package.json`. Tạo service account có quyền gửi FCM HTTP v1; đặt **toàn bộ JSON** trong secret `FIREBASE_SERVICE_ACCOUNT_JSON` của Supabase Edge Functions. Bật Firebase Cloud Messaging API cho project. Không đặt service account trong APK hoặc biến `VITE_`.

Nếu build bằng GitHub Actions, đặt `FIREBASE_GOOGLE_SERVICES_JSON_BASE64` trong GitHub Actions Secrets; workflow giải mã vào Android build tạm thời. Sau đó cài APK mới trên điện thoại, mở chuông và cấp quyền thông báo. Kênh `Việc mới được giao` dùng âm báo mặc định và mức hiện nổi `HIGH`; người dùng có thể đổi âm hoặc tắt trong Cài đặt Android.

## 3. Web/Windows qua Web Push

Tạo một cặp VAPID key bằng công cụ Web Push. Đặt public key vào `VITE_WEB_PUSH_PUBLIC_KEY` khi build web (GitHub Actions Variable cùng tên). Đặt private key vào Supabase secret `WEB_PUSH_PRIVATE_KEY`, public key vào `WEB_PUSH_PUBLIC_KEY`, và email dạng `mailto:you@example.com` vào `WEB_PUSH_CONTACT`. Các khóa phải cùng một cặp. Truy cập web qua HTTPS, mở chuông và cấp quyền. Khi đăng ký thành công, service worker nhận push ngay cả khi trang không đang mở. Âm báo trên Windows phụ thuộc cài đặt Chrome/Edge và hệ điều hành.

## Kiểm tra thực tế

1. Đăng nhập thành viên A trên Android; mở chuông, cấp quyền, kiểm tra dòng cảnh báo “Báo khi đóng ứng dụng chưa sẵn sàng” đã biến mất.
2. Đăng nhập thành viên B trên một thiết bị khác, giao một việc chưa hoàn thành cho A.
3. Kiểm tra A nhận đúng một thông báo có âm, bấm thông báo mở đúng việc. Lặp lại khi app Android ở nền/đã vuốt khỏi màn hình gần đây.
4. Lặp lại trên Chrome/Edge Windows đã cấp quyền, sau khi đóng tab web. Kiểm tra hộp chuông và số chưa đọc không tạo thông báo trùng.

Nếu người dùng dùng chế độ relay/local mà không có Supabase, push khi app đóng chưa hoạt động: broker MQTT chỉ chuyển dữ liệu cho kết nối đang mở. Để hỗ trợ chế độ đó cần một dịch vụ push riêng nhận sự kiện giao việc và bảo vệ quyền truy cập theo phòng/thành viên.
