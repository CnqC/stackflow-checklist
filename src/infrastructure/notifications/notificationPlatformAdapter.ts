import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { AppNotice } from '../../types/models';
import { writeNativePermissionCache } from './notificationStorage';

export type NoticeOpenTarget = { taskId?: string; workspaceId?: string };

export const ANDROID_CHANNEL_ID = 'stackflow_assignments_v2';

export function isNativeNotificationPlatform(): boolean {
  return typeof window !== 'undefined' && Capacitor.isNativePlatform();
}

export function hashNoticeIdToInt32(noticeId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < noticeId.length; i += 1) {
    hash ^= noticeId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const positive = hash & 0x7fffffff;
  return positive === 0 ? 1 : positive;
}

export function formatNoticeMessage(
  notice: AppNotice,
  stackTitle?: string | null,
): { title: string; body: string } {
  const context = stackTitle ? ` · ${stackTitle}` : '';
  if (notice.kind === 'project_activity') {
    const subPrefix = notice.subtaskTitle?.trim() ? `${notice.subtaskTitle.trim()} · ` : '';
    return {
      title: `🔔 ${notice.actorName} ${notice.activityDetail || 'vừa cập nhật dự án'}`,
      body: `${subPrefix}${notice.taskTitle}${context}`,
    };
  }
  if (notice.kind === 'subtask_assigned') {
    const subLabel = notice.subtaskTitle?.trim() || notice.taskTitle;
    return {
      title: `${notice.actorName} giao phần việc mới`,
      body: `${subLabel} · ${notice.taskTitle}${context}`,
    };
  }
  return {
    title: `${notice.actorName} giao việc cho bạn`,
    body: `${notice.taskTitle}${context}`,
  };
}

export function mapCapacitorPermission(display: string | undefined): 'granted' | 'denied' | 'default' {
  if (display === 'granted') return 'granted';
  if (display === 'denied') return 'denied';
  return 'default';
}

export async function ensureAndroidNotificationChannel(alreadyReady: boolean): Promise<boolean> {
  if (alreadyReady || !isNativeNotificationPlatform()) return alreadyReady;
  try {
    await LocalNotifications.createChannel({
      id: ANDROID_CHANNEL_ID,
      name: 'Việc được giao',
      description: 'Thông báo khi đồng đội giao việc cho bạn',
      importance: 3,
      visibility: 0,
      vibration: true,
    });
    return true;
  } catch {
    return false;
  }
}

export function attachPlatformNotificationOpenListeners(
  onOpen: (noticeId: unknown, target?: NoticeOpenTarget) => void,
  onResetFlag: () => void,
): void {
  if (isNativeNotificationPlatform()) {
    void LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      onOpen(action.notification.extra?.noticeId, {
        taskId: action.notification.extra?.taskId,
        workspaceId: action.notification.extra?.workspaceId,
      });
    }).catch(() => {
      onResetFlag();
    });
    return;
  }

  if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
      if (event.data?.type === 'stackflow:notice-open') {
        onOpen(event.data.noticeId, {
          taskId: event.data.taskId,
          workspaceId: event.data.workspaceId,
        });
      }
    });
  }
}

export async function triggerPlatformOsNotification(options: {
  notice: AppNotice;
  stackTitle?: string | null;
  androidChannelReady: boolean;
  setAndroidChannelReady: (ready: boolean) => void;
  onOpen: (noticeId: unknown, target?: NoticeOpenTarget) => void;
}): Promise<void> {
  const { notice, stackTitle, androidChannelReady, setAndroidChannelReady, onOpen } = options;
  const { title, body } = formatNoticeMessage(notice, stackTitle);

  if (isNativeNotificationPlatform()) {
    try {
      const perm = await LocalNotifications.checkPermissions();
      const mapped = mapCapacitorPermission(perm?.display);
      writeNativePermissionCache(mapped);
      if (mapped !== 'granted') return;

      const ready = await ensureAndroidNotificationChannel(androidChannelReady);
      setAndroidChannelReady(ready);
      await LocalNotifications.schedule({
        notifications: [
          {
            id: hashNoticeIdToInt32(notice.id),
            title,
            body,
            largeBody: body,
            channelId: ANDROID_CHANNEL_ID,
            autoCancel: true,
            foreground: false,
            isExactNotification: false,
            extra: {
              noticeId: notice.id,
              workspaceId: notice.workspaceId,
              targetMemberId: notice.targetMemberId,
              taskId: notice.taskId,
              kind: notice.kind,
            },
          },
        ],
      });
    } catch {
      // Never crash app sync flow if native notification fails
    }
    return;
  }

  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') return;
  if (window.Notification.permission !== 'granted') return;

  try {
    const swContainer = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    if (swContainer && typeof swContainer.getRegistration === 'function') {
      const registration = await swContainer.getRegistration();
      if (registration && typeof registration.showNotification === 'function') {
        await registration.showNotification(title, {
          body,
          tag: notice.id,
          data: {
            noticeId: notice.id,
            workspaceId: notice.workspaceId,
            targetMemberId: notice.targetMemberId,
            taskId: notice.taskId,
          },
        });
        return;
      }
    }
  } catch {
    // Fallback to standard Web Notification constructor below
  }

  try {
    const popup = new window.Notification(title, { body, tag: notice.id });
    popup.onclick = () => {
      popup.close();
      window.focus();
      onOpen(notice.id, { taskId: notice.taskId, workspaceId: notice.workspaceId });
    };
  } catch {
    // Ignore mobile browsers that disallow direct Notification constructor without SW
  }
}
