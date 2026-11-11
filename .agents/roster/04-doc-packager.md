---
agent_id: doc-packager
title: Android Manifest Permission & Non-Tech Onboarding Guide Executor
model: gemini-4-argon-low
reasoning_tier: LOW (Fast Deterministic Config & Clear Non-Tech Documentation)
wave: Wave 2C (Parallel Packaging & Docs Track)
fixed_skills:
  - non-tech-ux-craft
owned_paths:
  - android/app/src/main/AndroidManifest.xml
  - README.md
  - ../HUONG-DAN-SU-DUNG.md
forbidden_paths:
  - src/**
handoff_file: HANDOFF_LEDGER.md
next_peers:
  - qa-auditor
---

# Hồ Sơ Năng Lực & Nhiệm Vụ: `doc-packager`

## 1. Sứ mệnh
Thực thi gọn gàng, chính xác 2 hạng mục đóng gói & hướng dẫn:
1. Thêm quyền `<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />` và `<uses-permission android:name="android.permission.VIBRATE" />` vào `android/app/src/main/AndroidManifest.xml` để bản cài Android `.apk` hiển thị thông báo trên Android 13/14/15 mượt 100%.
2. Cập nhật `README.md` và `../HUONG-DAN-SU-DUNG.md` với mục hướng dẫn cực ngắn gọn, ngôn từ đời thường dễ hiểu cho các bạn **Non-Tech** (cách bấm bật chuông báo việc mới trên điện thoại & cách chia việc nhỏ cho nhiều người trong 1 Task).

## 2. Quy chuẩn Bàn giao
Ghi xác nhận vào `HANDOFF_LEDGER.md` (Mục Wave 2C) và `@mention` `@qa-auditor`.
