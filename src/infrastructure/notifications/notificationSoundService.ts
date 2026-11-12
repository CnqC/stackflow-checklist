import type { NotificationSoundId } from '../../core/domain/notificationPreferences';
import { notificationPreferencesStore } from './notificationPreferencesStore';

class NotificationSoundService {
  private currentAudio: HTMLAudioElement | null = null;

  private async play(soundId: NotificationSoundId, volume: number): Promise<boolean> {
    if (typeof window === 'undefined' || typeof window.Audio !== 'function') return false;
    try {
      this.currentAudio?.pause();
      const audio = new window.Audio(`${import.meta.env.BASE_URL}sounds/${soundId}.wav`);
      audio.volume = volume;
      this.currentAudio = audio;
      await audio.play();
      return true;
    } catch {
      // Browsers can block audio until the user has interacted with this page.
      return false;
    }
  }

  async preview(workspaceId: string, memberId: string, soundId?: NotificationSoundId): Promise<boolean> {
    const preferences = notificationPreferencesStore.get(workspaceId, memberId);
    return this.play(soundId ?? preferences.soundId, preferences.soundVolume);
  }

  playForNotice(workspaceId: string, memberId: string): void {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
    const preferences = notificationPreferencesStore.get(workspaceId, memberId);
    if (!preferences.soundEnabled || preferences.soundVolume === 0) return;
    void this.play(preferences.soundId, preferences.soundVolume);
  }
}

export const notificationSoundService = new NotificationSoundService();
