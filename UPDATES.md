# Cập nhật StackFlow

## Người dùng

Mở **Cài đặt → Ứng dụng → Kiểm tra** để xem phiên bản đang dùng, phiên bản mới và nội dung thay đổi. Ứng dụng cũng kiểm tra lúc mở và định kỳ khi đang chạy; khi có bản mới sẽ hiện nhắc ở dưới màn hình.

| Nền tảng | Nguồn kiểm tra | Cách cập nhật |
| --- | --- | --- |
| Web, PWA trên Windows, iPhone hoặc Android | `version.json` trên cùng trang Web, tạo từ bản build | Bấm **Cập nhật ngay**; Service Worker tải bản mới và trang mở lại. Nếu thiết bị không hỗ trợ Service Worker, trang sẽ tải lại. |
| Android APK cài trực tiếp | GitHub Release mới nhất có tệp `StackFlow-Checklist.apk` | Bấm **Tải APK mới**, mở tệp và xác nhận cài đè. Không thể tự cài đặt im lặng. |

PWA cài bằng Edge trên Windows vẫn là ứng dụng Web nên dùng cùng cơ chế cập nhật Web. APK cài trực tiếp không dùng cơ chế cập nhật trong Google Play. Việc cài đè APK đòi cùng application ID, cùng khóa ký và version code cao hơn; nếu máy đang cài bản debug hoặc bản ký khóa khác, cần chuyển sang bản ký thống nhất trước khi có thể cài đè.

## Developer phát hành phiên bản

1. Bump version trong `package.json` và `package-lock.json` bằng `npm version X.Y.Z --no-git-tag-version`. Đây là nguồn version duy nhất; `android/app/build.gradle` tính `versionName` và `versionCode` từ đó.
2. Cập nhật `release-notes.json` (tiêu đề và danh sách thay đổi). Cùng nội dung này đi vào `version.json` cho Web và phần mô tả GitHub Release cho APK.
3. Chạy `npm test`, `npm run lint`, `npm run build`; commit và đẩy nhánh `master`. GitHub Actions triển khai Web/PWA và tạo APK artifact để kiểm tra.
4. Khi muốn **phát hành APK cho nhóm**, tạo và đẩy tag `vX.Y.Z` đúng với package version. Workflow kiểm tra tag, build APK ký bằng keystore đã cấu hình, rồi tạo GitHub Release kèm APK. Chỉ lúc Release xuất hiện, APK đang cài mới thấy bản mới qua nút Kiểm tra.

Không cần thêm quyền “developer” dựa trên tên thành viên hoặc PIN nhóm. Quyền phát hành nằm ở quyền ghi GitHub repository và khóa ký APK trong GitHub Actions; danh tính thành viên trong app không đủ an toàn để cấp quyền phát hành.

## Kiến trúc

- `src/core/domain/appUpdate.ts`: so sánh version và kiểm tra dữ liệu từ hai nguồn.
- `src/infrastructure/updates/updateService.ts`: kiểm tra qua mạng, chống kiểm tra trùng, tự kiểm tra định kỳ và yêu cầu cập nhật Web.
- `src/components/UpdateSettings.tsx`: trạng thái và thao tác trên giao diện. `AppSettingsModal` chỉ chứa mục cài đặt.
- `vite.config.ts`: nhúng version/build ID vào app và phát `version.json` không đưa vào precache của Service Worker.
- `.github/workflows/deploy.yml`: Web triển khai khi đẩy nhánh; APK Release chỉ xuất bản khi đẩy tag hợp lệ và có chữ ký.

## Tham khảo chính thức

- [Vite PWA auto update](https://vite-pwa-org.netlify.app/guide/auto-update) và [periodic updates](https://vite-pwa-org.netlify.app/guide/periodic-sw-updates).
- [Microsoft Edge PWA và Service Worker](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps-chromium/how-to/service-workers).
- [Android app updates](https://developer.android.com/google/play/app-updates) và [Google Play in-app updates](https://developer.android.com/guide/playcore/in-app-updates).
- [GitHub Release assets API](https://docs.github.com/en/rest/releases/assets).
