export const NOTIFICATION_SOUNDS = [
  { id: 'notify-1', name: 'Êm dịu' },
  { id: 'notify-2', name: 'Nảy nhẹ' },
  { id: 'notify-3', name: 'Trong trẻo' },
  { id: 'notify-4', name: 'Chuông ngắn' },
  { id: 'notify-5', name: 'Tươi vui' },
  { id: 'notify-6', name: 'Nhịp đôi' },
  { id: 'notify-7', name: 'Gọn nhanh' },
  { id: 'notify-8', name: 'Sáng rõ' },
  { id: 'notify-9', name: 'Dịu trầm' },
  { id: 'notify-10', name: 'Rộn ràng' },
] as const;

export type NotificationSoundId = typeof NOTIFICATION_SOUNDS[number]['id'];

export interface NotificationPreferences {
  soundEnabled: boolean;
  soundId: NotificationSoundId;
  soundVolume: number;
  tabBadgeEnabled: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  soundEnabled: true,
  soundId: 'notify-1',
  soundVolume: 0.45,
  tabBadgeEnabled: true,
};

export function sanitizeNotificationPreferences(raw: unknown): NotificationPreferences {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
  const value = raw as Partial<NotificationPreferences>;
  return {
    soundEnabled: typeof value.soundEnabled === 'boolean'
      ? value.soundEnabled : DEFAULT_NOTIFICATION_PREFERENCES.soundEnabled,
    soundId: NOTIFICATION_SOUNDS.some((sound) => sound.id === value.soundId)
      ? value.soundId as NotificationSoundId : DEFAULT_NOTIFICATION_PREFERENCES.soundId,
    soundVolume: typeof value.soundVolume === 'number' && Number.isFinite(value.soundVolume)
      ? Math.max(0, Math.min(1, value.soundVolume)) : DEFAULT_NOTIFICATION_PREFERENCES.soundVolume,
    tabBadgeEnabled: typeof value.tabBadgeEnabled === 'boolean'
      ? value.tabBadgeEnabled : DEFAULT_NOTIFICATION_PREFERENCES.tabBadgeEnabled,
  };
}
