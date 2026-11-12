# Research and Decisions

- [Spec Kit installation](https://github.com/github/spec-kit/blob/main/docs/installation.md): cài CLI từ GitHub tag và khởi tạo dự án có sẵn bằng `specify init --here`; Windows dùng PowerShell.
- [Codex integration](https://github.com/github/spec-kit/blob/main/docs/integrations/codex.md): key `codex`, skill trong `.agents/skills`.
- [Kenney UI Audio](https://kenney.nl/assets/ui-audio): 50 âm CC0; chọn 10 âm `switch1..switch10`, dài 0,21–0,43 giây. Giấy phép ở `public/sounds/LICENSE.txt`.
- [MDN Autoplay](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay): trình duyệt có thể chặn `Audio.play()` trước khi trang được tương tác.
- [MDN Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API): popup hệ thống do trình duyệt và OS vẽ.

**Decision**: Dùng âm bản địa cho PWA offline; bật âm mặc định ở 45%. Không đưa lựa chọn âm vào push payload vì service worker không điều khiển âm hệ thống.
