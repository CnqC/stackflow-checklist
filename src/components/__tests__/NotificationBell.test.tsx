import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeedWorkspaceSnapshot } from '../../core/domain/stackDomain';
import { notificationService } from '../../infrastructure/notifications/notificationService';
import type { AppNotice } from '../../types/models';
import { NotificationBell } from '../NotificationBell';

describe('NotificationBell inbox', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it('separates unread and read work, shows its stack, and opens the chosen task', () => {
    const snapshot = createSeedWorkspaceSnapshot();
    const member = snapshot.members[1]!;
    const task = snapshot.items[0]!;
    const stack = snapshot.stacks.find((entry) => entry.id === task.stackId)!;
    const notice: AppNotice = {
      id: 'inbox-new',
      workspaceId: snapshot.workspace.id,
      workspaceCode: snapshot.workspace.code,
      targetMemberId: member.id,
      actorName: 'Quang',
      kind: 'task_assigned',
      taskId: task.id,
      taskTitle: task.title,
      createdAt: '2026-11-12T10:00:00.000Z',
      read: false,
    };
    notificationService.dispatchNotices([notice, { ...notice, id: 'inbox-read', read: true }]);
    const openTask = vi.fn();

    render(<NotificationBell
      snapshot={snapshot}
      syncMode="local"
      memberId={member.id}
      onOpenTask={openTask}
    />);
    fireEvent.click(screen.getByRole('button', { name: /Thông báo việc mới \(1 chưa đọc\)/ }));
    expect(screen.getByText('Chưa đọc (1)')).toBeTruthy();
    expect(screen.getByText('Đã đọc (1)')).toBeTruthy();
    expect(screen.getAllByText(stack.title)).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /Xóa đã đọc/ }));
    expect(notificationService.getNotices(snapshot.workspace.id, member.id).map((entry) => entry.id))
      .toEqual(['inbox-new']);
    fireEvent.click(screen.getByText(task.title).closest('button')!);
    expect(openTask).toHaveBeenCalledWith(task.id);
    expect(notificationService.getUnreadCount(snapshot.workspace.id, member.id)).toBe(0);
  });
});
