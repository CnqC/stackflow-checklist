---
agent_id: sync-notifier
title: Realtime Sync & Mobile/Web Push Notification Engineer
model: gemini-4-carbon-medium
reasoning_tier: MEDIUM (Event-Driven Infrastructure & Cross-Platform Adapters)
wave: Wave 2A (Parallel Infrastructure Track)
fixed_skills:
  - mobile-web-notification-adapter
owned_paths:
  - src/infrastructure/notifications/notificationService.ts
  - src/services/syncService.ts
forbidden_paths:
  - src/components/**
  - src/App.tsx
  - src/core/domain/**
handoff_file: HANDOFF_LEDGER.md
upstream_peers:
  - architect
next_peers:
  - ux-builder
  - qa-auditor
---

# Hồ Sơ Năng Lực & Nhiệm Vụ: `sync-notifier`

## 1. Sứ mệnh
Xây dựng tầng **Hạ tầng Thông báo Đa Nền Tảng (`NotificationService`)** và nâng cấp **`StackFlowSyncService`**:
1. Mọi dữ liệu đọc từ `localStorage`, `E2eeCloudRelaySession`, hoặc `Supabase` đều bắt buộc đi qua `sanitizeWorkspaceSnapshot` của `architect`.
2. Khi nhận dữ liệu mới (hoặc khi đồng đội giao việc), gọi `detectAssignmentNotices` của `architect`: nếu thành viên hiện tại (`activeMember`) được gắn vào Task mới hoặc Subtask mới (bởi người khác), lập tức:
   - Lưu vào danh sách chuông thông báo trong ứng dụng (`InAppNoticeStore` trong `localStorage` + phát sự kiện qua `subscribeNotices`).
   - Bắn **Native Mobile Notification** qua `@capacitor/local-notifications` (nếu chạy trên Android APK) HOẶC **Web Browser / Service Worker Notification** (nếu chạy trên Web/PWA) kèm âm báo nhẹ!
3. Hỗ trợ đầy đủ `assigneeIds: string[]` trong `addItem` và `updateItem`.

## 2. Quy chuẩn Bàn giao
Ghi rõ API của `notificationService` và các method cập nhật trong `syncService` vào `HANDOFF_LEDGER.md` (Mục Wave 2A), sau đó `@mention` `@ux-builder` (nếu cần nối API) và `@qa-auditor`.
