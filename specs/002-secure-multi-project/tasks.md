# Việc cần triển khai: Secure multi-project

**Trạng thái:** Đã viết migration cộng thêm, Auth adapter và màn hình preview trên staging; chưa áp dụng database hoặc cutover. Các mục bên dưới chỉ đánh dấu hoàn tất khi đã kiểm chứng trên staging/production tương ứng.

## A. Chụp trạng thái và bảo toàn dữ liệu

- [ ] A1 Xác minh policy/GRANT của Supabase production, số workspace/member/task, gói backup hiện có; không xuất dữ liệu cá nhân ra log.
- [ ] A2 Tạo logical dump mã hóa, lưu ngoài project chính; restore sang staging và đối chiếu số hàng, mối quan hệ, schema.
- [ ] A3 Ghi runbook rollback, thời gian bảo trì, danh sách client cũ phải ngừng ghi và kế hoạch thông báo cho nhóm.

## B. Auth và liên kết member hiện hữu

- [ ] B1 Cấu hình Supabase Auth Email OTP, custom SMTP, template `{{ .Token }}`, hạn gửi; thử trên Web, PWA Windows, Android APK.
- [ ] B2 Migration bổ sung `profiles`, `members.user_id`, `members.access_role`, `workspaces.creator_user_id`, `project_invitations`, `private.global_admins` và index/unique tương ứng.
- [ ] B3 Đăng nhập admin lần đầu rồi bootstrap bằng UUID Auth phía server; kiểm chứng admin không nằm trong `members`.
- [ ] B4 Viết Auth adapter, màn hình OTP, dashboard dự án, tạo dự án có owner, mời/nhận lời mời; triển khai theo ranh giới domain/infrastructure/UI.
- [ ] B5 Quy trình claim có xác nhận cho từng member cũ; kiểm tra account A trên nhiều dự án và member cũ chưa claim.

## C. Quyền server và cutover

- [ ] C1 Viết ma trận quyền `anon/member/owner/admin` cho từng bảng, RPC và thao tác; duyệt với người dùng trước cutover.
- [ ] C2 Viết RLS SELECT theo membership/admin và RPC/Edge Functions cho mutation; không tin ID do client cung cấp; đổi push-device sang JWT.
- [ ] C3 pgTAP test allow/deny từng role, cross-project và gọi trực tiếp ngoài UI; thử tạo/tick/sửa task bằng admin phải thất bại.
- [ ] C4 Triển khai client mới và policy mới cùng cửa sổ bảo trì; thu hồi anon, bỏ policy true, vô hiệu PIN/relay trên secure projects; xác nhận dữ liệu vẫn đọc được từ đúng account.

## D. Backup, restore và xung đột

- [ ] D1 Lịch backup mã hóa ngoài project + cảnh báo thất bại, retention, kiểm tra checksum và restore drill.
- [ ] D2 Export/restore dự án qua server với kiểm tra quyền, preview và audit log; không ghi đè trực tiếp khi chưa xem trước.
- [ ] D3 Thêm version từng hàng và update compare-and-swap trong RPC; thông báo xung đột, tải bản mới và áp dụng lại sửa.
- [ ] D4 Tách subtasks JSONB thành bảng riêng nếu nhiều người thường sửa các subtask cùng task; migration giữ `subtask.id`/assignee/completion history.
- [ ] D5 Test lỗi mạng, hai người sửa đồng thời, thiết bị offline, duplicate invite và backup restore; chạy build/test/lint + kiểm tra RLS thực tế.
