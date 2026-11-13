import { useEffect, useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { pushRegistrationService } from '../infrastructure/notifications/pushRegistrationService';
import { notificationService, isNativeNotificationPlatform, type NotificationPermissionState } from '../infrastructure/notifications/notificationService';
import type { SyncMode, WorkspaceSnapshot } from '../types/models';

interface Props {
  snapshot: WorkspaceSnapshot;
  memberId: string;
  syncMode: SyncMode;
}

export function DeviceNotificationSettings({ snapshot, memberId, syncMode }: Props) {
  const workspaceId = snapshot.workspace.id;
  const [permission, setPermission] = useState<NotificationPermissionState>(() => notificationService.getPermissionState());
  const [requesting, setRequesting] = useState(false);
  const [enabled, setEnabled] = useState(() => notificationService.areDeviceAlertsEnabled(workspaceId, memberId));
  const [pushActive, setPushActive] = useState(() => pushRegistrationService.isActiveFor(workspaceId, memberId));

  useEffect(() => {
    const refresh = () => {
      setPermission(notificationService.getPermissionState());
      setEnabled(notificationService.areDeviceAlertsEnabled(workspaceId, memberId));
      setPushActive(pushRegistrationService.isActiveFor(workspaceId, memberId));
    };
    refresh();
    const unsubscribeNotices = notificationService.subscribeNotices(refresh);
    const unsubscribePush = pushRegistrationService.subscribeStatus(refresh);
    return () => { unsubscribeNotices(); unsubscribePush(); };
  }, [workspaceId, memberId]);

  const requestPermission = async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      if (await notificationService.requestPermission()) {
        await pushRegistrationService.sync(snapshot, memberId, syncMode, true);
      }
      setPermission(notificationService.getPermissionState());
      setEnabled(notificationService.areDeviceAlertsEnabled(workspaceId, memberId));
    } finally {
      setRequesting(false);
    }
  };

  const toggleAlerts = () => {
    const next = !enabled;
    notificationService.setDeviceAlertsEnabled(workspaceId, memberId, next);
    setEnabled(next);
    if (next) void pushRegistrationService.sync(snapshot, memberId, syncMode, true);
    else void pushRegistrationService.disable();
  };

  return <section className="space-y-2">
    <h3 className="text-xs font-bold text-foreground">Thông báo trên thiết bị</h3>
    {permission === 'granted' ? <button type="button" onClick={toggleAlerts} aria-pressed={enabled}
      className="w-full flex items-center gap-2 text-xs border rounded-xl px-3 py-3 cursor-pointer bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700">
      {enabled ? <Check className="w-4 h-4 text-emerald-400" /> : <Bell className="w-4 h-4 text-slate-400" />}
      <span>Thông báo nổi: {enabled ? 'Bật' : 'Tắt'}</span>
    </button> : permission === 'denied' ? <p className="text-xs text-amber-300 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
      {isNativeNotificationPlatform()
        ? 'Hãy bật quyền thông báo trong Cài đặt điện thoại → Ứng dụng → StackFlow → Thông báo.'
        : 'Hãy bật quyền Thông báo cho trang này trong cài đặt trình duyệt.'}
    </p> : permission === 'unsupported' ? <p className="text-xs text-slate-400">Thiết bị này chưa hỗ trợ thông báo hệ thống; hộp chuông vẫn hoạt động.</p>
      : <button type="button" onClick={() => void requestPermission()} disabled={requesting}
        className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 px-3 py-2.5 text-xs font-semibold text-on-accent cursor-pointer">
        {requesting ? 'Đang bật thông báo...' : 'Bật thông báo trên thiết bị'}
      </button>}
    {enabled && permission === 'granted' && !pushActive && <p className="text-[11px] text-amber-300">
      {syncMode === 'supabase' ? 'Báo khi đóng ứng dụng cần hoàn tất cấu hình push trên thiết bị này.' : 'Hiện chỉ báo khi ứng dụng đang chạy. Báo khi đóng ứng dụng cần máy chủ push.'}
    </p>}
  </section>;
}
