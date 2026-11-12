import { beforeEach, describe, expect, it } from 'vitest';
import { createSeedWorkspaceSnapshot } from '../../../core/domain/stackDomain';
import type { AppNotice } from '../../../types/models';
import { getUnreadNoticeTabTitle, watchBrowserTabNotices } from '../browserTabTitle';
import { notificationService } from '../notificationService';
import { notificationPreferencesStore } from '../notificationPreferencesStore';

const BASE_TITLE = 'StackFlow — Checklist Nhóm Dự Án';

describe('Browser tab assignment notices', () => {
  const snapshot = createSeedWorkspaceSnapshot();
  const memberId = snapshot.members[1]!.id;
  const firstItem = snapshot.items[0]!;
  const secondItem = snapshot.items.find((item) => item.stackId !== firstItem.stackId)!;
  const firstStack = snapshot.stacks.find((stack) => stack.id === firstItem.stackId)!.title;
  const secondStack = snapshot.stacks.find((stack) => stack.id === secondItem.stackId)!.title;
  const makeNotice = (id: string, taskId: string): AppNotice => ({
    id,
    workspaceId: snapshot.workspace.id,
    workspaceCode: snapshot.workspace.code,
    targetMemberId: memberId,
    actorName: 'Quang',
    kind: 'task_assigned',
    taskId,
    taskTitle: 'Việc mới',
    createdAt: id === 'first' ? '2026-11-12T10:00:00.000Z' : '2026-11-12T09:00:00.000Z',
    read: false,
  });

  beforeEach(() => {
    window.localStorage.clear();
    document.title = BASE_TITLE;
  });

  it('uses current workspace task and stack data, scoped to the active member', () => {
    const own = makeNotice('first', firstItem.id);
    const anotherMember = { ...own, id: 'other-member', targetMemberId: 'someone-else' };
    const anotherWorkspace = { ...own, id: 'other-workspace', workspaceId: 'elsewhere' };
    const read = { ...own, id: 'read', read: true };

    expect(getUnreadNoticeTabTitle([own, anotherMember, anotherWorkspace, read], snapshot, memberId))
      .toBe(`(1) StackFlow — ${firstStack}`);
    expect(getUnreadNoticeTabTitle([own], snapshot, null)).toBeNull();
  });

  it('shows a stable unread count and restores the original title after reading', () => {
    const stop = watchBrowserTabNotices(snapshot, memberId);
    const first = makeNotice('first', firstItem.id);
    const second = makeNotice('second', secondItem.id);

    notificationService.dispatchNotices([first, second]);
    expect(document.title).toBe(`(2) StackFlow — ${firstStack}`);

    notificationService.markNoticeRead(first.id, snapshot.workspace.id, memberId);
    expect(document.title).toBe(`(1) StackFlow — ${secondStack}`);
    notificationService.markAllRead(snapshot.workspace.id, memberId);
    expect(document.title).toBe(BASE_TITLE);

    stop();
  });

  it('restores the tab title when the active workspace is closed', () => {
    notificationService.dispatchNotices([makeNotice('first', firstItem.id)]);
    const stop = watchBrowserTabNotices(snapshot, memberId);
    expect(document.title).toBe(`(1) StackFlow — ${firstStack}`);
    stop();
    expect(document.title).toBe(BASE_TITLE);
  });

  it('hides the tab count without removing inbox notices', () => {
    const stop = watchBrowserTabNotices(snapshot, memberId);
    notificationService.dispatchNotices([makeNotice('first', firstItem.id)]);
    notificationPreferencesStore.update(snapshot.workspace.id, memberId, { tabBadgeEnabled: false });
    expect(document.title).toBe(BASE_TITLE);
    expect(notificationService.getUnreadCount(snapshot.workspace.id, memberId)).toBe(1);
    stop();
  });
});
