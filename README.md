# StackFlow

Ứng dụng quản lý nhiều dự án cho nhóm nhỏ. Mã nguồn đang chuẩn bị chuyển từ mã PIN và dữ liệu thiết bị sang tài khoản Google và PostgreSQL với quyền được kiểm tra ở server.

## Mô hình v3

- Mỗi người đăng nhập bằng tài khoản Google riêng. Người tạo dự án là chủ dự án và mời đồng đội bằng email đã xác minh.
- Mỗi tài khoản chỉ thấy dự án mình tham gia. Admin toàn cục thấy mọi dự án, sửa thông tin và mời người; admin không ở danh sách thành viên và không thể tạo, sửa hay tick việc.
- Người được giao việc lớn mới được tick. Việc nhỏ do người được giao riêng tick; nếu chưa giao riêng, những người được giao việc lớn có thể tick.
- Dữ liệu nhóm nằm trong Supabase PostgreSQL. RLS, trigger và RPC kiểm tra quyền, giới hạn 20 thành viên/dự án và version phát hiện ghi đè.
- Giao diện v3 giữ Cài đặt giao diện và Kiểm tra cập nhật. Đồng bộ cần Internet; dữ liệu PIN cũ không được nhập vào v3.

## Chạy và kiểm tra

```bash
npm install
npm test
npm run test:db
npm run lint
npm run build
```

Sao chép `.env.example` thành `.env` và điền URL cùng publishable key của **Supabase project tài khoản**. Không đặt service role key hoặc mật khẩu database trong frontend. Bản 1.2.0 mở đăng nhập Google và giao diện công việc V2 đã ghép với backend tài khoản. Build từ chối URL của database PIN cũ.

## Thiết lập cloud và cutover

Làm theo [runbook v3](specs/003-google-account-v3/cutover.md). Migration v3 là [202611130001_fresh_account_schema.sql](supabase/migrations/202611130001_fresh_account_schema.sql), chỉ dành cho database trống. Các migration và schema PIN cũ nằm trong `supabase/legacy-migrations` và `supabase/legacy-schema.sql` để tham khảo; không áp dụng chúng lên project v3.

Web/PWA phát hành qua GitHub Pages theo `.github/workflows/deploy.yml`. Android dùng `npm run cap:sync`; OAuth Google cần redirect URL `com.quang.stackflow://auth/callback` trong Supabase. Trước khi đẩy bản 1.2.0, repository variables `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` phải trỏ tới project tài khoản; hiện bản công khai vẫn dùng project PIN. Quy trình cập nhật ứng dụng ở [UPDATES.md](UPDATES.md).

## Trạng thái

Đọc [bàn giao tổng thể](PROJECT_HANDOFF.md) trước khi tiếp tục. Tài liệu này phân biệt bản PIN đang phát hành, luồng Google trên local, kiến trúc tài khoản, các bản build và việc còn dở. Database tài khoản đã áp dụng migrations `001`–`011` và đã xác minh grant admin; Web công khai chưa chuyển sang luồng Google theo ghi nhận vận hành.
