import type { NotificationSoundId } from '../../core/domain/notificationPreferences';
import { notificationPreferencesStore } from './notificationPreferencesStore';

type WebAudioWindow = Window & {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
};

function resolveSoundUrl(soundId: NotificationSoundId): string {
  const base = import.meta.env.BASE_URL || './';
  if (typeof window !== 'undefined' && window.location?.href?.startsWith('http')) {
    try {
      const normalizedBase = base.endsWith('/') ? base : `${base}/`;
      const baseHref = new URL(normalizedBase, window.location.href).href;
      return new URL(`sounds/${soundId}.wav`, baseHref).href;
    } catch {
      /* Fall back to relative path */
    }
  }
  return `${base}sounds/${soundId}.wav`;
}

class NotificationSoundService {
  private currentAudio: HTMLAudioElement | null = null;
  private currentScope: { workspaceId: string; memberId: string } | null = null;
  private audioCtx: AudioContext | null = null;
  private unlockAttached = false;

  constructor() {
    notificationPreferencesStore.subscribe(() => this.syncCurrentAudio());
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') this.stop();
      });
    }
    this.attachAutoplayUnlock();
  }

  private attachAutoplayUnlock(): void {
    if (this.unlockAttached || typeof window === 'undefined') return;
    this.unlockAttached = true;
    const unlock = () => {
      const Ctx = (window as WebAudioWindow).AudioContext ?? (window as WebAudioWindow).webkitAudioContext;
      if (!Ctx) return;
      try {
        if (!this.audioCtx) this.audioCtx = new Ctx();
        if (this.audioCtx.state === 'suspended') {
          void this.audioCtx.resume().catch(() => undefined);
        }
      } catch {
        /* Ignore restricted audio contexts */
      }
    };
    window.addEventListener('pointerdown', unlock, { passive: true, once: true });
    window.addEventListener('keydown', unlock, { passive: true, once: true });
  }

  private playSynthFallback(volume: number): boolean {
    if (typeof window === 'undefined') return false;
    const Ctx = (window as WebAudioWindow).AudioContext ?? (window as WebAudioWindow).webkitAudioContext;
    if (!Ctx) return false;
    try {
      if (!this.audioCtx) this.audioCtx = new Ctx();
      if (this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume().catch(() => undefined);
      }
      const ctx = this.audioCtx;
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(Math.max(0.02, Math.min(0.5, volume * 0.45)), now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      gain.connect(ctx.destination);

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(880, now + 0.09);
      osc.connect(gain);
      osc.start(now);
      osc.stop(now + 0.28);
      return true;
    } catch {
      return false;
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

  private async play(
    workspaceId: string,
    memberId: string,
    soundId: NotificationSoundId,
    volume: number,
  ): Promise<boolean> {
    if (typeof window === 'undefined' || typeof window.Audio !== 'function') return false;
    let audio: HTMLAudioElement | null = null;
    try {
      this.stop();
      audio = new window.Audio(resolveSoundUrl(soundId));
      audio.volume = volume;
      this.currentAudio = audio;
      this.currentScope = { workspaceId, memberId };
      await audio.play();
      return true;
    } catch {
      if (this.currentAudio === audio) this.stop();
      return this.playSynthFallback(volume);
    }
  }

  async preview(workspaceId: string, memberId: string, soundId?: NotificationSoundId): Promise<boolean> {
    const preferences = notificationPreferencesStore.get(workspaceId, memberId);
    if (!preferences.soundEnabled || preferences.soundVolume === 0) return false;
    return this.play(workspaceId, memberId, soundId ?? preferences.soundId, preferences.soundVolume);
  }

  playForNotice(workspaceId: string, memberId: string): void {
    if (typeof document !== 'undefined' && document.visibilityState && document.visibilityState !== 'visible') {
      return;
    }
    const preferences = notificationPreferencesStore.get(workspaceId, memberId);
    if (!preferences.soundEnabled || preferences.soundVolume === 0) return;
    void this.play(workspaceId, memberId, preferences.soundId, preferences.soundVolume);
  }
}

export const notificationSoundService = new NotificationSoundService();
