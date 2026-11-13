import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sanitizeNotificationPreferences } from '../../../core/domain/notificationPreferences';
import type { AppNotice } from '../../../types/models';
import { notificationPreferencesStore } from '../notificationPreferencesStore';
import { NotificationService } from '../notificationService';
import { notificationSoundService } from '../notificationSoundService';

describe('Notification preferences and sound', () => {
  beforeEach(() => window.localStorage.clear());

  it('keeps settings per member and repairs invalid stored values', () => {
    notificationPreferencesStore.update('room', 'member-a', {
      soundEnabled: false,
      soundId: 'notify-8',
      soundVolume: 0.8,
      tabBadgeEnabled: false,
    });
    expect(notificationPreferencesStore.get('room', 'member-a')).toMatchObject({
      soundEnabled: false, soundId: 'notify-8', soundVolume: 0.8, tabBadgeEnabled: false,
    });
    expect(notificationPreferencesStore.get('room', 'member-b').soundId).toBe('notify-1');
    expect(sanitizeNotificationPreferences({ soundId: 'missing', soundVolume: 5 }))
      .toMatchObject({ soundId: 'notify-1', soundVolume: 1 });
  });

  it('plays once for a new batch and stays silent for duplicate, catch-up, or disabled sound', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    try {
      const service = new NotificationService();
      const makeNotice = (id: string): AppNotice => ({
        id, workspaceId: 'room', workspaceCode: 'ROOM', targetMemberId: 'member-a',
        actorName: 'Bạn B', kind: 'task_assigned', taskId: 'task', taskTitle: 'Việc mới',
        createdAt: '2026-11-13T00:00:00.000Z', read: false,
      });
      notificationPreferencesStore.update('room', 'member-a', { soundId: 'notify-3' });
      service.dispatchNotices([makeNotice('a')]);
      service.dispatchNotices([makeNotice('a')]);
      service.dispatchNotices([makeNotice('b'), makeNotice('c')]);
      service.dispatchNotices([makeNotice('catch-up')], { deviceAlert: false });
      notificationPreferencesStore.update('room', 'member-a', { soundEnabled: false });
      service.dispatchNotices([makeNotice('d')]);
      expect(play).toHaveBeenCalledTimes(2);
    } finally {
      play.mockRestore();
      pause.mockRestore();
    }
  });

  it('stops a playing sound on mute and applies volume changes immediately', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    try {
      notificationPreferencesStore.update('room', 'member-a', { soundEnabled: true, soundVolume: 0.5 });
      expect(await notificationSoundService.preview('room', 'member-a')).toBe(true);
      const audio = play.mock.instances.at(-1) as HTMLAudioElement;
      notificationPreferencesStore.update('room', 'member-a', { soundVolume: 0.2 });
      expect(audio.volume).toBe(0.2);
      notificationPreferencesStore.update('room', 'member-a', { soundEnabled: false });
      expect(pause.mock.instances).toContain(audio);
      expect(await notificationSoundService.preview('room', 'member-a')).toBe(false);
      expect(play).toHaveBeenCalledTimes(1);
    } finally {
      notificationSoundService.stop();
      play.mockRestore();
      pause.mockRestore();
    }
  });
});
