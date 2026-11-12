import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import {
  captureAssignmentCheckpoint,
  type AssignmentCheckpoint,
} from '../../core/domain/notificationDiffEngine';
import { resolveNoticeStackTitle } from '../../core/domain/noticePresentation';
import { domainEventBus } from '../../core/events/domainEventBus';
import type { AppNotice, WorkspaceSnapshot } from '../../types/models';

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';
export type NoticeListener = (notices: AppNotice[]) => void;
export type NoticeOpenListener = (noticeId: string) => void;

const NOTICE_STORE_KEY = 'stackflow_inapp_notices_v2';
const NATIVE_PERMISSION_CACHE_KEY = 'stackflow_native_notif_perm_v1';
const ASSIGNMENT_CHECKPOINT_KEY = 'stackflow_assignment_checkpoints_v1';
const DEVICE_ALERTS_PREF_KEY = 'stackflow_device_alerts_enabled_v1';
// Android channels are immutable after creation, so the new default-importance channel needs a new ID.
const ANDROID_CHANNEL_ID = 'stackflow_assignments_v2';
const MAX_NOTICES_PER_SCOPE = 100;
const MAX_DISPATCHED_IDS = 500;

interface PersistedNoticeStore {
  noticesByScope: Record<string, AppNotice[]>;
  dispatchedNoticeIds: string[];
}

function makeScopeKey(workspaceId: string, memberId: string): string {
  return `${workspaceId.trim()}::${memberId.trim()}`;
}

export function isNativeNotificationPlatform(): boolean {
  return typeof window !== 'undefined' && Capacitor.isNativePlatform();
}

/**
 * Deterministic positive 31-bit integer hash for Capacitor Android LocalNotifications `id`.
 */
