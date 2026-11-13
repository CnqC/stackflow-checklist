# Giao diện StackFlow

## Cách dùng

Nút **Cài đặt** nằm dưới danh sách thành viên ở màn hình rộng, cạnh chuông trên màn hình hẹp và ở đầu màn hình PIN. Mục **Giao diện** có năm chế độ: Sáng, Tối, Theo thiết bị, Theo giờ và Theme màu. Theo giờ dùng giờ địa phương của thiết bị, mặc định chuyển sang sáng lúc 07:00 và tối lúc 19:00. Theme màu có bảy mẫu: Đại dương, Rừng sâu, Thạch anh, Hoa hồng, Hoàng hôn, Bạc hà và Đào nhạt.

## Kiến trúc

- `src/core/domain/appearance.ts`: danh mục theme, cấu trúc tùy chọn, kiểm tra dữ liệu lưu và hàm thuần xác định theme đang dùng.
- `src/infrastructure/appearance/appearanceService.ts`: lưu một tùy chọn giao diện cho thiết bị, theo dõi giờ và chế độ hệ thống, áp dụng CSS tokens tại root. Sự kiện `storage` đồng bộ các tab cùng nguồn.
- `src/components/AppearanceSettings.tsx`: chỉ hiển thị và thay đổi tùy chọn qua service. `AppSettingsModal` là nơi điều hướng; phần thông báo và kết nối giữ các service hiện có.

Để thêm theme mới, thêm một định nghĩa vào `THEMES`. Màu nền, mặt thẻ, viền và điểm nhấn tự chảy qua CSS tokens dùng bởi các utility class hiện có. Tùy chọn giao diện chỉ lưu trên thiết bị, không đi vào snapshot của nhóm. Tùy chọn âm thanh tiếp tục lưu riêng theo dự án và thành viên.

## Tham khảo thiết kế

- [VS Code Color Themes](https://code.visualstudio.com/docs/configure/themes): bộ chọn theme, tự theo hệ điều hành, kho theme mở rộng.
- [JetBrains UI Themes](https://www.jetbrains.com/help/idea/user-interface-themes.html?keymap=primary_default): các chế độ sáng/tối/theo hệ thống và danh mục mẫu.
- [MDN color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/color-scheme): đồng bộ màu cho các điều khiển gốc của trình duyệt.
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/): tham chiếu khi kiểm tra độ tương phản chữ.
