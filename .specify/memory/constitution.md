# StackFlow Constitution

## Core Principles

### I. Ranh giới tầng
`src/core/domain` chỉ có kiểu và hàm thuần. UI nằm trong `src/components`; trình duyệt, lưu trữ và thiết bị nằm trong `src/infrastructure`.

### II. Một thông báo, một ID
Hộp chuông, popup, âm báo và điều hướng dùng cùng ID. Đồng bộ lại không được phát lại thông báo cũ; chỉ người được giao việc nhận báo.

### III. Quyền và khả năng thật
Chỉ xin quyền thông báo sau thao tác người dùng. UI phải nói rõ âm riêng của web phụ thuộc quyền phát media và không điều khiển âm hệ thống khi trang đóng.

### IV. Dữ liệu tương thích
Chuẩn hóa dữ liệu đọc qua lưu trữ. Cài đặt thông báo thuộc cặp workspace/thành viên trên thiết bị hiện tại; không đổi schema nhóm khi không cần.

### V. Giao diện dễ hiểu
Dùng nhãn tiếng Việt đời thường, điều khiển được bằng chuột và bàn phím, vùng bấm phù hợp điện thoại.

## Quality Gates

Chạy `npm run build`, `npm test`, `npm run lint`; kiểm tra thủ công hai trình duyệt khi sửa thông báo. Test mới kiểm tra hành vi thiết yếu.

## Governance

Feature mới ghi yêu cầu, kiến trúc và việc cần làm trong `specs/`. Thay đổi nguyên tắc phải có lý do và ngày sửa.

**Version**: 1.0.0 | **Ratified**: 2026-11-13 | **Last Amended**: 2026-11-13