export function hashNoticeIdToInt32(noticeId: string): number {
  let hash = 2166136261;
  for (let i = 0; i < noticeId.length; i += 1) {
    hash ^= noticeId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const positive = hash & 0x7fffffff;
  return positive === 0 ? 1 : positive;
}

/**
 * Formats friendly, zero-jargon Vietnamese OS/In-App notification copy.
 */
export function formatNoticeMessage(notice: AppNotice, stackTitle?: string | null): { title: string; body: string } {
  const context = stackTitle ? ` · ${stackTitle}` : '';
  if (notice.kind === 'subtask_assigned') {
    const subLabel = notice.subtaskTitle?.trim() || notice.taskTitle;
    return {
      title: `${notice.actorName} giao phần việc mới`,
      body: `${subLabel} · ${notice.taskTitle}${context}`,
    };
  }
  return {
    title: `${notice.actorName} giao việc cho bạn`,
    body: `${notice.taskTitle}${context}`,
  };
}

function mapCapacitorPermission(display: string | undefined): 'granted' | 'denied' | 'default' {
  if (display === 'granted') return 'granted';
  if (display === 'denied') return 'denied';
  return 'default';
}

export class NotificationService {
  private listeners = new Set<NoticeListener>();
  private openListeners = new Set<NoticeOpenListener>();
  private memoryFallbackStore: PersistedNoticeStore = {
    noticesByScope: {},
    dispatchedNoticeIds: [],
  };
  private androidChannelReady = false;
  private syncingNativePerm = false;
  private storageListenerAttached = false;
  private notificationOpenListenersAttached = false;

  constructor() {
    this.attachCrossTabStorageListener();
  }

  private attachCrossTabStorageListener(): void {
    if (this.storageListenerAttached || typeof window === 'undefined') return;
    if (typeof window.addEventListener !== 'function') return;
    this.storageListenerAttached = true;
    window.addEventListener('storage', (event: StorageEvent) => {
      if (event.key === NOTICE_STORE_KEY || event.key === NATIVE_PERMISSION_CACHE_KEY ||
          event.key === DEVICE_ALERTS_PREF_KEY) {
        this.notifySubscribers();
      }
    });
  }

  private readStore(): PersistedNoticeStore {
    if (typeof window === 'undefined' || !window.localStorage) {
      return this.memoryFallbackStore;
    }
    try {
      const raw = window.localStorage.getItem(NOTICE_STORE_KEY);
      if (!raw) {
        return { noticesByScope: {}, dispatchedNoticeIds: [] };
      }
      const parsed = JSON.parse(raw) as Partial<PersistedNoticeStore>;
      const noticesByScope =
        parsed && typeof parsed.noticesByScope === 'object' && parsed.noticesByScope !== null
          ? parsed.noticesByScope
          : {};
      const dispatchedNoticeIds = Array.isArray(parsed?.dispatchedNoticeIds)
        ? parsed.dispatchedNoticeIds.filter((id): id is string => typeof id === 'string')
        : [];
      return { noticesByScope, dispatchedNoticeIds };
    } catch {
      return { noticesByScope: {}, dispatchedNoticeIds: [] };
    }
  }

  private writeStore(store: PersistedNoticeStore): void {
    this.memoryFallbackStore = store;
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(NOTICE_STORE_KEY, JSON.stringify(store));
    } catch {
      // Ignore quota / private browsing errors
    }
  }

  private readObjectStore<T>(key: string): Record<string, T> {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(key);
      const parsed: unknown = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, T>
        : {};
    } catch {
      return {};
    }
  }

  private readNativePermissionCache(): 'granted' | 'denied' | 'default' {
    if (typeof window === 'undefined' || !window.localStorage) return 'default';
    try {
      const cached = window.localStorage.getItem(NATIVE_PERMISSION_CACHE_KEY);
      if (cached === 'granted' || cached === 'denied' || cached === 'default') {
        return cached;
      }
    } catch {
      // Ignore storage error
    }
    return 'default';
  }

  private writeNativePermissionCache(state: 'granted' | 'denied' | 'default'): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(NATIVE_PERMISSION_CACHE_KEY, state);
    } catch {
      // Ignore storage error
    }
  }

  private async syncNativePermissionInBackground(): Promise<void> {
    if (this.syncingNativePerm || !isNativeNotificationPlatform()) return;
    this.syncingNativePerm = true;
    try {
      const status = await LocalNotifications.checkPermissions();
      const mapped = mapCapacitorPermission(status?.display);
      const prev = this.readNativePermissionCache();
      if (mapped !== prev) {
        this.writeNativePermissionCache(mapped);
        this.notifySubscribers();
      }
    } catch {
      // Safe fallback in test/non-native environments
    } finally {
      this.syncingNativePerm = false;
    }
  }

  private collectAllNotices(store: PersistedNoticeStore): AppNotice[] {
    const all: AppNotice[] = [];
    for (const bucket of Object.values(store.noticesByScope)) {
      if (Array.isArray(bucket)) {
        for (const item of bucket) {
          all.push({ ...item });
        }
      }
    }
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private notifySubscribers(): void {
    if (this.listeners.size === 0) return;
    const snapshot = this.collectAllNotices(this.readStore());
    for (const listener of [...this.listeners]) {
      listener(snapshot);
    }
  }

  /** Last observed assignments survive an app restart without copying the whole workspace. */
  public getAssignmentCheckpoint(workspaceId: string, memberId: string): AssignmentCheckpoint | null {
    if (typeof window === 'undefined' || !workspaceId || !memberId) return null;
    try {
      const store = this.readObjectStore<unknown>(ASSIGNMENT_CHECKPOINT_KEY);
      const entry = store[makeScopeKey(workspaceId, memberId)] as AssignmentCheckpoint | undefined;
      if (entry?.workspace?.id !== workspaceId || !Array.isArray(entry.items)) return null;
      return {
        workspace: { id: workspaceId },
        items: entry.items.flatMap((item) => {
          if (typeof item?.id !== 'string' || !Array.isArray(item.assigneeIds)) return [];
          return [{
            id: item.id,
            assigneeId: item.assigneeId === memberId ? memberId : null,
            assigneeIds: item.assigneeIds.filter((id) => id === memberId),
            subtasks: Array.isArray(item.subtasks)
              ? item.subtasks.flatMap((subtask) =>
                typeof subtask?.id === 'string'
                  ? [{
                    id: subtask.id,
                    assigneeId: subtask.assigneeId === memberId ? memberId : null,
                  }]
                  : [],
              )
              : [],
          }];
        }),
      };
    } catch {
      return null;
    }
  }

  public saveAssignmentCheckpoint(snapshot: WorkspaceSnapshot, memberId: string): void {
    if (typeof window === 'undefined' || !memberId) return;
    try {
      const store = this.readObjectStore<AssignmentCheckpoint>(ASSIGNMENT_CHECKPOINT_KEY);
      store[makeScopeKey(snapshot.workspace.id, memberId)] = captureAssignmentCheckpoint(snapshot, memberId);
      window.localStorage.setItem(ASSIGNMENT_CHECKPOINT_KEY, JSON.stringify(store));
    } catch {
      // Live notices continue to work if device storage is unavailable.
    }
  }

  public areDeviceAlertsEnabled(workspaceId: string, memberId: string): boolean {
    if (typeof window === 'undefined') return true;
    const store = this.readObjectStore<boolean>(DEVICE_ALERTS_PREF_KEY);
    return store[makeScopeKey(workspaceId, memberId)] !== false;
  }

  public setDeviceAlertsEnabled(workspaceId: string, memberId: string, enabled: boolean): void {
    if (typeof window === 'undefined' || !workspaceId || !memberId) return;
    try {
      const store = this.readObjectStore<boolean>(DEVICE_ALERTS_PREF_KEY);
      store[makeScopeKey(workspaceId, memberId)] = enabled;
      window.localStorage.setItem(DEVICE_ALERTS_PREF_KEY, JSON.stringify(store));
      this.notifySubscribers();
    } catch {
      // The system permission and in-app inbox still work if storage is unavailable.
    }
  }

  /**
   * Returns current OS/Browser notification permission state safely across Android APK, Web/PWA, and jsdom.
   */
  public getPermissionState(): NotificationPermissionState {
    if (isNativeNotificationPlatform()) {
      void this.syncNativePermissionInBackground();
      return this.readNativePermissionCache();
    }

    if (typeof window === 'undefined' || typeof window.Notification === 'undefined') {
      return 'unsupported';
    }

    const perm = window.Notification.permission;
    if (perm === 'granted' || perm === 'denied' || perm === 'default') {
      return perm;
    }
    return 'default';
  }

  /**
   * Requests OS notification permission (Capacitor LocalNotifications on Android/iOS, Web Notification API on Web/PWA).
   * Safe in jsdom / SSR (returns `false` without throwing).
   */
  public async requestPermission(): Promise<boolean> {
    if (isNativeNotificationPlatform()) {
      try {
        const res = await LocalNotifications.requestPermissions();
        const mapped = mapCapacitorPermission(res?.display);
        this.writeNativePermissionCache(mapped);
        if (mapped === 'granted') {
          await this.ensureAndroidChannel();
        }
        this.notifySubscribers();
        return mapped === 'granted';
      } catch {
        return false;
      }
    }

    if (typeof window === 'undefined' || typeof window.Notification === 'undefined') {
      return false;
    }

    if (window.Notification.permission === 'granted') {
      this.notifySubscribers();
      return true;
    }

    if (typeof window.Notification.requestPermission !== 'function') {
      return false;
    }

    try {
      const result = await Promise.resolve(window.Notification.requestPermission());
      this.notifySubscribers();
      return result === 'granted';
    } catch {
      return false;
    }
  }

  /**
   * Reads persisted In-App notices for a specific `(workspaceId, memberId)`, sorted newest first.
   */
  public getNotices(workspaceId: string, memberId: string): AppNotice[] {
    if (!workspaceId || !memberId) return [];
    const store = this.readStore();
    const key = makeScopeKey(workspaceId, memberId);
    const list = store.noticesByScope[key];
    if (!Array.isArray(list)) return [];
    return [...list]
      .map((n) => ({ ...n }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Returns unread In-App notice count for `(workspaceId, memberId)`.
   */
  public getUnreadCount(workspaceId: string, memberId: string): number {
    return this.getNotices(workspaceId, memberId).filter((n) => !n.read).length;
  }

  /**
   * Subscribes to In-App notice center changes (and permission state updates).
   * Returns an unsubscribe function.
   */
  public subscribeNotices(listener: NoticeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Opens a notice from a native notification, a service worker, or a browser popup. */
  public subscribeNoticeOpens(listener: NoticeOpenListener): () => void {
    this.openListeners.add(listener);
    this.attachNotificationOpenListeners();
    return () => this.openListeners.delete(listener);
  }

  private emitNoticeOpen(noticeId: unknown): void {
    if (typeof noticeId !== 'string' || !noticeId) return;
    for (const listener of this.openListeners) listener(noticeId);
  }

  private attachNotificationOpenListeners(): void {
    if (this.notificationOpenListenersAttached) return;
    this.notificationOpenListenersAttached = true;

    if (isNativeNotificationPlatform()) {
      void LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
        this.emitNoticeOpen(action.notification.extra?.noticeId);
      }).catch(() => {
        this.notificationOpenListenersAttached = false;
      });
      return;
    }

    if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
        if (event.data?.type === 'stackflow:notice-open') {
          this.emitNoticeOpen(event.data.noticeId);
        }
      });
    }
  }

  /**
   * Marks all notices for `(workspaceId, memberId)` as read.
   */
  public markAllRead(workspaceId: string, memberId: string): void {
    if (!workspaceId || !memberId) return;
    const store = this.readStore();
    const key = makeScopeKey(workspaceId, memberId);
    const existing = store.noticesByScope[key];
    if (!Array.isArray(existing) || existing.length === 0) return;

    let changed = false;
    const updated = existing.map((n) => {
      if (!n.read) {
        changed = true;
        return { ...n, read: true };
      }
      return n;
    });

    if (!changed) return;
    store.noticesByScope[key] = updated;
    this.writeStore(store);

    domainEventBus.emit('notices:changed', {
      workspaceId,
      memberId,
      notices: this.getNotices(workspaceId, memberId),
    });
    this.notifySubscribers();
  }

  /**
   * Marks a single notice as read by `noticeId` (optionally scoped to `workspaceId` + `memberId`).
   */
  public markNoticeRead(noticeId: string, workspaceId?: string, memberId?: string): void {
    if (!noticeId) return;
    const store = this.readStore();
    const targetScopes =
      workspaceId && memberId
        ? [makeScopeKey(workspaceId, memberId)]
        : Object.keys(store.noticesByScope);

    let changed = false;
    const touchedScopes: Array<{ workspaceId: string; memberId: string }> = [];

    for (const scopeKey of targetScopes) {
      const bucket = store.noticesByScope[scopeKey];
      if (!Array.isArray(bucket)) continue;
      let scopeChanged = false;
      store.noticesByScope[scopeKey] = bucket.map((n) => {
        if (n.id === noticeId && !n.read) {
          changed = true;
          scopeChanged = true;
          return { ...n, read: true };
        }
        return n;
      });
      if (scopeChanged) {
        const [wsId = '', memId = ''] = scopeKey.split('::');
        if (wsId && memId) {
          touchedScopes.push({ workspaceId: wsId, memberId: memId });
        }
      }
    }

    if (!changed) return;
    this.writeStore(store);

    for (const scope of touchedScopes) {
      domainEventBus.emit('notices:changed', {
        workspaceId: scope.workspaceId,
        memberId: scope.memberId,
        notices: this.getNotices(scope.workspaceId, scope.memberId),
      });
    }
    this.notifySubscribers();
  }

  /**
   * Clears all In-App notices for `(workspaceId, memberId)` while keeping `dispatchedNoticeIds`
   * intact so historical notices never re-trigger OS popups upon reload.
   */
  public clearNotices(workspaceId: string, memberId: string): void {
    if (!workspaceId || !memberId) return;
    const store = this.readStore();
    const key = makeScopeKey(workspaceId, memberId);
    if (!store.noticesByScope[key] || store.noticesByScope[key].length === 0) return;

    store.noticesByScope[key] = [];
    this.writeStore(store);

    domainEventBus.emit('notices:changed', {
      workspaceId,
      memberId,
      notices: [],
    });
    this.notifySubscribers();
  }

  /** Clears read history while leaving unread assignments visible. */
  public clearReadNotices(workspaceId: string, memberId: string): void {
    if (!workspaceId || !memberId) return;
    const store = this.readStore();
    const key = makeScopeKey(workspaceId, memberId);
    const existing = store.noticesByScope[key];
    if (!Array.isArray(existing)) return;
    const unread = existing.filter((notice) => !notice.read);
    if (unread.length === existing.length) return;
    store.noticesByScope[key] = unread;
    this.writeStore(store);
    domainEventBus.emit('notices:changed', { workspaceId, memberId, notices: this.getNotices(workspaceId, memberId) });
    this.notifySubscribers();
  }

  /**
   * Stores new deduplicated `AppNotice` items in `localStorage`, notifies UI subscribers synchronously,
   * and dispatches native OS / Web notifications asynchronously for newly seen notice IDs.
   */
  public dispatchNotices(
    notices: AppNotice[],
    options: { deviceAlert?: boolean; snapshot?: WorkspaceSnapshot } = {},
  ): AppNotice[] {
    if (!Array.isArray(notices) || notices.length === 0) {
      return [];
    }

    const store = this.readStore();
    const dispatchedSet = new Set<string>(store.dispatchedNoticeIds);
    const newlyAccepted: AppNotice[] = [];
    const touchedScopes = new Map<string, { workspaceId: string; memberId: string }>();

    for (const rawNotice of notices) {
      if (!rawNotice?.id || !rawNotice.workspaceId || !rawNotice.targetMemberId) {
        continue;
      }
      if (dispatchedSet.has(rawNotice.id)) {
        continue;
      }

      const scopeKey = makeScopeKey(rawNotice.workspaceId, rawNotice.targetMemberId);
      const currentBucket = Array.isArray(store.noticesByScope[scopeKey])
        ? store.noticesByScope[scopeKey]
        : [];

      if (currentBucket.some((existing) => existing.id === rawNotice.id)) {
        dispatchedSet.add(rawNotice.id);
        continue;
      }

      const cleanNotice: AppNotice = {
        ...rawNotice,
        read: Boolean(rawNotice.read),
      };

      store.noticesByScope[scopeKey] = [cleanNotice, ...currentBucket]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, MAX_NOTICES_PER_SCOPE);

      dispatchedSet.add(cleanNotice.id);
      newlyAccepted.push(cleanNotice);
      touchedScopes.set(scopeKey, {
        workspaceId: cleanNotice.workspaceId,
        memberId: cleanNotice.targetMemberId,
      });
    }

    if (newlyAccepted.length === 0) {
      return [];
    }

    const mergedDispatched = Array.from(dispatchedSet);
    store.dispatchedNoticeIds =
      mergedDispatched.length > MAX_DISPATCHED_IDS
        ? mergedDispatched.slice(mergedDispatched.length - MAX_DISPATCHED_IDS)
        : mergedDispatched;

    this.writeStore(store);

    for (const scope of touchedScopes.values()) {
      domainEventBus.emit('notices:changed', {
        workspaceId: scope.workspaceId,
        memberId: scope.memberId,
        notices: this.getNotices(scope.workspaceId, scope.memberId),
      });
    }
    this.notifySubscribers();

    if (options.deviceAlert !== false) {
      for (const notice of newlyAccepted) {
        const stackTitle = options.snapshot
          ? resolveNoticeStackTitle(notice, options.snapshot)
          : null;
        void this.triggerOsNotification(notice, stackTitle);
      }
    }

    return newlyAccepted;
  }

  private async ensureAndroidChannel(): Promise<void> {
    if (this.androidChannelReady || !isNativeNotificationPlatform()) return;
    try {
      await LocalNotifications.createChannel({
        id: ANDROID_CHANNEL_ID,
        name: 'Việc được giao',
        description: 'Thông báo khi đồng đội giao việc cho bạn',
        importance: 3,
        visibility: 0,
        vibration: true,
      });
      this.androidChannelReady = true;
    } catch {
      // Ignore on iOS or unsupported bridge
    }
  }

  private async triggerOsNotification(notice: AppNotice, stackTitle?: string | null): Promise<void> {
    if (!this.areDeviceAlertsEnabled(notice.workspaceId, notice.targetMemberId)) return;
    const { title, body } = formatNoticeMessage(notice, stackTitle);

    if (isNativeNotificationPlatform()) {
      try {
        const perm = await LocalNotifications.checkPermissions();
        const mapped = mapCapacitorPermission(perm?.display);
        this.writeNativePermissionCache(mapped);
        if (mapped !== 'granted') return;

        await this.ensureAndroidChannel();
        await LocalNotifications.schedule({
          notifications: [
            {
              id: hashNoticeIdToInt32(notice.id),
              title,
              body,
              largeBody: body,
              channelId: ANDROID_CHANNEL_ID,
              autoCancel: true,
              foreground: false,
              isExactNotification: false,
              extra: {
                noticeId: notice.id,
                workspaceId: notice.workspaceId,
                targetMemberId: notice.targetMemberId,
                taskId: notice.taskId,
                kind: notice.kind,
              },
            },
          ],
        });
      } catch {
        // Never crash app sync flow if native notification fails
      }
      return;
    }

    if (typeof window === 'undefined' || typeof window.Notification === 'undefined') {
      return;
    }
    if (window.Notification.permission !== 'granted') {
      return;
    }

    try {
      const swContainer = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
      if (swContainer && typeof swContainer.getRegistration === 'function') {
        const registration = await swContainer.getRegistration();
        if (registration && typeof registration.showNotification === 'function') {
          await registration.showNotification(title, {
            body,
            tag: notice.id,
            data: {
              noticeId: notice.id,
              workspaceId: notice.workspaceId,
              targetMemberId: notice.targetMemberId,
              taskId: notice.taskId,
            },
          });
          return;
        }
      }
    } catch {
      // Fallback to standard Web Notification constructor below
    }

    try {
      const popup = new window.Notification(title, {
        body,
        tag: notice.id,
      });
      popup.onclick = () => {
        popup.close();
        window.focus();
        this.emitNoticeOpen(notice.id);
      };
    } catch {
      // Ignore mobile browsers that disallow direct Notification constructor without SW
    }
  }
}

export const notificationService = new NotificationService();
