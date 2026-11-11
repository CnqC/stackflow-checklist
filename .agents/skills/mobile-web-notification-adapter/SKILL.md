---
name: mobile-web-notification-adapter
description: >-
  Quy chuẩn Adapter Đẩy Thông Báo Đa Nền Tảng (Android Capacitor LocalNotifications +
  Web Notification API / Service Worker + In-App Notice Store) chống bắn trùng lặp.
---

# Kỹ Năng Cố Định: `mobile-web-notification-adapter`

1. **Adapter Pattern Đa Nền Tảng**:
   - Phát hiện môi trường runtime an toàn (không làm crash SSR hay `jsdom` trong Vitest!):
     - Nếu đang chạy Native Android/iOS (`window.Capacitor?.isNativePlatform?.()`): dùng `@capacitor/local-notifications` (`LocalNotifications.requestPermissions()` & `LocalNotifications.schedule(...)`).
     - Nếu đang chạy trên trình duyệt Web / PWA: ưu tiên `navigator.serviceWorker.ready -> registration.showNotification(...)` (hoạt động tốt trên cả Mobile PWA), fallback sang `new window.Notification(title, options)`.
2. **Chống Bắn Trùng & Không Tự Báo Cho Chính Mình**:
   - Chỉ bắn thông báo hệ thống cho `targetMemberId === activeMember.id` VÀ `actorName !== activeMember.name` (hoặc khi người khác vừa gắn tên mình vào việc mới / việc nhỏ mới).
   - Lưu danh sách `seenNoticeIds` trong `localStorage` để khi F5 tải lại trang không bao giờ reo lại các thông báo cũ đã báo rồi.
3. **Thân Thiện Tuyệt Đối Với Non-Tech**:
   - Nội dung thông báo ngắn gọn, tự nhiên bằng tiếng Việt:
     - Giao việc lớn: `"🔔 [Tên người giao] vừa giao việc cho bạn"` — Nội dung: `"[Tên đầu việc]"`
     - Giao việc nhỏ trong Task: `"🔔 Bạn có phần việc mới trong nhóm"` — Nội dung: `"[Tên việc nhỏ] (thuộc: [Tên Task lớn])"`
