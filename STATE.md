# Sổ Cái Trạng Thái Sống Của Dự Án (`STATE.md` — Loop Engineering · Luồng B Brownfield Convergence)

Last run: 2026-11-16 | Health Score: Đang hội tụ từ 0/100 -> 100/100 (Google Account + V2 App Parity)

> **Quy tắc sử dụng lâu dài**:
> - Mỗi lần mở lại dự án, AI đọc file này đầu tiên để nắm mạch việc.
> - Mỗi lát cắt trong **High Priority** sửa tối đa `<= 10` file theo `gate.yaml`, giữ mọi file `.ts`/`.tsx` `< 250` dòng, cấm `any`, kiểm tra đầu vào qua `Zod`, bật `ENABLE ROW LEVEL SECURITY` cho mọi bảng SQL.

---

## 1. High Priority (Lộ trình hội tụ Google Auth + UI Chuẩn App V2 + Build Web/PWA/APK)
- [x] `SLICE-01` — Thiết lập nền tảng Loop-Engineering (`STATE.md`, `LOOP.md`, `gate.yaml`, `zod`, `typecheck`) & chốt các bản vá đang dở từ phiên trước về working tree sạch (`<= 10` file/commit)
- [ ] `SLICE-02` — Dọn bỏ luồng đăng nhập PIN cũ (`PinAuthScreen`, `TeamAndCloudModal`, `syncService`, `e2eeRelaySync`, `App.tsx`) & tách nhỏ toàn bộ Domain / Component V2 (`StackGroupCard`, `TaskDetailDrawer`, `NotificationBell`, `notificationService`) dưới `250` dòng để đạt `npm run doctor` `100/100`
- [ ] `SLICE-03` — Thiết kế & kiểm thử PGlite migration SQL `202611160001_v2_team_invites_and_profiles.sql` (Mời đa kênh Email + Link/Mã mời nhanh Zalo/Discord bật/tắt/đổi mã, danh sách chờ & thu hồi lời mời, tùy chỉnh vai trò & màu Avatar thành viên chuẩn V2, RLS 100%)
- [ ] `SLICE-04` — Xây dựng tầng Domain `Zod` Schemas (`accountSchemas.ts`) & Repository tách gọn (`accountProjectRepository.ts` + `accountTeamInviteRepository.ts` + Realtime Presence đếm Online + `accountV2Snapshot.ts` đồng bộ màu Avatar/nhật ký)
- [ ] `SLICE-05` — Thiết kế màn hình Đăng nhập Google (`AccountLoginScreen`) có decor đồng bộ 100% style/theme App V2 + tự bắt Link mời `?join=...` & Sảnh Dự Án (`ProjectDashboardScreen`) kèm thanh nhập Mã mời nhanh & Tạo dự án chọn vai trò/màu Avatar
- [ ] `SLICE-06` — Xây dựng Modal Quản Lý Nhóm & Cài Đặt App 3 Tab chuẩn thiết kế App V2 (`ProjectTeamModal`: Mời Email + Link/Mã mời nhanh 1 chạm sao chép tin nhắn Zalo, Thành viên/Hồ sơ Online & màu Avatar, Cài đặt PWA Desktop/Android APK/iOS)
- [ ] `SLICE-07` — Hợp nhất khung Workspace chuẩn 100% giao diện Bản App V2 (`WorkspaceLeftSidebar`, `WorkspaceTopToolbar`, `WorkspaceMobileBars`, tích hợp Chuông Thông Báo đa nền tảng Web/PWA/Android APK + `AppSettingsModal`)
- [ ] `SLICE-08` — Reset sạch & áp dụng schema mới lên Supabase tài khoản (`xwzwsysekkizxmmjjjvn`), nghiệm thu toàn diện (`doctor 100/100`, `typecheck`, `test`, `test:db`, `build`), xuất gói Web/PWA Desktop + build `StackFlow-Checklist.apk` & chụp ảnh kiểm chứng thị giác 1:1

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
- `2026-11-16` | Khảo sát L1 (`loop-triage`): phát hiện 23 file dở trên nhánh `v2-google-auth` và 14 file > 250 dòng khiến `doctor` đạt `0/100`; đã chốt 3 quyết định sản phẩm cùng Cao Nhật Quang và lập lộ trình 8 lát cắt hội tụ.
