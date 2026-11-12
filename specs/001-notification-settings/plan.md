# Implementation Plan: Cài đặt thông báo và âm báo

**Branch**: `001-notification-settings` | **Date**: 2026-11-13 | **Spec**: [spec.md](./spec.md)

## Summary

Thêm cấu hình và âm vào luồng thông báo hiện có. Domain chuẩn hóa cấu hình; infrastructure lưu lựa chọn và phát âm; UI có trang cài đặt trong hộp chuông.

## Technical Context

**Language/Version**: TypeScript 7, React 19  
**Dependencies**: Vite, Capacitor, Supabase, HTMLAudioElement  
**Storage**: localStorage theo workspace/member; không thêm bảng cloud  
**Testing**: Vitest/jsdom, build, oxlint  
**Target**: Web/PWA; Android giữ kênh thông báo hiện tại  
**Constraints**: Autoplay có thể bị chặn; service worker không buộc OS phát file riêng.

## Constitution Check

Domain thuần; thông báo giữ ID chống lặp; quyền chỉ xin sau thao tác; cài đặt được chuẩn hóa và tách theo thành viên.

## Project Structure

```text
src/core/domain/notificationPreferences.ts
src/infrastructure/notifications/{notificationPreferencesStore,notificationSoundService,notificationService,browserTabTitle}.ts
src/components/{NotificationSettings,NotificationBell}.tsx
public/sounds/notify-1.wav ... notify-10.wav
```

## Architecture Decision

`NotificationService` vẫn quyết định notice nào là mới. Sound service nhận notice mới, đọc cài đặt và phát khi trang hiển thị. UI chỉ trình bày và điều khiển. Cách này không đổi schema Supabase hay Edge Functions.
