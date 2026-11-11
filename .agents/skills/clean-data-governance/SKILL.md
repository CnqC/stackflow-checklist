---
name: clean-data-governance
description: >-
  Quy chuẩn Kiến trúc Sạch (Clean Architecture) & Quản trị Dữ liệu Chặt chẽ cho
  StackFlow Checklist: bất biến trạng thái, chuẩn hóa Schema v1->v2 không gãy dữ liệu cũ,
  tách biệt 100% Domain thuần khỏi Infrastructure và UI.
---

# Kỹ Năng Cố Định: `clean-data-governance`

1. **Tách Bạch Tầng Nghiêm Ngặt (Strict Layering)**:
   - `src/core/domain/` tuyệt đối KHÔNG được `import` React, DOM, `window`, `localStorage`, `mqtt`, hay `@supabase/supabase-js`. Mọi hàm trong `src/core/domain/` phải là **Pure Functions** tất định (deterministic) chạy dưới 1ms trong Unit Tests.
2. **Bảo Vệ Toàn Vẹn Dữ Liệu Ở Mọi Ranh Giới (`DataIntegrityGuard`)**:
   - Mọi `WorkspaceSnapshot` đọc từ `localStorage`, nhận từ `E2eeCloudRelaySession`, hoặc tải từ `Supabase` đều phải đi qua `sanitizeWorkspaceSnapshot(raw)`:
     - Gắn `schemaVersion: 2`.
     - Đồng bộ hai chiều giữa `assigneeIds: string[]` và `assigneeId: string | null`:
       - Nếu dữ liệu v1 chỉ có `assigneeId: "m1"` mà chưa có `assigneeIds`, tự động nâng cấp thành `assigneeIds: ["m1"]`.
       - Nếu có `assigneeIds: ["m1", "m2"]`, gán `assigneeId = assigneeIds[0] ?? null` để tương thích ngược 100% với mọi truy vấn cũ.
       - Loại bỏ trùng lặp ID và lọc bỏ các ID thành viên không còn tồn tại trong `members`.
     - Chuẩn hóa từng `SubtaskItem`: luôn đảm bảo có `{ id, title, completed, assigneeId: string | null, completedByName: string | null }`.
3. **Không Đột Biến Trực Tiếp (`Immutability`)**:
   - Không sửa trực tiếp mảng/object đầu vào; luôn trả về bản sao sạch đã kiểm duyệt.
