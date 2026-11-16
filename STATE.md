# Sổ Cái Trạng Thái Sống Của Dự Án (`STATE.md` — Loop Engineering · Luồng B Brownfield Convergence)

Last run: 2026-11-16 | Health Score: 100/100 (Google Account + V2 App Parity)

> **Quy tắc sử dụng lâu dài**:
> - Mỗi lần mở lại dự án, AI đọc file này đầu tiên để nắm mạch việc.
> - Mỗi lát cắt trong **High Priority** sửa tối đa `<= 10` file theo `gate.yaml`, giữ mọi file `.ts`/`.tsx` `< 250` dòng, cấm `any`, kiểm tra đầu vào qua `Zod`, bật `ENABLE ROW LEVEL SECURITY` cho mọi bảng SQL.

---

## 1. High Priority (Lộ trình hội tụ Google Auth + UI Chuẩn App V2 + Build Web/PWA/APK)
- [x] `SLICE-01` — Thiết lập nền tảng Loop-Engineering (`STATE.md`, `LOOP.md`, `gate.yaml`, `zod`, `typecheck`) & chốt các bản vá đang dở từ phiên trước về working tree sạch (`<= 10` file/commit)
- [x] `SLICE-02` — Dọn bỏ luồng đăng nhập PIN cũ (`PinAuthScreen`, `TeamAndCloudModal`, `syncService`, `e2eeRelaySync`, `App.tsx`) & tách nhỏ toàn bộ Domain / Component V2 (`StackGroupCard`, `TaskDetailDrawer`, `NotificationBell`, `notificationService`) dưới `250` dòng để đạt `npm run doctor` `100/100`
- [x] `SLICE-03` — Thiết kế & kiểm thử PGlite migration SQL `202611160001_v2_team_invites_and_profiles.sql` (Mời đa kênh Email + Link/Mã mời nhanh Zalo/Discord bật/tắt/đổi mã, danh sách chờ & thu hồi lời mời, tùy chỉnh vai trò & màu Avatar thành viên chuẩn V2, RLS 100%)
- [x] `SLICE-04` — Xây dựng tầng Domain `Zod` Schemas (`accountSchemas.ts`) & Repository tách gọn (`accountProjectRepository.ts` + `accountTeamInviteRepository.ts` + Realtime Presence đếm Online + `accountV2Snapshot.ts` đồng bộ màu Avatar/nhật ký)
- [x] `SLICE-05` — Thiết kế màn hình Đăng nhập Google (`AccountLoginScreen`) có decor đồng bộ 100% style/theme App V2 + tự bắt Link mời `?join=...` & Sảnh Dự Án (`ProjectDashboardScreen`) kèm thanh nhập Mã mời nhanh & Tạo dự án chọn vai trò/màu Avatar
- [x] `SLICE-06` — Xây dựng Modal Quản Lý Nhóm & Cài Đặt App 3 Tab chuẩn thiết kế App V2 (`ProjectTeamModal`: Mời Email + Link/Mã mời nhanh 1 chạm sao chép tin nhắn Zalo, Thành viên/Hồ sơ Online & màu Avatar, Cài đặt PWA Desktop/Android APK/iOS)
- [x] `SLICE-07` — Hợp nhất khung Workspace chuẩn 100% giao diện Bản App V2 (`WorkspaceLeftSidebar`, `WorkspaceTopToolbar`, `WorkspaceMobileBars`, tích hợp Chuông Thông Báo đa nền tảng Web/PWA/Android APK + `AppSettingsModal`)
- [x] `SLICE-08` — Reset sạch & áp dụng schema mới lên Supabase tài khoản (`xwzwsysekkizxmmjjjvn`), nghiệm thu toàn diện (`doctor 100/100`, `typecheck`, `test`, `test:db`, `build`), xuất gói Web/PWA Desktop + build `StackFlow-Checklist.apk` & chụp ảnh kiểm chứng thị giác 1:1
- [x] `SLICE-09` — Sửa gốc tầng Domain & Infrastructure Chia Sẻ Dự Án (`projectShareLinks.ts`, `shareChannelLauncher.ts`, sửa lỗi mất subpath `/stackflow-checklist/` trên GitHub Pages, lỗi `https://localhost` trên APK, lỗi URL `.io./StackFlow-Checklist.apk`, lưu giữ `?join=` bền vững qua `localStorage` + `sessionStorage` & Việt hóa thông báo lỗi)
- [x] `SLICE-10` — Nâng cấp UI Chia Sẻ Đa Kênh (`Gmail` / `Zalo` / `Telegram` / `Copy Link`), nút Chia sẻ 1 chạm trên Top Toolbar (Desktop + Mobile), tự động gửi thư Gmail kèm Link khi mời email, hướng dẫn vượt WebView nhúng Zalo & tự mở dự án sau Google OAuth
- [x] `SLICE-11` — Kiểm thử tích hợp toàn diện (Unit + Component + DB + Browser Preview Desktop/Mobile), đóng gói bản build Web/PWA + `StackFlow-Checklist.apk` sạch sẵn sàng gửi đối tác & chốt sổ bàn giao
- [x] `SLICE-12` — Xây dựng Pure Domain Engine thông báo cho mọi thao tác dự án (`projectActivityNoticeEngine.ts`: thêm Task, Stack, việc nhỏ, hoàn thành, đổi trạng thái, thành viên mới; chống trùng giao việc & chuẩn hóa mô tả tiếng Việt trên `ActivityPanel`)
- [x] `SLICE-13` — Nâng cấp Infrastructure âm báo tức thì (`notificationSoundService.ts` unlock + synth fallback), `notificationPlatformAdapter.ts` & `accountNoticeBridge.ts` bắt trực tiếp cả `assignment_notices` lẫn `activity_logs` Realtime kèm âm thanh
- [ ] `SLICE-14` — Nâng cấp `NotificationBell`, `LiveNoticeToast`, `NotificationSettings` & `DeviceNotificationSettings` (nút bắn thử thông báo + âm thanh 1 chạm), kiểm thử E2E & phát hành đồng bộ `v1.2.2` lên Web / Desktop PWA / Android APK

