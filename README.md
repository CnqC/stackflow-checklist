# StackFlow Checklist v1.2.0 (Google Account Cloud + Chuẩn Giao Diện App V2)

Ứng dụng quản lý công việc theo từng tầng **Stack tuần tự** cho nhóm tới **20 thành viên**, đồng bộ thời gian thực trên **Web, Desktop PWA (Windows/Mac) và Android `.apk`**.

## Điểm cốt lõi của phiên bản hợp nhất

- **Đăng nhập Google 1 chạm (Không cần nhớ mã PIN)**: Xác thực qua Supabase Auth Google OAuth/PKCE trên project tài khoản riêng (`xwzwsysekkizxmmjjjvn`). Luồng PIN/E2EE cũ đã được gỡ bỏ hoàn toàn khỏi mã nguồn ứng dụng.
- **Mời đồng đội đa kênh**:
  1. **Link & Mã mời nhanh (`?join=SF-XXXXXX`)**: Chia sẻ 1 chạm qua Zalo / Discord / Messenger; tự động giữ mã mời qua bước đăng nhập Google hoặc nhập trực tiếp tại Sảnh Dự Án; Chủ dự án có thể bật/tắt, đặt thời hạn hoặc đổi mã mới bất cứ lúc nào.
  2. **Mời đích danh qua Gmail / Google**: Kèm vai trò gợi ý, danh sách đang chờ xác nhận, thu hồi hoặc từ chối lời mời.
- **Trọn vẹn 100% UI/UX Bản App V2**: `StackGroupCard` khóa tuần tự, `TaskDetailDrawer` xếp hàng lưu tuần tự chống mất dữ liệu, tùy chỉnh vai trò & bảng 10 màu Avatar thành viên, đếm Online trực tiếp (`Realtime Presence`), 9 chủ đề giao diện (`AppearanceSettings`) và Chuông thông báo đa thiết bị (`NotificationBell` + âm báo + Android `LocalNotifications` + Service Worker).
- **Bảo mật cấp cơ sở dữ liệu (`RLS` + `Zod`)**: Mọi bảng PostgreSQL bật `ENABLE ROW LEVEL SECURITY`, kiểm tra quyền qua RPC `SECURITY DEFINER`, chống ghi đè bằng `version`, và toàn bộ đầu vào Frontend đi qua `Zod`.

## Cổng kiểm tra chất lượng

```powershell
npm install
npm run doctor      # Kiểm toán kiến trúc, giới hạn <=250 dòng/file & RLS (100/100)
npm run typecheck   # Kiểm tra kiểu TypeScript nghiêm ngặt (tsc -b)
npm test            # Unit & Integration Tests (Vitest)
npm run test:db     # Kiểm thử PGlite toàn bộ RLS, lời mời đa kênh & phân quyền
npm run test:backup # Kiểm thử mã hóa sao lưu
npm run lint        # Oxlint
npm run build       # Đóng gói Web / Desktop PWA vào dist/
```

## Đóng gói Android `.apk`

```powershell
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```

Xem chi tiết bàn giao kỹ thuật tại [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md).
