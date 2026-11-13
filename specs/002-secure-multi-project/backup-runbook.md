# Sao lưu và chuyển đổi dữ liệu an toàn

## Trước khi thay đổi production

1. Chạy `supabase/audit/pre_cutover_audit.sql` bằng SQL Editor. Lưu kết quả counts, policy và grants vào nơi nội bộ; không gửi dữ liệu dự án lên issue công khai. Đối chiếu schema production với migration trong repo.
2. Xác nhận gói Supabase và khả năng restore/PITR trong Dashboard. Nếu có backup tự động, ghi lại thời điểm recovery point. Dù vậy vẫn lấy một bản xuất độc lập trước cutover.
3. Chuẩn bị **đích lưu mã hóa ngoài Supabase project** (ổ BitLocker hoặc kho lưu trữ mã hóa có phân quyền). Không đặt dump trong repo, OneDrive chưa mã hóa hoặc thư mục `dist`.
4. Dùng CLI để xuất schema và dữ liệu `public,auth` vào đích mã hóa. CLI hiện dùng `--remote` cho project đã link và có thể yêu cầu database password. Ví dụ, sau khi chuyển vào thư mục mã hóa: `npx supabase db dump --remote --schema public,auth --file stackflow-before-cutover.sql`. Không đưa password trực tiếp vào dòng lệnh hoặc lịch sử shell.
5. Tạo checksum SHA-256 cho file và ghi kích thước, thời gian, project ref. Giữ bản sao ở vị trí độc lập thứ hai. DB dump không bao gồm binary của Storage bucket; nếu dùng Storage, xuất riêng các object.
6. Khôi phục bản dump vào **project staging rỗng** bằng phương thức phù hợp với Supabase plan. Đối chiếu số hàng trong audit, số `members`/task mỗi dự án, foreign key và một vài task mẫu. Chỉ coi backup đạt khi staging đọc được dữ liệu.

## Cutover

1. Dừng client cũ ghi dữ liệu trong cửa sổ bảo trì và lấy bản dump mới nhất.
2. Áp dụng migration cộng thêm, cấu hình Auth/SMTP, liên kết từng member cũ với email đã xác minh. Chạy truy vấn `unclaimed` và `owners` đã ghi trong audit; mọi dự án phải có owner và các member cần dùng phải được claim.
   - Sau khi admin đăng nhập OTP lần đầu và xác minh UUID trong `auth.users`, người giữ quyền database thêm UUID đó vào `private.global_admins` bằng SQL Editor. Không dùng email/tên làm khóa admin và không đặt UUID này trong mã frontend.
   - Admin gọi `claim_legacy_member(member_id, user_id, access_role)` cho từng hàng sau khi đối chiếu con người thật; hàm ghi `private.member_claim_audit`. Nếu account đích chưa xác minh email, thao tác bị từ chối.
3. Chỉ triển khai migration thu hồi quyền anon/RLS mới khi client đã dùng JWT và RPC. Chạy kiểm thử quyền trực tiếp qua API, đặc biệt admin không ghi task và người ngoài không đọc dự án.
4. Nếu gate thất bại, ngừng client mới, phục hồi từ bản backup đã thử trên staging và đưa client cũ trở lại sau khi kiểm tra quyền. Không mở lại policy `using (true)` một cách ad hoc trên dữ liệu đã chuyển.

## Sau cutover

- Chọn lịch backup theo RPO/RTO của nhóm; kiểm tra job thất bại và diễn tập restore định kỳ.
- Khi đã có optimistic version, backup vẫn cần thiết để xử lý xóa nhầm hoặc lỗi ứng dụng; version không thay thế backup.
- Ghi rõ ai được giữ khóa giải mã, nơi lưu bản sao và quy trình khôi phục khi người quản trị vắng mặt.
