# Kế hoạch kiến trúc: Secure multi-project

**Ngày:** 2026-11-13
**Đường code hiện tại:** `App` → `syncService` → `supabaseConfig`/`e2eeRelaySync`; domain thuần ở `src/core/domain`, UI ở `src/components`, hạ tầng tại `src/infrastructure`. Không triển khai RLS mới khi client cũ còn phụ thuộc PIN và quyền anon.

## 1. Mô hình dữ liệu tối thiểu tương thích

```text
auth.users (Supabase Auth)
  ├─ 1:1 public.profiles(user_id PK, display_name, avatar, ...)
  ├─ 1:N public.members(id PK cũ, workspace_id, user_id UNIQUE theo workspace,
  │                     access_role=owner|member, role=chức danh hiện có)
  └─ 0:1 private.global_admins(user_id PK)

public.workspaces(id, creator_user_id, name, ...)
  ├─ members → checklist_items.assignee_id/assignee_ids, subtasks.assigneeId
  ├─ project_invitations(id, workspace_id, invited_email, invited_by_user_id,
  │                      status, expires_at, accepted_at)
  └─ stacks, checklist_items, activity_logs
```

`members.id` giữ nguyên để task và lịch sử không đổi khóa. `members.user_id` liên kết tài khoản thật; unique `(workspace_id,user_id)` chỉ với hàng đã claim. `access_role` là quyền, tách khỏi cột `role` đang là chức danh tự do. `global_admins` trong schema private không nằm ở `members`, vì vậy không xuất hiện trong roster hay giới hạn 10 thành viên. Admin tạo dự án phải gán một owner thực tế trước khi mở dự án cho nhóm.

## 2. Luồng UX

1. Màn hình đầu: email → gửi OTP → nhập 6 số → Supabase Auth trả JWT. Không lưu lại PIN dự án. Tài khoản có thể đăng nhập trên Web, PWA Windows và Android APK.
2. Dashboard liệt kê **Dự án của tôi** từ membership. Tài khoản admin còn có **Tất cả dự án** và chế độ quan sát/quản trị metadata; khi vào dự án, nút tạo/sửa/tick task không hiện. Quyền DB vẫn chặn nếu cố gọi API trực tiếp.
3. Người tạo dự án chọn tên/mã dự án và danh sách email mời. Transaction server tạo workspace + membership owner. Nếu người tạo là global admin thì yêu cầu chọn owner khác để giữ admin ẩn.
4. Người được mời đăng nhập email đã xác minh, xem lời mời, chấp nhận. Server đối chiếu email của Auth với invitation và tạo `members.user_id`; lời mời một lần, hết hạn, không thể tự sửa địa chỉ người nhận.
5. Mỗi task/subtask tiếp tục gắn `members.id`. Khi ghi, server tìm `members` bằng `auth.uid()` trong workspace và kiểm tra quy tắc `canCompleteTask`/`canCompleteSubtask`; không tin `actorId` từ client.

## 3. Ranh giới quyền server

- **Đọc:** RLS tách `SELECT` theo membership hoặc admin. Admin chỉ nhận quyền đọc dự án và nội dung cần giám sát. `anon` không đọc bảng nghiệp vụ.
- **Ghi task/stack/membership:** thu hồi `INSERT/UPDATE/DELETE` trực tiếp cho `anon` và giới hạn `authenticated`; dùng các RPC được kiểm tra JWT, membership, trạng thái dự án và expected row version trong một transaction. Mọi RPC trả về dữ liệu mới hoặc lỗi quyền/xung đột rõ ràng.
- **Quản trị và lời mời:** Edge Functions xác thực JWT, kiểm tra owner/global admin trong DB rồi mới dùng secret key cho phần cần thiết. Secret key chỉ lưu phía server. Không dùng email tự khai trong request làm chứng cứ quyền.
- **Push:** `push-device` đổi từ room PIN/member ID sang JWT + membership check; token chỉ gắn với tài khoản và dự án có quyền.
- **RLS helpers:** nếu cần `security definer` để tránh policy đệ quy, đặt trong schema private, `search_path = ''`, tên bảng có schema, chỉ cấp EXECUTE tối thiểu. Test quyền cả REST/RealtIme và RPC; UI ẩn nút chỉ là trải nghiệm.

