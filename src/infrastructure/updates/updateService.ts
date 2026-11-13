import { Capacitor } from '@capacitor/core';
import { isNewerRelease, parseAndroidRelease, parseWebRelease, type ReleaseInfo } from '../../core/domain/appUpdate';

const ANDROID_RELEASE_URL = 'https://api.github.com/repos/CnqC/stackflow-checklist/releases/latest';
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

export type UpdateStatus = 'idle' | 'checking' | 'current' | 'available' | 'error';
export interface UpdateState {
  status: UpdateStatus;
  latest?: ReleaseInfo;
  checkedAt?: number;
  error?: string;
}

class UpdateService {
  private state: UpdateState = { status: 'idle' };
  private listeners = new Set<() => void>();
  private pending: Promise<UpdateState> | null = null;
  private started = false;

  getPlatform(): 'android' | 'web' {
    return Capacitor.getPlatform() === 'android' ? 'android' : 'web';
  }

  getCurrentVersion(): string { return __APP_VERSION__; }
  getState(): UpdateState { return this.state; }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    void this.check();
    window.addEventListener('focus', () => void this.check());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.check();
    });
    window.setInterval(() => void this.check(), CHECK_INTERVAL_MS);
  }

  check(force = false): Promise<UpdateState> {
    if (this.pending) return this.pending;
    if (!force && this.state.checkedAt && Date.now() - this.state.checkedAt < CHECK_INTERVAL_MS) {
      return Promise.resolve(this.state);
    }
    this.setState({ ...this.state, status: 'checking', error: undefined });
    const request = this.fetchRelease().then((latest) => {
      const available = isNewerRelease(latest, __APP_VERSION__, this.getPlatform() === 'web' ? __APP_BUILD_ID__ : undefined);
      this.setState({ status: available ? 'available' : 'current', latest, checkedAt: Date.now() });
      return this.state;
    }).catch(() => {
      this.setState({ ...this.state, status: 'error', checkedAt: Date.now(), error: 'Không thể kiểm tra lúc này. Hãy kiểm tra mạng rồi thử lại.' });
      return this.state;
    }).finally(() => { this.pending = null; });
    this.pending = request;
    return request;
  }

  async applyWebUpdate(): Promise<boolean> {
    if (this.getPlatform() !== 'web') return false;
    if (!('serviceWorker' in navigator)) {
      window.location.reload();
      return true;
    }
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration || !navigator.serviceWorker.controller) {
      window.location.reload();
      return true;
    }
    return new Promise<boolean>((resolve) => {
      const onControllerChange = () => {
        window.clearTimeout(timeout);
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
        resolve(true);
        window.location.reload();
      };
      const timeout = window.setTimeout(() => {
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
        resolve(false);
      }, 15_000);
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
      void registration.update().then(() => {
        registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
      }).catch(() => {
        window.clearTimeout(timeout);
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
        resolve(false);
      });
    });
  }

  private async fetchRelease(): Promise<ReleaseInfo> {
    const android = this.getPlatform() === 'android';
    const url = android ? ANDROID_RELEASE_URL : new URL(`${import.meta.env.BASE_URL}version.json`, window.location.href).href;
    const response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Update check returned ${response.status}`);
    const release = android ? parseAndroidRelease(await response.json()) : parseWebRelease(await response.json());
    if (!release) throw new Error('Invalid release data');
    return release;
  }

  private setState(state: UpdateState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}

export const updateService = new UpdateService();
