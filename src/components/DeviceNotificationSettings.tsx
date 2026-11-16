import { useEffect, useState } from 'react';
import { Bell, BellRing, Check } from 'lucide-react';
import { triggerTestNotificationAndSound } from '../infrastructure/notifications/accountNoticeBridge';
import { pushRegistrationService } from '../infrastructure/notifications/pushRegistrationService';
import {
  isNativeNotificationPlatform,
  notificationService,
  type NotificationPermissionState,
} from '../infrastructure/notifications/notificationService';
import type { SyncMode, WorkspaceSnapshot } from '../types/models';

interface Props {
  snapshot: WorkspaceSnapshot;
  memberId: string;
  syncMode: SyncMode;
}

export function DeviceNotificationSettings({ snapshot, memberId, syncMode }: Props) {
  const workspaceId = snapshot.workspace.id;
  const memberName = snapshot.members.find((m) => m.id === memberId)?.name ?? 'Bạn';
  const [permission, setPermission] = useState<NotificationPermissionState>(() =>
    notificationService.getPermissionState(),
  );
  const [requesting, setRequesting] = useState(false);
  const [enabled, setEnabled] = useState(() =>
    notificationService.areDeviceAlertsEnabled(workspaceId, memberId),
  );
  const [testSent, setTestSent] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setPermission(notificationService.getPermissionState());
      setEnabled(notificationService.areDeviceAlertsEnabled(workspaceId, memberId));
    };
    refresh();
    const unsubscribeNotices = notificationService.subscribeNotices(refresh);
    const unsubscribePush = pushRegistrationService.subscribeStatus(refresh);
    return () => {
      unsubscribeNotices();
      unsubscribePush();
    };
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

  const handleSendTest = () => {
    triggerTestNotificationAndSound(snapshot, memberId, memberName);
    setTestSent(true);
    window.setTimeout(() => setTestSent(false), 2600);
  };

  return (
    <section className="space-y-2.5">
      <h3 className="text-xs font-bold text-foreground">Thông báo trên thiết bị &amp; Kiểm tra nhanh</h3>
      {permission === 'granted' ? (
        <button
          type="button"
          onClick={toggleAlerts}
          aria-pressed={enabled}
          className="w-full flex items-center gap-2 text-xs border rounded-xl px-3 py-3 cursor-pointer bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
        >
          {enabled ? <Check className="w-4 h-4 text-emerald-400" /> : <Bell className="w-4 h-4 text-slate-400" />}
          <span>Thông báo nổi trên thiết bị: {enabled ? 'Đang bật' : 'Đang tắt'}</span>
        </button>
      ) : permission === 'denied' ? (
        <p className="text-xs text-amber-300 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3">
          {isNativeNotificationPlatform()
            ? 'Hãy bật quyền thông báo trong Cài đặt điện thoại → Ứng dụng → StackFlow → Thông báo.'
            : 'Hãy bật quyền Thông báo cho trang này ở biểu tượng ổ khóa trên thanh địa chỉ trình duyệt.'}
        </p>
      ) : permission === 'unsupported' ? (
        <p className="text-xs text-slate-400">
          Trình duyệt này chưa hỗ trợ popup hệ thống; hộp chuông &amp; âm thanh trong trang vẫn hoạt động đầy đủ.
        </p>
      ) : (
        <button
          type="button"
          onClick={() => void requestPermission()}
          disabled={requesting}
          className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 px-3 py-2.5 text-xs font-semibold text-on-accent cursor-pointer"
        >
          {requesting ? 'Đang bật thông báo...' : '🔔 Bật báo chuông khi có việc mới trên thiết bị'}
        </button>
      )}

      <button
        type="button"
        onClick={handleSendTest}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-500/40 bg-indigo-500/15 px-3 py-2.5 text-xs font-bold text-indigo-200 hover:bg-indigo-500/25 cursor-pointer"
      >
        <BellRing className="w-4 h-4 text-amber-300" />
        {testSent ? 'Đã bắn thử thông báo & phát âm chuông!' : 'Bắn thử thông báo & nghe tiếng chuông ngay'}
      </button>
    </section>
  );
}