## 4. Thứ tự chuyển đổi production

| Giai đoạn | Việc làm | Cổng kiểm tra trước khi đi tiếp |
| --- | --- | --- |
| 0. Chụp trạng thái | Kiểm tra schema/policy production, gói Supabase, số workspace/member; lấy dump mã hóa và thử restore sang staging. | Restore có đủ số hàng và dữ liệu mẫu; bản dump ngoài project chính. |
| 1. Auth + schema bổ sung | Thêm profile, `members.user_id`, `access_role`, invitation, admin table; triển khai OTP + danh sách dự án trong staging. | Test đăng nhập cả Web/Android; admin UUID bootstrap an toàn; SMTP gửi tới người ngoài team Supabase. |
| 2. Claim dữ liệu cũ | Chủ dự án xác nhận tài khoản cho từng member cũ và gắn `user_id`; không so tên tự động. Rà soát hàng chưa claim. | Danh sách owner, member, task assignee trước/sau khớp; có đường xử lý member chưa có email. |
| 3. Cutover bảo mật | Trong cửa sổ bảo trì, triển khai client mới, thu hồi quyền anon, thay policy true bằng policy theo Auth, gỡ PIN khỏi API mới, ngắt relay cho dự án secure. | Test ngoài UI: anon/outsider/admin không ghi task; owner/member chỉ thao tác đúng; không còn client cũ ghi được. |
| 4. Backup/restore liên tục | Chạy lịch backup mã hóa ngoài Supabase project; ghi trạng thái, cảnh báo thất bại; thêm export/restore dự án có kiểm tra quyền và preview trước khi ghi. | Thử khôi phục định kỳ vào staging; xác nhận RPO/RTO mong muốn. |
| 5. Chống xung đột | Thêm `version bigint` cho task/stack; RPC update với `WHERE id=? AND version=?`, tăng version khi thành công. Tách subtasks thành hàng riêng khi cần sửa đồng thời thường xuyên. | Hai người sửa cùng version: một người thành công, người kia nhận 409/CONFLICT, không mất sửa; retry có ý thức. |

Không chuyển thẳng từ policy `true` sang policy mới trước khi liên kết các member hiện hữu: sẽ khóa tất cả tài khoản. Không giữ policy `true` để “tương thích ngược”: sẽ duy trì lỗ hổng. Cần một cutover có backup và staging.

## 5. Thay đổi code theo tầng

- `src/core/domain`: kiểu `Account`, `ProjectMembership`, `ProjectPermission`, `Revision`; hàm thuần mô tả khả năng UI, xung đột và chuyển dữ liệu tương thích. Không gọi Auth/DB ở domain.
- `src/infrastructure/auth`: Supabase Auth adapter (OTP, session, sign out) và listener phiên. `src/infrastructure/projects`: repository đọc/ghi qua RLS/RPC, invitation adapter, backup client.
- `src/services`: orchestration use cases; tách `syncService` hiện tại thành facade theo dự án để giảm tệp quá lớn và loại bỏ nhánh PIN/relay cho secure project.
- `src/components`: Login OTP, dashboard nhiều dự án, lời mời, admin view, xung đột và màn hình restore. `App` điều hướng theo Auth session, không theo `selectedMember` tự chọn.
- `supabase/migrations` và `supabase/tests`: migration bổ sung, RLS/RPC, quyền admin, kiểm thử pgTAP. `supabase/schema.sql` hiện tại cần thành schema bootstrap mới hoặc tài liệu legacy, tránh chạy lại policy `true` sau cutover.

## 6. Điểm cần xác nhận khi bắt đầu triển khai

- UUID tài khoản Auth của admin sau khi họ đăng nhập lần đầu (không lưu email admin trong frontend). Cần một owner khác nếu admin tạo dự án nhưng vẫn phải ẩn.
- Nhà cung cấp SMTP/email OTP; địa chỉ email của các thành viên cần claim dự án cũ.
- Supabase plan và vị trí lưu backup mã hóa ngoài project, chu kỳ và thời gian phục hồi mong muốn.
- Có cần cho một owner chuyển quyền owner sang người khác và có cho một tài khoản vừa là global admin vừa là thành viên ở dự án riêng hay không. Mặc định: admin toàn cục không là member ở bất kỳ dự án nào.
