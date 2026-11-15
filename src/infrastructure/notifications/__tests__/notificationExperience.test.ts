import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureAssignmentCheckpoint, detectNewAssignmentNotices } from '../../../core/domain/notificationDiffEngine';
import { createSeedWorkspaceSnapshot } from '../../../core/domain/stackDomain';
import type { AppNotice, WorkspaceSnapshot } from '../../../types/models';
import { NotificationService, notificationService } from '../notificationService';

describe('Notification experience', () => {
  beforeEach(() => window.localStorage.clear());

  it('recovers assignments made while the app was closed using a compact per-member checkpoint', () => {
    const before = createSeedWorkspaceSnapshot();
    const quang = before.members[0]!;
    const minh = before.members[1]!;
    const target = before.items.find((item) => !item.completed && !item.assigneeIds.includes(minh.id))!;
    const firstSession = new NotificationService();
    firstSession.saveAssignmentCheckpoint(before, minh.id);

    const after: WorkspaceSnapshot = {
      ...before,
      items: before.items.map((item) =>
        item.id === target.id
          ? { ...item, assigneeIds: [...item.assigneeIds, minh.id], updatedByName: quang.name, updatedAt: '2026-11-12T10:00:00.000Z' }
          : item,
      ),
    };
    const restartedSession = new NotificationService();
    const checkpoint = restartedSession.getAssignmentCheckpoint(before.workspace.id, minh.id);
    expect(checkpoint).toEqual(captureAssignmentCheckpoint(before, minh.id));
    const notices = detectNewAssignmentNotices(checkpoint, after, minh.id);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ taskId: target.id, targetMemberId: minh.id });
    expect(notices[0]!.id.endsWith('2026-11-12T10:00:00.000Z')).toBe(true);

    const dbTimestamp = {
      ...after,
      items: after.items.map((item) =>
        item.id === target.id ? { ...item, updatedAt: '2026-11-12T10:00:00+00:00' } : item,
      ),
    };
    expect(detectNewAssignmentNotices(checkpoint, dbTimestamp, minh.id)[0]!.id).toBe(notices[0]!.id);

    restartedSession.saveAssignmentCheckpoint(after, minh.id);
    expect(detectNewAssignmentNotices(restartedSession.getAssignmentCheckpoint(before.workspace.id, minh.id), after, minh.id)).toEqual([]);
    expect(detectNewAssignmentNotices(null, after, minh.id)).toEqual([]);
  });

  it('restores a missed assignment into the inbox when reopening a project snapshot', () => {
    const before = createSeedWorkspaceSnapshot('ACC-PROJECT', 'Dự Án Google');
    const quang = before.members[0]!;
    const minh = before.members[1]!;
    const target = before.items.find((item) => !item.completed && !item.assigneeIds.includes(minh.id))!;
    notificationService.saveAssignmentCheckpoint(before, minh.id);

    const updated: WorkspaceSnapshot = {
      ...before,
      items: before.items.map((item) =>
        item.id === target.id
          ? { ...item, assigneeIds: [quang.id, minh.id], assigneeId: quang.id, updatedByName: quang.name, updatedAt: '2026-11-16T08:00:00.000Z' }
          : item,
      ),
    };

    const checkpoint = notificationService.getAssignmentCheckpoint(before.workspace.id, minh.id);
    const missedNotices = detectNewAssignmentNotices(checkpoint, updated, minh.id);
    notificationService.dispatchNotices(missedNotices, { deviceAlert: false, snapshot: updated });
    notificationService.saveAssignmentCheckpoint(updated, minh.id);

    expect(notificationService.getUnreadCount(before.workspace.id, minh.id)).toBe(1);
  });

  it('keeps unread notices when read history is cleared and opens browser popups', async () => {
    const before = createSeedWorkspaceSnapshot();
    const memberId = before.members[1]!.id;
    const makeNotice = (id: string): AppNotice => ({
      id,
      workspaceId: before.workspace.id,
      workspaceCode: before.workspace.code,
      targetMemberId: memberId,
      actorName: 'Quang',
      kind: 'task_assigned',
      taskId: before.items[0]!.id,
      taskTitle: before.items[0]!.title,
      createdAt: '2026-11-12T10:00:00.000Z',
      read: false,
    });
    const originalNotification = window.Notification;
    const originalFocus = window.focus;
    const popups: Array<{ onclick: (() => void) | null }> = [];
    class MockNotification {
      static permission = 'granted';
      onclick: (() => void) | null = null;
      close = vi.fn();
      constructor() { popups.push(this); }
    }
    Object.defineProperty(window, 'Notification', { configurable: true, value: MockNotification });
    window.focus = vi.fn();

    try {
      const service = new NotificationService();
      const opened: string[] = [];
      const stop = service.subscribeNoticeOpens((id) => opened.push(id));
      service.dispatchNotices([makeNotice('first'), makeNotice('second')]);
      await vi.waitFor(() => expect(popups).toHaveLength(2));
      popups[0]!.onclick?.();
      expect(opened).toEqual(['first']);

      service.markNoticeRead('first', before.workspace.id, memberId);
      service.clearReadNotices(before.workspace.id, memberId);
      expect(service.getNotices(before.workspace.id, memberId).map((notice) => notice.id)).toEqual(['second']);

      service.setDeviceAlertsEnabled(before.workspace.id, memberId, false);
      service.dispatchNotices([makeNotice('third')]);
      await Promise.resolve();
      expect(popups).toHaveLength(2);
      expect(service.getUnreadCount(before.workspace.id, memberId)).toBe(2);
      service.setDeviceAlertsEnabled(before.workspace.id, memberId, true);
      service.dispatchNotices([makeNotice('catchup')], { deviceAlert: false });
      expect(popups).toHaveLength(2);
      expect(service.getUnreadCount(before.workspace.id, memberId)).toBe(3);
      stop();
    } finally {
      Object.defineProperty(window, 'Notification', { configurable: true, value: originalNotification });
      window.focus = originalFocus;
    }
  });

  it('sends a PWA notification through the service worker and routes its click message', async () => {
    const snapshot = createSeedWorkspaceSnapshot();
    const memberId = snapshot.members[1]!.id;
    const notice: AppNotice = {
      id: 'pwa-assignment',
      workspaceId: snapshot.workspace.id,
      workspaceCode: snapshot.workspace.code,
      targetMemberId: memberId,
      actorName: 'Quang',
      kind: 'task_assigned',
      taskId: snapshot.items[0]!.id,
      taskTitle: snapshot.items[0]!.title,
      createdAt: '2026-11-12T10:00:00.000Z',
      read: false,
    };
    const originalNotification = window.Notification;
    const serviceWorkerDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
    const showNotification = vi.fn(async () => {});
    let onMessage: ((event: MessageEvent) => void) | undefined;
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: class { static permission = 'granted'; },
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: vi.fn(async () => ({ showNotification })),
        addEventListener: vi.fn((_name: string, callback: (event: MessageEvent) => void) => {
          onMessage = callback;
        }),
      },
    });

    try {
      const service = new NotificationService();
      const opened: string[] = [];
      service.subscribeNoticeOpens((id) => opened.push(id));
      service.dispatchNotices([notice], { snapshot });
      await vi.waitFor(() => expect(showNotification).toHaveBeenCalledTimes(1));
      expect(showNotification).toHaveBeenCalledWith(
        'Quang giao việc cho bạn',
        expect.objectContaining({
          body: expect.stringContaining(snapshot.stacks[0]!.title),
          data: expect.objectContaining({ noticeId: notice.id }),
        }),
      );
      onMessage?.({ data: { type: 'stackflow:notice-open', noticeId: notice.id } } as MessageEvent);
      expect(opened).toEqual([notice.id]);
    } finally {
      Object.defineProperty(window, 'Notification', { configurable: true, value: originalNotification });
      if (serviceWorkerDescriptor) {
        Object.defineProperty(navigator, 'serviceWorker', serviceWorkerDescriptor);
      } else {
        Reflect.deleteProperty(navigator, 'serviceWorker');
      }
    }
  });
});