---

## 2. Watch List (Theo dõi định kỳ)
- Theo dõi kích thước gói `dist/assets/*.js` giữ gọn nhẹ (< 500 kB).
- Giữ ranh giới `getAccountSupabaseClient()` chỉ kết nối tới Supabase tài khoản (`xwzwsysekkizxmmjjjvn.supabase.co`), từ chối database PIN cũ lúc build.
- Kiểm tra mọi truy vấn PostgREST/RPC luôn đi kèm kiểm soát phiên bản (`version`) chống ghi đè chéo thiết bị.

---

## 3. Recent Noise (Đã kiểm tra và bỏ qua có chủ đích)
- Các file `supabase/legacy-schema.sql` và `supabase/legacy-migrations/` được lưu trữ làm lịch sử tham khảo của bản PIN cũ, không chạy lên database tài khoản.

---

## 4. Run Log (Nhật ký các đợt bảo trì / nâng cấp)
- `2026-11-16` | Hoàn tất 3 lát cắt hội tụ (`SLICE-09` -> `SLICE-11`, nâng phiên bản `v1.2.1`): khắc phục triệt để lỗi chia sẻ dự án (mất subpath `/stackflow-checklist/` trên GitHub Pages gây 404, lộ `https://localhost` trên APK, lỗi cú pháp link tải `.io./StackFlow-Checklist.apk`), bổ sung gửi Link trực tiếp qua **Gmail / Zalo / Telegram** + nút Chia sẻ 1 chạm trên Top Toolbar, tự mở cửa sổ soạn Gmail kèm Link khi mời email, tự động vào thẳng dự án sau khi đăng nhập Google từ Link `?join=` và cảnh báo vượt WebView thu nhỏ của Zalo; pass `doctor 100/100`, `oxlint 0 errors`, `64/64` Vitest tests, PGlite RLS tests & kiểm chứng hình ảnh `1920x1080` + `390x844`.
- `2026-11-16` | Hoàn tất toàn bộ 8 lát cắt hội tụ (`SLICE-01` -> `SLICE-08`): gỡ bỏ hoàn toàn luồng PIN cũ, giữ nguyên 100% UI/UX & Theme Engine của Bản App V2, ghép đăng nhập Google OAuth + mời đa kênh (Link/Mã mời nhanh Zalo `?join=SF-XXXXXX` + Email Google), áp dụng migration `202611160001` & reset sạch dự án trên Supabase tài khoản (`xwzwsysekkizxmmjjjvn`), đạt `npm run doctor` `100/100` và đóng gói Web/PWA Desktop + `StackFlow-Checklist.apk`.
- `2026-11-16` | Khảo sát L1 (`loop-triage`): phát hiện 23 file dở trên nhánh `v2-google-auth` và 14 file > 250 dòng khiến `doctor` đạt `0/100`; đã chốt 3 quyết định sản phẩm cùng Cao Nhật Quang và lập lộ trình 8 lát cắt hội tụ.
