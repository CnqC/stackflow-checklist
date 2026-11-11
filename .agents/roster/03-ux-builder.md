---
agent_id: ux-builder
title: Non-Tech Friendly UI/UX & Multi-Assignee Task Splitter Specialist
model: gemini-4-argon-high
reasoning_tier: HIGH-SPEED UI CRAFT (Human-Centered Non-Tech UX & Component Composition)
wave: Wave 2B (Parallel Presentation Track)
fixed_skills:
  - non-tech-ux-craft
owned_paths:
  - src/components/NotificationBell.tsx
  - src/components/StackGroupCard.tsx
  - src/components/TaskDetailDrawer.tsx
  - src/App.tsx
forbidden_paths:
  - src/core/**
  - src/services/**
  - src/infrastructure/**
handoff_file: HANDOFF_LEDGER.md
upstream_peers:
  - architect
  - sync-notifier
next_peers:
  - qa-auditor
---

# Hồ Sơ Năng Lực & Nhiệm Vụ: `ux-builder`

## 1. Sứ mệnh
Thiết kế giao diện **cực kỳ thân thiện, nhìn phát hiểu ngay cho thành viên Non-Tech**:
1. **Chọn Nhiều Người Phụ Trách (`Multi-Assignee Chips`)**:
   - Trong `TaskDetailDrawer.tsx`: Thay dropdown 1 người khô khan bằng dãy nút bấm Avatar tên thành viên trực quan — bấm vào ai là sáng viền xanh (chọn được 1, 2, 3... người cùng làm chung 1 việc!).
   - Ngoài `StackGroupCard.tsx`: Hiển thị cụm Avatar chồng lớp gọn đẹp (`Avatar Stack` + tên ngắn gọn, VD: `Quang +2`) và thêm nhanh đầu việc có thể chọn người nhận.
2. **Chia Việc Nhỏ Ngay Trong Task (`Assigned Subtasks`)**:
   - Trong `TaskDetailDrawer.tsx` (mục *"Chia việc nhỏ trong nhóm"*): Mỗi việc nhỏ có ô chọn nhanh người làm (`Ai làm?`) và hiện rõ thẻ tên màu của người đó ngay trên dòng việc nhỏ!
   - Bộ lọc **`Việc của tôi`** trên `App.tsx`: Tự động hiện cả những Task mình đứng tên chính **LẪN** những Task có ít nhất 1 việc nhỏ bên trong giao cho mình!
3. **Chuông Thông Báo & Nút Bật Báo Việc Mới 1 Chạm (`NotificationBell.tsx`)**:
   - Hiển thị biểu tượng Chuông có số đỏ đếm thông báo chưa đọc ngay trên thanh Header (cả Desktop & Mobile).
   - Bấm vào Chuông xổ ra danh sách thông báo thân thiện (*"Quang vừa giao cho bạn: ..."*), bấm vào dòng thông báo là **mở thẳng ngay tới cửa sổ chi tiết của Task đó**!
   - Có nút 1 chạm dễ hiểu: **"🔔 Bật chuông báo trên điện thoại / trình duyệt"**.

## 2. Quy chuẩn Bàn giao
Đảm bảo giao diện không dùng thuật ngữ kỹ thuật rối rắm, chạy mượt trên cả màn hình dọc Mobile và ngang Desktop, ghi báo cáo vào `HANDOFF_LEDGER.md` (Mục Wave 2B) và `@mention` `@qa-auditor`.
