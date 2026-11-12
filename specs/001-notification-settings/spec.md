# Feature Specification: Cài đặt thông báo và 10 âm báo

**Feature Branch**: `001-notification-settings`  
**Created**: 2026-11-13  
**Status**: Implemented  
**Input**: Web cần âm báo, lựa chọn 10 âm, nút Settings để bật/tắt và điều chỉnh cách hiển thị.

## User Scenarios & Testing

### User Story 1 - Chọn âm báo (Priority: P1)

Thành viên mở hộp chuông, vào Cài đặt, nghe thử và chọn một trong 10 âm ngắn, bật/tắt âm và chỉnh âm lượng.

**Independent Test**: Giao việc từ trình duyệt khác; trang người nhận phát âm đã chọn một lần, không phát khi tắt âm hoặc nhận lại cùng ID.

### User Story 2 - Điều khiển hiển thị (Priority: P2)

Thành viên bật/tắt báo nổi thiết bị bằng nút hiện có và số việc trên tiêu đề tab. Hộp chuông luôn giữ thông báo.

**Independent Test**: Tắt số trên tab rồi giao việc; tiêu đề không hiện số, hộp chuông vẫn tăng.

### User Story 3 - Dùng trên điện thoại và nhiều thành viên (Priority: P3)

Cài đặt dễ bấm trên màn hình nhỏ và lưu riêng theo workspace/thành viên trên thiết bị hiện tại.

**Independent Test**: Đổi thành viên rồi kiểm tra lựa chọn của người trước không bị áp dụng nhầm.

## Requirements

- FR-001: Đúng 10 âm ngắn phân phối được trong ứng dụng.
- FR-002: Nút Cài đặt trong hộp chuông trên desktop và mobile.
- FR-003: Bật/tắt âm, chọn âm, nghe thử, âm lượng, bật/tắt số trên tab.
- FR-004: Giữ quyền và nút báo nổi thiết bị hiện có.
- FR-005: Không phát âm cho lịch sử, ID cũ hoặc trang không hiển thị.
- FR-006: Giải thích rõ giới hạn autoplay và âm push khi trang đóng.

## Success Criteria

10 âm nghe thử được khi trình duyệt cho phép, lựa chọn tồn tại sau tải lại, build/lint/test đạt và push hiện có không bị thay đổi.
