# Trạng thái triển khai v3

- [x] Tách migration PIN cũ ra khỏi đường áp dụng mới.
- [x] Thiết kế schema v3, RLS, trigger tick theo người được giao, giới hạn thành viên và version.
- [x] Đăng nhập Google qua Supabase trên Web và callback Capacitor Android.
- [x] Giao diện dự án, lời mời, thành viên, stack, task và subtask.
- [x] Tạm ngưng/kích hoạt thành viên và chuyển quyền chủ dự án qua RPC.
- [x] Kiểm thử PostgreSQL cục bộ cho quyền đọc, admin, lời mời, tick và xung đột version.
- [x] CI kiểm thử schema và cờ build v3.
- [x] Tạo Supabase project v3 mới tại `xwzwsysekkizxmmjjjvn`, áp dụng migration và kiểm tra database trống.
- [x] Đặt Site URL, redirect URL Web/local/Android và tắt email/phone/anonymous sign-in trên project mới.
- [ ] Tạo Google OAuth client và bật Google provider trong Supabase.
- [ ] Admin đăng nhập Google lần đầu và bootstrap UUID vào `private.global_admins`.
- [x] Công cụ mã hóa/giải mã backup và kiểm thử byte-for-byte.
- [x] Chạy thử pipeline xuất schema/data thật từ Supabase v3, mã hóa và tạo checksum; dữ liệu thử dùng khóa tạm đã được dọn.
- [ ] Thiết lập nơi lưu bản sao mã hóa, mật khẩu giải mã, lịch backup và thử restore trên project tạm.
- [ ] Kiểm tra Web, Windows PWA và APK trên thiết bị thật với ít nhất hai tài khoản Google.
- [ ] Chuyển các tiện ích còn thiếu từ giao diện cũ hoặc chốt phạm vi v3 để thay thế.
- [ ] Bật `VITE_ACCOUNT_V3=true` trên GitHub Actions, phát hành và kiểm tra dữ liệu thật.
