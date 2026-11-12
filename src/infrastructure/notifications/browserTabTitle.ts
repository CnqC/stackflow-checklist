import { resolveNoticeStackTitle } from '../../core/domain/noticePresentation';
import type { AppNotice, WorkspaceSnapshot } from '../../types/models';
import { notificationService, isNativeNotificationPlatform } from './notificationService';
import { notificationPreferencesStore } from './notificationPreferencesStore';

const DEFAULT_TITLE = typeof document === 'undefined' || !document.title
  ? 'StackFlow — Checklist Nhóm Dự Án'
  : document.title;
/** A stable unread count is easier to scan than a title that changes every few seconds. */
export function getUnreadNoticeTabTitle(
  notices: AppNotice[],
  snapshot: WorkspaceSnapshot | null,
  memberId: string | null,
): string | null {
  if (!snapshot || !memberId) return null;
  const unread = notices.filter((notice) =>
    !notice.read &&
    notice.workspaceId === snapshot.workspace.id &&
    notice.targetMemberId === memberId,
  );
  if (unread.length === 0) return null;
  const latestStack = resolveNoticeStackTitle(unread[0], snapshot);
  return `(${unread.length}) StackFlow — ${latestStack || 'Việc được giao'}`;
}

/** Keep the browser tab in sync with the same unread notices shown by NotificationBell. */
export function watchBrowserTabNotices(
  snapshot: WorkspaceSnapshot | null,
  memberId: string | null,
): () => void {
  if (typeof document === 'undefined' || isNativeNotificationPlatform()) return () => {};

  const refresh = () => {
    const notices = snapshot && memberId
      ? notificationService.getNotices(snapshot.workspace.id, memberId)
      : [];
    const showBadge = snapshot && memberId
      ? notificationPreferencesStore.get(snapshot.workspace.id, memberId).tabBadgeEnabled
      : false;
    document.title = (showBadge ? getUnreadNoticeTabTitle(notices, snapshot, memberId) : null) ?? DEFAULT_TITLE;
  };

  const unsubscribe = notificationService.subscribeNotices(refresh);
  const unsubscribePreferences = notificationPreferencesStore.subscribe(refresh);
  refresh();

  return () => {
    unsubscribe();
    unsubscribePreferences();
    document.title = DEFAULT_TITLE;
  };
}
