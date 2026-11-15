# Quy Ước Vận Hành Vòng Lặp Dài Hạn (`LOOP.md`)

Tài liệu này định nghĩa cách con người (Cao Nhật Quang) và AI Agent phối hợp bảo trì, nâng cấp và sửa chữa dự án này bền vững qua nhiều năm theo chuẩn **`cobusgreyling/loop-engineering` + `obra/superpowers` + `cloudflare/security-audit-skill`**.

---

## 1. Ba Cấp Độ Vận Hành (`L1 -> L2 -> L3`)
- **Cấp `L1` — Khám Bệnh & Ghi Sổ (`loop-triage` — Chỉ Báo Cáo)**:
  - Chạy `npm run doctor` + khảo sát mã nguồn $\rightarrow$ cập nhật các hạng mục cần làm vào `STATE.md`. Không tự ý sửa code khi đang ở pha khám bệnh.
- **Cấp `L2` — Phẫu Thuật Từng Lát Cắt Có Giám Khảo (`Maker != Checker`)**:
  - **Maker (`minimal-fix` + `TDD`)**: Lấy đúng **1 mục** trên đỉnh `STATE.md`, sửa tối đa **10 file** (`gate.yaml`), viết/cập nhật bài test trước.
  - **Checker (`loop-verifier` + `security-audit`)**: Kiểm tra độc lập bằng lệnh thật (`npm run doctor && npm run typecheck && npm test && npm run build`). Mặc định từ chối (`REJECT`) nếu vượt phạm vi file, vi phạm bảo mật, hoặc chưa chạy lệnh kiểm chứng tươi mới.
  - **Con người duyệt chốt**: Các thay đổi đụng vào danh sách nhạy cảm trong `gate.yaml` (`database/`, `.env`, cấu hình `.apk`/`.exe`) luôn do Quang quyết định cuối cùng.

---

## 2. Lệnh Kiểm Định Chuẩn Của Dự Án
```bash
npm run doctor      # Chấm điểm sức khỏe kiến trúc, rào chắn gate.yaml & quét bảo mật Cloudflare
npm run typecheck   # Kiểm tra kiểu TypeScript nghiêm ngặt (tsc -b)
npm test            # Chạy Unit Tests tốc độ mili-giây (Vitest)
npm run build       # Đóng gói bản Production + PWA (Vite)
npm run test:e2e    # Kiểm chứng giao diện 3 màn hình 1920x1080, 1024x768, 390x844 (Playwright)
```
