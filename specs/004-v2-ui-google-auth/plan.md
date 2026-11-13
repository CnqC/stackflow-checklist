# Giữ giao diện V2, thay lớp tài khoản

## Quyết định đã xác nhận

- Giao diện và tính năng V2 là mốc sản phẩm. Người dùng chọn bắt đầu dữ liệu dự án trống khi chuyển sang Google.
- Database PIN cũ vẫn phục vụ bản đang phát hành và hiện có dữ liệu; không sửa quyền, xóa bảng hay chạy migration tài khoản lên đó trong lúc chuyển.
- Database tài khoản đã có Google OAuth và RLS được dùng làm backend chuẩn bị. Sau cutover chỉ duy trì một backend đang phục vụ ứng dụng; việc ngừng backend PIN cũ cần backup và kiểm tra bản mới trước.

## Ranh giới kiến trúc

1. `src/components/StackGroupCard.tsx`, `TaskDetailDrawer.tsx`, `ActivityPanel.tsx` và phần bố cục V2 là nguồn giao diện. Không tái tạo lại các tính năng này bằng một bản UI rút gọn.
2. `accountV2Snapshot.ts` chuyển read model tài khoản sang kiểu dữ liệu V2, giữ nguyên ID, vị trí, người được giao, subtask, link và nhật ký. Không đưa PIN vào read model.
3. `accountV2Actions.ts` chuyển thao tác của V2 drawer sang repository tài khoản. Repository gọi PostgREST/RPC với version; database là nơi quyết định quyền cuối cùng.
4. Các thao tác nhiều bảng cần được rà soát để tránh lưu dở khi một bước thất bại. Không đưa vào production cho tới khi kiểm thử xung đột và lỗi mạng.

## Cổng trước khi phát hành

- Thay toàn bộ màn hình dự án V3 còn lại bằng bố cục/component V2; giữ đăng nhập Google và chọn dự án theo tài khoản.
- Đối chiếu từng luồng V2: tìm/lọc, tạo/sửa/xóa Stack và việc, nhiều người phụ trách, subtask, link, nhật ký, thông báo, offline và Android/PWA.
- Kiểm thử hai tài khoản Google thật, quyền owner/member/admin, hai thiết bị sửa đồng thời, đổi mạng và trạng thái app đóng.
- Có backup mã hóa, thử restore, rồi mới chuyển biến môi trường của bản phát hành. Không đụng database PIN cũ trước khi các cổng này đạt.
