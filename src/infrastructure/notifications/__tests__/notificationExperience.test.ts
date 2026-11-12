import { beforeEach, describe, expect, it, vi } from 'vitest';
import { captureAssignmentCheckpoint, detectNewAssignmentNotices } from '../../../core/domain/notificationDiffEngine';
import { createSeedWorkspaceSnapshot } from '../../../core/domain/stackDomain';
import type { AppNotice, WorkspaceSnapshot } from '../../../types/models';
import { StackFlowSyncService } from '../../../services/syncService';
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
      items: before.items.map((item) => item.id === target.id
        ? { ...item, assigneeIds: [...item.assigneeIds, minh.id], updatedByName: quang.name,
            updatedAt: '2026-11-12T10:00:00.000Z' }
        : item),
    };
    const restartedSession = new NotificationService();
    const checkpoint = restartedSession.getAssignmentCheckpoint(before.workspace.id, minh.id);
    expect(checkpoint).toEqual(captureAssignmentCheckpoint(before, minh.id));
    const notices = detectNewAssignmentNotices(checkpoint, after, minh.id);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ taskId: target.id, targetMemberId: minh.id });

    restartedSession.saveAssignmentCheckpoint(after, minh.id);
    expect(detectNewAssignmentNotices(
      restartedSession.getAssignmentCheckpoint(before.workspace.id, minh.id), after, minh.id,
    )).toEqual([]);
    expect(detectNewAssignmentNotices(null, after, minh.id)).toEqual([]);
  });

  it('restores a missed assignment when the member signs back into a local workspace', async () => {
    const firstSession = new StackFlowSyncService();
    const { snapshot, creator } = await firstSession.createWorkspace({
      code: 'NOTICE-REOPEN',
      name: 'Kiểm tra thông báo',
      pinCode: '4321',
      creatorName: 'Quang',
    });
    const minh = await firstSession.addMember('Minh');
    firstSession.setActiveMember(minh);
    firstSession.teardownConnections();

    const colleagueSession = new StackFlowSyncService();
    await colleagueSession.joinWorkspaceByPin(snapshot.workspace.code, snapshot.workspace.pinCode);
    colleagueSession.setActiveMember(creator);
    await colleagueSession.updateItem(snapshot.items[0]!.id, {
      assigneeIds: [creator.id, minh.id],
    }, creator);
    colleagueSession.teardownConnections();

    const reopenedSession = new StackFlowSyncService();
    await reopenedSession.joinWorkspaceByPin(snapshot.workspace.code, snapshot.workspace.pinCode);
    reopenedSession.setActiveMember(minh);
    expect(notificationService.getUnreadCount(snapshot.workspace.id, minh.id)).toBe(1);
    reopenedSession.teardownConnections();
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
