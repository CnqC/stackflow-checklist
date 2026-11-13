# Tạo và sắp xếp Stack trong V3

Mốc giao diện: form tạo Stack của bản PIN V2 gồm tên, mô tả, khóa tuần tự, sáu màu và nút tạo/hủy. V3 giữ cùng các trường đó và bổ sung mức ưu tiên thấp, trung bình, cao.

## Luồng dữ liệu

1. `ProjectWorkspace` quản lý trạng thái form và gọi `accountProjectRepository.addStack` với một đối tượng chứa đủ trường. Form chỉ đóng khi lệnh lưu thành công.
2. Repository chuyển các trường sang RPC `create_stack`. Migration `202611130010` thêm cột `stacks.priority`, kiểm tra giá trị, kiểm tra quyền thành viên và ghi Stack cùng vị trí mới trong một giao dịch.
3. `accountStack.ts` chứa bảng màu, nhãn ưu tiên và hàm sắp xếp thuần. Chế độ ưu tiên chỉ thay đổi thứ tự hiển thị; `position` trong database không bị sửa. Nút đổi thứ tự thủ công chỉ hiện khi chọn chế độ thứ tự thủ công.
4. Ưu tiên có thể sửa ở đầu mỗi Stack bằng cập nhật có kiểm tra `version`, theo cùng quy tắc xung đột của các thay đổi Stack khác.

## Ranh giới và kiểm chứng

- Bản PIN V2 tiếp tục dùng model và đồng bộ cũ; migration này chỉ áp dụng cho database tài khoản V3.
- RPC hai tham số cũ vẫn tồn tại để dữ liệu/thử nghiệm cũ không bị ngắt; giao diện V3 gọi RPC sáu tham số.
- Schema test kiểm tra quyền tạo, giá trị đã lưu, cập nhật ưu tiên và đầu vào không hợp lệ. Unit test kiểm tra sắp xếp cùng việc giữ nguyên `position`.
- Cần kiểm tra trực quan với tài khoản Google thật ở kích thước desktop/mobile trước khi đưa V3 lên production.
