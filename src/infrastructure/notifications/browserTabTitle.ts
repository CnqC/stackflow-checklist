import type { AppNotice, WorkspaceSnapshot } from '../../types/models';
import { notificationService, isNativeNotificationPlatform } from './notificationService';

const DEFAULT_TITLE = typeof document === 'undefined' || !document.title
  ? 'StackFlow — Checklist Nhóm Dự Án'
  : document.title;
const ROTATION_MS = 3000;

/** Use the existing task → stack relationship; notices do not store another copy of the stack name. */
export function getUnreadNoticeTabTitles(
  notices: AppNotice[],
  snapshot: WorkspaceSnapshot | null,
  memberId: string | null,
): string[] {
  if (!snapshot || !memberId) return [];

  const itemStackIds = new Map(snapshot.items.map((item) => [item.id, item.stackId]));
  const stackNames = new Map(snapshot.stacks.map((stack) => [stack.id, stack.title]));

  return notices
    .filter((notice) =>
      !notice.read &&
      notice.workspaceId === snapshot.workspace.id &&
      notice.targetMemberId === memberId,
    )
    .map((notice, index) => {
      const stackId = itemStackIds.get(notice.taskId);
      const stackName = stackId ? stackNames.get(stackId) : undefined;
      return `Notice (${index + 1}) - ${stackName || 'Stack không còn'}`;
    });
}

/** Keep the browser tab in sync with the same unread notices shown by NotificationBell. */
export function watchBrowserTabNotices(
  snapshot: WorkspaceSnapshot | null,
  memberId: string | null,
): () => void {
  if (typeof document === 'undefined' || isNativeNotificationPlatform()) return () => {};

  let titles: string[] = [];
  let activeIndex = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const refresh = () => {
    const nextTitles = getUnreadNoticeTabTitles(
      snapshot && memberId ? notificationService.getNotices(snapshot.workspace.id, memberId) : [],
      snapshot,
      memberId,
    );
    const changed = nextTitles.length !== titles.length ||
      nextTitles.some((title, index) => title !== titles[index]);
    if (changed) activeIndex = 0;
    titles = nextTitles;

    if (timer && titles.length < 2) {
      clearInterval(timer);
      timer = null;
    }
    document.title = titles[activeIndex] ?? DEFAULT_TITLE;

    if (!timer && titles.length > 1) {
      timer = setInterval(() => {
        activeIndex = (activeIndex + 1) % titles.length;
        document.title = titles[activeIndex] ?? DEFAULT_TITLE;
      }, ROTATION_MS);
    }
  };

  const unsubscribe = notificationService.subscribeNotices(refresh);
  refresh();

  return () => {
    unsubscribe();
    if (timer) clearInterval(timer);
    document.title = DEFAULT_TITLE;
  };
}
