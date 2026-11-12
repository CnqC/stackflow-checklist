import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeedWorkspaceSnapshot } from '../../../core/domain/stackDomain';
import type { AppNotice } from '../../../types/models';
import { getUnreadNoticeTabTitles, watchBrowserTabNotices } from '../browserTabTitle';
import { notificationService } from '../notificationService';

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
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses current workspace task and stack data, scoped to the active member', () => {
    const own = makeNotice('first', firstItem.id);
    const anotherMember = { ...own, id: 'other-member', targetMemberId: 'someone-else' };
    const anotherWorkspace = { ...own, id: 'other-workspace', workspaceId: 'elsewhere' };
    const read = { ...own, id: 'read', read: true };

    expect(getUnreadNoticeTabTitles([own, anotherMember, anotherWorkspace, read], snapshot, memberId))
      .toEqual([`Notice (1) - ${firstStack}`]);
    expect(getUnreadNoticeTabTitles([own], snapshot, null)).toEqual([]);
  });

  it('rotates unread stack names and restores the original title after reading', () => {
    const stop = watchBrowserTabNotices(snapshot, memberId);
    const first = makeNotice('first', firstItem.id);
    const second = makeNotice('second', secondItem.id);

    notificationService.dispatchNotices([first, second]);
    expect(document.title).toBe(`Notice (1) - ${firstStack}`);

    vi.advanceTimersByTime(3000);
    expect(document.title).toBe(`Notice (2) - ${secondStack}`);
    vi.advanceTimersByTime(3000);
    expect(document.title).toBe(`Notice (1) - ${firstStack}`);

    notificationService.markNoticeRead(first.id, snapshot.workspace.id, memberId);
    expect(document.title).toBe(`Notice (1) - ${secondStack}`);
    notificationService.markAllRead(snapshot.workspace.id, memberId);
    expect(document.title).toBe(BASE_TITLE);

    stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restores the tab title when the active workspace is closed', () => {
    notificationService.dispatchNotices([makeNotice('first', firstItem.id)]);
    const stop = watchBrowserTabNotices(snapshot, memberId);
    expect(document.title).toBe(`Notice (1) - ${firstStack}`);
    stop();
    expect(document.title).toBe(BASE_TITLE);
  });
});
