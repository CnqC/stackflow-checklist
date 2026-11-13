import type { NotificationSoundId } from '../../core/domain/notificationPreferences';
import { notificationPreferencesStore } from './notificationPreferencesStore';

class NotificationSoundService {
  private currentAudio: HTMLAudioElement | null = null;
  private currentScope: { workspaceId: string; memberId: string } | null = null;

  constructor() {
    notificationPreferencesStore.subscribe(() => this.syncCurrentAudio());
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') this.stop();
      });
    }
  }

  private syncCurrentAudio(): void {
    if (!this.currentAudio || !this.currentScope) return;
    const { workspaceId, memberId } = this.currentScope;
    const preferences = notificationPreferencesStore.get(workspaceId, memberId);
    if (!preferences.soundEnabled || preferences.soundVolume === 0) {
      this.stop();
      return;
    }
    this.currentAudio.volume = preferences.soundVolume;
  }

  stop(): void {
    this.currentAudio?.pause();
    this.currentAudio = null;
    this.currentScope = null;
  }

  private async play(workspaceId: string, memberId: string, soundId: NotificationSoundId, volume: number): Promise<boolean> {
    if (typeof window === 'undefined' || typeof window.Audio !== 'function') return false;
    let audio: HTMLAudioElement | null = null;
    try {
      this.stop();
      audio = new window.Audio(`${import.meta.env.BASE_URL}sounds/${soundId}.wav`);
      audio.volume = volume;
      this.currentAudio = audio;
      this.currentScope = { workspaceId, memberId };
      await audio.play();
      return true;
    } catch {
      // Browsers can block audio until the user has interacted with this page.
      if (this.currentAudio === audio) this.stop();
      return false;
    }
  }

  async preview(workspaceId: string, memberId: string, soundId?: NotificationSoundId): Promise<boolean> {
    const preferences = notificationPreferencesStore.get(workspaceId, memberId);
    if (!preferences.soundEnabled || preferences.soundVolume === 0) return false;
    return this.play(workspaceId, memberId, soundId ?? preferences.soundId, preferences.soundVolume);
  }

  playForNotice(workspaceId: string, memberId: string): void {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
    const preferences = notificationPreferencesStore.get(workspaceId, memberId);
    if (!preferences.soundEnabled || preferences.soundVolume === 0) return;
    void this.play(workspaceId, memberId, preferences.soundId, preferences.soundVolume);
  }
}

export const notificationSoundService = new NotificationSoundService();
