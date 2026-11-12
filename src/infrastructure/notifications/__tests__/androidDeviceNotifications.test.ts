import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalNotifications } from '@capacitor/local-notifications';
import { createSeedWorkspaceSnapshot } from '../../../core/domain/stackDomain';
import { NotificationService, hashNoticeIdToInt32, isNativeNotificationPlatform } from '../notificationService';
import type { AppNotice } from '../../../types/models';

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: vi.fn(async () => ({ display: 'granted' })),
    requestPermissions: vi.fn(async () => ({ display: 'granted' })),
    createChannel: vi.fn(async () => {}),
    schedule: vi.fn(async () => ({ notifications: [] })),
  },
}));

describe('Android device notifications', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('requests native permission and schedules each new assignment once on the Android channel', async () => {
    const snapshot = createSeedWorkspaceSnapshot();
    const notice: AppNotice = {
      id: 'android-assignment-1',
      workspaceId: snapshot.workspace.id,
      workspaceCode: snapshot.workspace.code,
      targetMemberId: snapshot.members[1]!.id,
      actorName: snapshot.members[0]!.name,
      kind: 'task_assigned',
      taskId: snapshot.items[0]!.id,
      taskTitle: snapshot.items[0]!.title,
      createdAt: '2026-11-12T10:00:00.000Z',
      read: false,
    };
    const service = new NotificationService();

    expect(isNativeNotificationPlatform()).toBe(true);
    expect(await service.requestPermission()).toBe(true);
    expect(service.dispatchNotices([notice])).toHaveLength(1);
    expect(service.dispatchNotices([notice])).toHaveLength(0);

    await vi.waitFor(() => expect(LocalNotifications.schedule).toHaveBeenCalledTimes(1));
    expect(LocalNotifications.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'stackflow_assignments', importance: 4, vibration: true }),
    );
    expect(LocalNotifications.schedule).toHaveBeenCalledWith({
      notifications: [expect.objectContaining({
        id: hashNoticeIdToInt32(notice.id),
        channelId: 'stackflow_assignments',
        foreground: true,
        extra: expect.objectContaining({ noticeId: notice.id, taskId: notice.taskId }),
      })],
    });
    expect(service.getUnreadCount(snapshot.workspace.id, snapshot.members[1]!.id)).toBe(1);
  });
});
