# Quy tắc tick hoàn thành task

| Tình huống | Người được tick hoặc mở lại |
| --- | --- |
| Task lớn có một người phụ trách | Người đó |
| Task lớn có nhiều người phụ trách | Bất kỳ người nào trong danh sách |
| Task lớn chưa giao | Không ai; cần giao người phụ trách trước |
| Task nhỏ có người phụ trách riêng | Chỉ người đó, kể cả khi họ không phụ trách task lớn |
| Task nhỏ chưa giao riêng | Bất kỳ người phụ trách task lớn nào |

Tick task nhỏ không tự động tick task lớn. Task lớn có thể được tick độc lập với tiến độ các task nhỏ. Khi mở lại, cùng quy tắc quyền được áp dụng. Người thực hiện được lưu bằng ID và tên; task nhỏ cũ chỉ có tên vẫn đọc được.

## Vị trí thực thi

- `src/core/domain/taskCompletionPolicy.ts`: quyết định quyền thuần, không phụ thuộc UI hoặc nguồn dữ liệu.
- `src/services/syncService.ts`: kiểm tra trước `toggleItem`, `toggleSubtask` và mọi thay đổi hoàn thành trong `updateItem`, kể cả đổi `status` sang `done` hoặc gửi lại mảng `subtasks`.
- `src/components/StackGroupCard.tsx` và `TaskDetailDrawer.tsx`: dùng cùng policy để khóa điều khiển và giải thích lý do. `toggleSubtask` lấy trạng thái mới nhất của task nhỏ trong service, tránh gửi mảng cũ từ UI khi nhiều người cùng thao tác.

## Giới hạn quyền hiện tại

Đây là quy tắc thao tác trong ứng dụng, chưa phải phân quyền bảo mật giữa các tài khoản. Thành viên hiện được chọn bằng tên sau khi nhập PIN chung; Supabase dùng anon key và policy cho phép mọi thao tác. Một người có thể đổi người phụ trách trong UI hoặc dùng client khác để ghi dữ liệu. Muốn đảm bảo quyền ở máy chủ cần xác thực riêng từng thành viên, chính sách phân quyền cho việc giao lại, và RLS hoặc API máy chủ kiểm tra quyền trước khi ghi.
