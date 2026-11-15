import { beforeEach, describe, expect, it } from 'vitest';
import { detectNewAssignmentNotices } from '../domain/notificationDiffEngine';
import { createSeedWorkspaceSnapshot } from '../domain/stackDomain';
import { DomainEventBus, domainEventBus } from '../events/domainEventBus';
import {
  formatNoticeMessage,
  hashNoticeIdToInt32,
  NotificationService,
} from '../../infrastructure/notifications/notificationService';
import type { ChecklistItem, Member, WorkspaceSnapshot } from '../../types/models';

function buildFixtureSnapshot(): {
  snapshot: WorkspaceSnapshot;
  quang: Member;
  minh: Member;
  linh: Member;
} {
  const base = createSeedWorkspaceSnapshot('QA-ROOM', 'Dự Án Kiểm Định QA', '2468');
  return {
    snapshot: base,
    quang: base.members[0]!,
    minh: base.members[1]!,
    linh: base.members[2]!,
  };
}

describe('Assignment Notice Diff Engine & Cross-Platform Notification Dispatch', () => {
  beforeEach(() => {
    window.localStorage.clear();
    domainEventBus.clear();
  });

  it('returns [] on initial load (prev === null) or when switching workspaces', () => {
    const { snapshot, minh } = buildFixtureSnapshot();
    expect(detectNewAssignmentNotices(null, snapshot, minh.id)).toEqual([]);

    const otherWorkspace = createSeedWorkspaceSnapshot('OTHER-ROOM', 'Dự Án Khác', '9999');
    const switched: WorkspaceSnapshot = {
      ...otherWorkspace,
      workspace: { ...otherWorkspace.workspace, id: 'different-ws-id' },
    };
    expect(detectNewAssignmentNotices(snapshot, switched, minh.id)).toEqual([]);
  });

  it('emits task_assigned for newly assigned co-assignees and formats Vietnamese copy', () => {
    const { snapshot: prev, quang, minh, linh } = buildFixtureSnapshot();
    const stackId = prev.stacks[0]!.id;
    const t1 = '2026-11-11T09:00:00.000Z';

    const newTask: ChecklistItem = {
      id: 'task-new-collab', workspaceId: prev.workspace.id, stackId,
      title: 'Chuẩn bị slide demo cuối tuần', notes: '', status: 'todo', priority: 'high',
      completed: false, assigneeId: quang.id, assigneeIds: [quang.id, minh.id],
      dueDate: null, position: 99, subtasks: [], links: [],
      completedById: null, completedByName: null, completedAt: null,
      updatedByName: quang.name, createdAt: t1, updatedAt: t1,
    };

    const existingTarget = prev.items.find((it) => !it.completed && !it.assigneeIds.includes(minh.id))!;
    const updatedExisting: ChecklistItem = {
      ...existingTarget,
      assigneeIds: [...existingTarget.assigneeIds, minh.id],
      assigneeId: existingTarget.assigneeIds[0] ?? minh.id,
      updatedByName: quang.name,
      updatedAt: t1,
    };

    const next: WorkspaceSnapshot = {
      ...prev,
      items: [...prev.items.map((it) => (it.id === existingTarget.id ? updatedExisting : it)), newTask],
    };

    const noticesForMinh = detectNewAssignmentNotices(prev, next, minh.id);
    expect(noticesForMinh).toHaveLength(2);
    expect(noticesForMinh.every((n) => n.kind === 'task_assigned')).toBe(true);
    expect(noticesForMinh[0]!.actorName).toBe('Quang');
    expect(noticesForMinh[0]!.read).toBe(false);

    const newNotice = noticesForMinh.find((n) => n.taskId === 'task-new-collab')!;
    expect(formatNoticeMessage(newNotice)).toEqual({
      title: 'Quang giao việc cho bạn',
      body: 'Chuẩn bị slide demo cuối tuần',
    });
    expect(formatNoticeMessage(newNotice, 'Stack 2')).toEqual({
      title: 'Quang giao việc cho bạn',
      body: 'Chuẩn bị slide demo cuối tuần · Stack 2',
    });
    expect(detectNewAssignmentNotices(prev, next, linh.id)).toEqual([]);
  });

  it('emits subtask_assigned and suppresses self-assigned or unrelated edits', () => {
    const { snapshot: prev, quang, minh } = buildFixtureSnapshot();
    const targetTask = prev.items.find((it) => !it.completed && !it.assigneeIds.includes(minh.id))!;
    const alreadyMinhTask = prev.items.find((it) => !it.completed && it.assigneeIds.includes(minh.id))!;
    const t2 = '2026-11-11T09:15:00.000Z';

    const next: WorkspaceSnapshot = {
      ...prev,
      items: prev.items.map((it) =>
        it.id === targetTask.id
          ? {
              ...it,
              updatedByName: quang.name,
              updatedAt: t2,
              subtasks: [...it.subtasks, { id: 'sub-api-check', title: 'Kiểm tra kết nối API', completed: false, assigneeId: minh.id, completedByName: null }],
            }
          : it,
      ),
    };

    const notices = detectNewAssignmentNotices(prev, next, minh.id);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      kind: 'subtask_assigned', targetMemberId: minh.id, actorName: 'Quang',
      taskId: targetTask.id, subtaskTitle: 'Kiểm tra kết nối API', read: false,
    });
    expect(formatNoticeMessage(notices[0]!)).toEqual({
      title: 'Quang giao phần việc mới',
      body: `Kiểm tra kết nối API · ${targetTask.title}`,
    });

    const selfAssignedSnap: WorkspaceSnapshot = {
      ...prev,
      items: prev.items.map((it) =>
        it.id === targetTask.id
          ? { ...it, assigneeIds: [...it.assigneeIds, minh.id], assigneeId: minh.id, updatedByName: '  minh ', updatedAt: t2 }
          : it,
      ),
    };
    expect(detectNewAssignmentNotices(prev, selfAssignedSnap, minh.id)).toEqual([]);

    const unrelatedEditSnap: WorkspaceSnapshot = {
      ...prev,
      items: prev.items.map((it) =>
        it.id === alreadyMinhTask.id ? { ...it, notes: 'Sửa ghi chú', updatedByName: quang.name, updatedAt: t2 } : it,
      ),
    };
    expect(detectNewAssignmentNotices(prev, unrelatedEditSnap, minh.id)).toEqual([]);
  });

  it('supports typed DomainEventBus and deduplicated Web Notification dispatch', async () => {
    const bus = new DomainEventBus<{ ping: { count: number } }>();
    const received: number[] = [];
    const off = bus.on('ping', (p) => received.push(p.count));
    bus.once('ping', (p) => received.push(p.count * 10));
    expect(bus.listenerCount('ping')).toBe(2);
    bus.emit('ping', { count: 2 });
    bus.emit('ping', { count: 3 });
    expect(received).toEqual([2, 20, 3]);
    off();
    expect(bus.listenerCount('ping')).toBe(0);
    expect(hashNoticeIdToInt32('notice:task:1')).toBeGreaterThan(0);

    const firedPopups: Array<{ title: string; body?: string; tag?: string }> = [];
    const originalNotification = window.Notification;
    class MockNotification {
      static permission: NotificationPermission = 'granted';
      static requestPermission = async (): Promise<NotificationPermission> => 'granted';
      constructor(title: string, options?: NotificationOptions) {
        firedPopups.push({ title, body: options?.body, tag: options?.tag });
      }
    }
    Object.defineProperty(window, 'Notification', { configurable: true, writable: true, value: MockNotification });

    try {
      const localSvc = new NotificationService();
      await expect(localSvc.requestPermission()).resolves.toBe(true);
      const sampleNotice = {
        id: 'notice:task:ws-1:item-1:minh:2026-11-11T10:00:00.000Z',
        workspaceId: 'ws-1', workspaceCode: 'QA-ROOM', targetMemberId: 'minh', actorName: 'Quang',
        kind: 'task_assigned' as const, taskId: 'item-1', taskTitle: 'Hoàn thiện kiểm thử tự động',
        createdAt: '2026-11-11T10:00:00.000Z', read: false,
      };
      expect(localSvc.dispatchNotices([sampleNotice])).toHaveLength(1);
      expect(localSvc.dispatchNotices([sampleNotice])).toHaveLength(0);
      await Promise.resolve();
      expect(firedPopups).toEqual([{ title: 'Quang giao việc cho bạn', body: 'Hoàn thiện kiểm thử tự động', tag: sampleNotice.id }]);
      localSvc.markNoticeRead(sampleNotice.id);
      expect(localSvc.getUnreadCount('ws-1', 'minh')).toBe(0);
      localSvc.clearNotices('ws-1', 'minh');
      expect(localSvc.getNotices('ws-1', 'minh')).toHaveLength(0);
    } finally {
      Object.defineProperty(window, 'Notification', { configurable: true, writable: true, value: originalNotification });
    }
  });
});
