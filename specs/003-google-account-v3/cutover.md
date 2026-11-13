# Runbook chuyển sang StackFlow v3

## 1. Tạo hạ tầng mới

1. **Đã tạo** Supabase project mới, trống: `xwzwsysekkizxmmjjjvn` tại Singapore. Project PIN cũ `zkuczhuhxjnetamxweyv` chưa bị xóa. Mật khẩu database mới đã được đổi sang giá trị ngẫu nhiên và lưu bằng Windows DPAPI ở `%LOCALAPPDATA%\StackFlow\v3-db-password.dpapi` cho tài khoản Windows hiện tại; không commit hoặc gửi mật khẩu.
2. **Đã áp dụng** cả ba migration `202611130001` đến `202611130003` lên project mới. Migration history và truy vấn read-only xác nhận 0 project, 0 admin. Không chạy migration trên project PIN cũ vì cùng tên bảng có cấu trúc khác.
3. Trên Google Auth Platform tạo OAuth client loại **Web application**. Authorized JavaScript origins gồm origin của trang GitHub Pages thật và `http://localhost:5173` khi thử tại máy. Authorized redirect URI là callback Supabase hiển thị ở trang cấu hình Google provider, dạng `https://<project-ref>.supabase.co/auth/v1/callback`. Điền Client ID/Secret vào Supabase Auth → Providers → Google. Không đặt secret trong `.env` Vite.
4. **Đã đặt** Site URL `https://cnqc.github.io/stackflow-checklist/` và Additional Redirect URLs gồm URL này, `http://localhost:5173/` và `com.quang.stackflow://auth/callback`; **đã tắt** email, phone và anonymous sign-in. URL dùng trong `redirectTo` phải khớp danh sách này.
5. `.env` cục bộ đã trỏ sang project v3 với publishable key và `VITE_ACCOUNT_V3=true`. Chỉ đổi GitHub repository variables lúc sẵn sàng cutover, vì production vẫn cần project PIN cũ cho tới khi giao diện v3 phát hành.

## 2. Gán admin đúng người

Admin đăng nhập Google ít nhất một lần để có hàng trong `auth.users`. Sau khi đối chiếu email admin do chủ dự án cung cấp và xác nhận đó là đúng tài khoản Google, chạy trong SQL Editor:

```sql
select id, email, email_confirmed_at from auth.users
where lower(email) = lower('<EMAIL_ADMIN>');

insert into private.global_admins(user_id)
select id from auth.users
where lower(email) = lower('<EMAIL_ADMIN>') and email_confirmed_at is not null;
```

Kết quả `insert` phải đúng một hàng. Không đặt email admin hoặc UUID vào mã frontend. Admin không được là thành viên dự án; trigger database ngăn hai vai trò chồng nhau. Admin có thể tạo dự án với email người sẽ làm chủ, rồi người đó nhận lời mời sau khi đăng nhập Google.

## 3. Kiểm thử trước khi bật production

- Dùng hai tài khoản Google thật: tạo dự án, mời theo email, nhận lời mời, tạo task và giao cho người thứ hai. Người tạo nhưng không được giao không tick được; người được giao tick được.
- Mở tài khoản ngoài dự án: không thấy dự án. Mở tài khoản admin: thấy tất cả dự án và cập nhật thông tin dự án, nhưng không tạo hay tick task.
- Mở cùng một task trên hai thiết bị, sửa ở thiết bị thứ nhất rồi thử ghi đè từ thiết bị thứ hai: ứng dụng phải báo xung đột và tải lại bản mới.
- Thử Web/PWA cài trên Windows và APK Android: Google login quay lại đúng ứng dụng. Thử đăng xuất và đăng nhập lại.
- Chạy `npm test`, `npm run test:db`, `npm run test:backup`, `npm run lint`, `npm run build`.

## 4. Backup và khôi phục

Supabase Free hiện không có backup tự động hằng ngày. Trước khi dùng dữ liệu thật, chọn một thư mục sao lưu **ngoài repo và ngoài Supabase**, đặt lịch sao lưu phù hợp và thử khôi phục trên project tạm. Theo hướng dẫn chính thức, CLI v3 dùng `supabase db dump --remote`; cần xuất riêng schema và data, vì dump mặc định không chứa data. Ví dụ sau khi `supabase link` với đúng project và chuẩn bị thư mục an toàn:

```powershell
npx supabase db dump --remote -f schema.sql
npx supabase db dump --remote -f data.sql --use-copy --data-only
```

Mã hóa từng file bằng `node scripts/backup-crypto.mjs encrypt schema.sql schema.sql.sfb` và tương tự cho `data.sql`; đặt `STACKFLOW_BACKUP_PASSPHRASE` trong môi trường phiên làm việc. Mật khẩu dài, giữ riêng khỏi bản sao. Công cụ dùng AES-256-GCM + scrypt và từ chối ghi đè file đích. Sau khi kiểm tra giải mã, xóa bản SQL chưa mã hóa bằng cách phù hợp trên thư mục backup của bạn. Giữ ít nhất hai bản sao mã hóa ở hai nơi độc lập. Không commit bản dump, mật khẩu hay khóa giải mã. Khi khôi phục, giải mã file rồi theo [hướng dẫn khôi phục Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) vào project tạm; xác nhận số hàng, đăng nhập và quyền truy cập. Mã hóa file **không thay thế** việc thử restore.

Từ thư mục repo, có thể chạy `powershell -File scripts/backup-v3.ps1 -ProjectRef xwzwsysekkizxmmjjjvn -Destination <THƯ_MỤC_BACKUP>` sau khi đặt `STACKFLOW_BACKUP_PASSPHRASE`. Script dùng thư mục tạm cục bộ cho SQL, xuất hai file `.sfb` và manifest SHA-256. Chỉ chọn đích ngoài repo, ví dụ thư mục OneDrive chứa **file đã mã hóa**. Cần lưu mật khẩu giải mã trong password manager hoặc nơi độc lập với máy này; file DPAPI trên máy không đủ để khôi phục khi mất máy.

## 5. Cutover

Sau khi các bước trên đạt, đặt repository variable `VITE_ACCOUNT_V3=true`, phát hành Web/PWA và APK. Khởi tạo dự án mới; dữ liệu PIN cũ được phép bỏ theo quyết định của chủ dự án. Không trỏ client v3 vào database PIN cũ. Giữ bản backup trước mỗi đợt thay đổi schema và có thể tắt cờ v3 nếu cần quay lại client cũ trong khi chưa dùng dữ liệu v3 thật.

Tài liệu tham khảo: [Google OAuth](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [backup gói Free](https://supabase.com/docs/guides/platform/backups).
