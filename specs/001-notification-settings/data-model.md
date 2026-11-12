# Data Model

`NotificationPreferences` ở localStorage key `stackflow_notification_preferences_v1`, dưới scope `workspaceId::memberId`:

| Field | Type | Default |
| --- | --- | --- |
| `soundEnabled` | boolean | true |
| `soundId` | `notify-1` … `notify-10` | `notify-1` |
| `soundVolume` | number 0…1 | 0.45 |
| `tabBadgeEnabled` | boolean | true |

Mọi bản ghi được chuẩn hóa khi đọc. Báo nổi thiết bị vẫn dùng kho preference hiện có; hộp chuông vẫn dùng kho notice hiện có.
