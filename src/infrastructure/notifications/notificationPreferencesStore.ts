import {
  sanitizeNotificationPreferences,
  type NotificationPreferences,
} from '../../core/domain/notificationPreferences';

const STORAGE_KEY = 'stackflow_notification_preferences_v1';
type Listener = () => void;

class NotificationPreferencesStore {
  private listeners = new Set<Listener>();
  private memoryFallback: Record<string, unknown> = {};
  private storageUnavailable = false;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === STORAGE_KEY) this.emit();
      });
    }
  }

  private scope(workspaceId: string, memberId: string): string {
    return `${workspaceId.trim()}::${memberId.trim()}`;
  }

  private readAll(): Record<string, unknown> {
    if (typeof window === 'undefined') return this.memoryFallback;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return this.storageUnavailable ? this.memoryFallback : {};
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown> : this.memoryFallback;
    } catch {
      return this.memoryFallback;
    }
  }

  get(workspaceId: string, memberId: string): NotificationPreferences {
    return sanitizeNotificationPreferences(this.readAll()[this.scope(workspaceId, memberId)]);
  }

  update(workspaceId: string, memberId: string, patch: Partial<NotificationPreferences>): NotificationPreferences {
    const next = sanitizeNotificationPreferences({ ...this.get(workspaceId, memberId), ...patch });
    const all = this.readAll();
    all[this.scope(workspaceId, memberId)] = next;
    this.memoryFallback = all;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
        this.storageUnavailable = false;
      } catch {
        this.storageUnavailable = true;
        // Keep preferences for this session if browser storage is unavailable.
      }
    }
    this.emit();
    return next;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const notificationPreferencesStore = new NotificationPreferencesStore();
