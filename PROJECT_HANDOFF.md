# Bàn Giao Tổng Thể StackFlow v1.2.1 — Bản Hợp Nhất Google Cloud, Chia Sẻ Đa Kênh & UI App V2

**Cập nhật nghiệm thu:** 16/11/2026 trên nhánh `master` (`v1.2.1`).

## 1. Kiến trúc sản phẩm hiện hành

- **Một luồng ứng dụng duy nhất (`AccountApp`)**: Luồng mã PIN cũ (`App.tsx`, `PinAuthScreen.tsx`, `TeamAndCloudModal.tsx`, `syncService.ts`, `e2eeRelaySync.ts`) đã được gỡ bỏ sạch sẽ. Toàn bộ ứng dụng khởi động trực tiếp vào luồng Tài khoản Google (`src/main.tsx` -> `AccountApp.tsx`) kết hợp **100% hệ thống giao diện và trải nghiệm của Bản App V2**.
- **Ranh giới cơ sở dữ liệu an toàn**: Chỉ kết nối tới Supabase project tài khoản (`xwzwsysekkizxmmjjjvn.supabase.co`). Cấu hình `vite.config.ts` và `src/services/supabaseConfig.ts` tự động chặn nếu cấu hình nhầm sang URL của database PIN lịch sử.
- **Kỷ luật kiến trúc (`npm run doctor` = `100/100`)**:
  - 100% file mã nguồn `.ts`/`.tsx` trong `src/` gọn dưới `250` dòng, `0` kiểu `any`.
  - Mọi dữ liệu đầu vào (tạo dự án, mời email, mã mời nhanh `SF-XXXXXX`, cập nhật hồ sơ/vai trò) được chuẩn hóa qua `Zod` (`src/core/domain/accountSchemas.ts`).
  - Tầng `src/core/domain/` thuần túy 100%, không phụ thuộc DOM, Storage hay SDK mạng.

## 2. Cơ chế Đăng nhập & Mời thành viên Đa kênh (Migration `202611160001`)

1. **Đăng nhập Google (`AccountLogin.tsx` + `LoginDecorShowcase.tsx`)**:
   - Đồng bộ hoàn toàn thẩm mỹ và 9 chủ đề giao diện của App V2.
   - Hỗ trợ cả Web/Desktop PWA (OAuth redirect về origin) và Android APK (`com.quang.stackflow://auth/callback`).
   - Nếu người dùng mở từ đường dẫn mời `?join=SF-XXXXXX`, mã mời được lưu tạm vào `sessionStorage` để ngay sau khi xác thực Google xong có thể xác nhận vào thẳng dự án.
2. **Sảnh Dự Án (`ProjectDashboard.tsx`)**:
   - Thanh tham gia nhanh bằng Mã mời `SF-XXXXXX` hoặc dán nguyên đường link chia sẻ từ Zalo/Discord.
   - Danh sách lời mời qua Gmail kèm nút **Tham gia dự án** / **Từ chối**.
   - Tạo dự án mới chọn ngay vai trò (`job_title`) và màu Avatar 10 sắc độ chuẩn V2 (`MEMBER_PALETTE`).
3. **Modal Quản lý Nhóm & Cài đặt App 3 Tab (`ProjectTeamModal.tsx`)**:
   - **Tab Nhóm (`X/20`)**: Đổi tên hiển thị, vai trò, màu Avatar cá nhân; xem trạng thái `● Online (Web/App)` trực tiếp qua Supabase Realtime Presence; Chủ dự án chỉnh vai trò, tạm dừng/mở lại quyền thành viên (thành viên bị tạm dừng không thể tự lách qua mã mời chung) hoặc chuyển quyền Chủ dự án.
   - **Tab Mời thành viên**:
     - *Kênh 1 (Chia sẻ qua Link)*: Đường dẫn chuẩn `https://cnqc.github.io/stackflow-checklist/?join=SF-XXXXXX` hoạt động nhất quán trên cả Web, Desktop PWA và Android APK; tích hợp cụm nút gửi trực tiếp qua **Gmail**, **Zalo**, **Telegram** + sao chép nhanh 1 chạm; tự động đưa đối tác vào thẳng dự án ngay sau bước đăng nhập Google và hỗ trợ mở sang Chrome/Safari khi bấm từ WebView thu nhỏ của Zalo.
     - *Kênh 2 (Mời đích danh qua Gmail)*: Vừa lưu quyền email trên Supabase vừa tự động mở cửa sổ soạn thư Gmail gửi sẵn đường dẫn & vai trò cho đối tác, kèm nút gửi lại / thu hồi trên từng lời mời chờ.
   - **Tab Cài đặt App**: Cài đặt 1 chạm Desktop PWA (`beforeinstallprompt` trên Edge/Chrome Windows & Mac), tải trực tiếp `StackFlow-Checklist.apk` cho Android và hướng dẫn thêm ra màn hình chính trên iPhone/iPad Safari.

## 3. Trạng thái Database Tài khoản (`xwzwsysekkizxmmjjjvn`)

- Đã áp dụng đầy đủ các migration từ `202611130001` tới `202611160001_v2_team_invites_and_profiles.sql`.
- Đã chạy `supabase/reset_account_projects.sql` làm sạch dữ liệu dự án thử nghiệm (`projects_count = 0`), bảo toàn nguyên vẹn `auth.users` và tài khoản quản trị toàn cục (`private.global_admins = 1`), bật `RLS` trên toàn bộ bảng.

## 4. Các gói Build bàn giao trên máy Local

- **Web / Desktop PWA**: thư mục `dist/` (tạo bởi `npm run build`, kèm Service Worker `sw.js`, `manifest.webmanifest` và `version.json`).
- **Android APK**: `../StackFlow-Checklist.apk` và `release/v1.2.0/StackFlow-Checklist.apk` (đóng gói từ `dist/` mới nhất qua `npx cap sync android` + Gradle).
- **Trạng thái Git**: Mọi commit được chia nhỏ sạch sẽ trên nhánh local `v2-google-auth` (chưa đẩy `git push` lên GitHub theo đúng yêu cầu). Khi sẵn sàng phát hành công khai lên GitHub Pages, chỉ cần cập nhật biến môi trường repository trên GitHub trỏ về project tài khoản và push nhánh phát hành.
