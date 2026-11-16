import { LocalNotifications } from '@capacitor/local-notifications';
import type { AssignmentCheckpoint } from '../../core/domain/notificationDiffEngine';
import { resolveNoticeStackTitle } from '../../core/domain/noticePresentation';
import { domainEventBus } from '../../core/events/domainEventBus';
import type { AppNotice, WorkspaceSnapshot } from '../../types/models';
import {
  attachPlatformNotificationOpenListeners,
  ensureAndroidNotificationChannel,
  formatNoticeMessage,
  hashNoticeIdToInt32,
  isNativeNotificationPlatform,
  mapCapacitorPermission,
  triggerPlatformOsNotification,
  type NoticeOpenTarget,
} from './notificationPlatformAdapter';
import { notificationSoundService } from './notificationSoundService';
import {
  collectAllNotices,
  DEVICE_ALERTS_PREF_KEY,
  makeScopeKey,
  mutateAcceptNotices,
  mutateMarkNoticeRead,
  NATIVE_PERMISSION_CACHE_KEY,
  NOTICE_STORE_KEY,
  readAssignmentCheckpoint,
  readDeviceAlertsEnabled,
  readNativePermissionCache,
  readPersistedNoticeStore,
  writeAssignmentCheckpoint,
  writeDeviceAlertsEnabled,
  writeNativePermissionCache,
  writePersistedNoticeStore,
  type PersistedNoticeStore,
} from './notificationStorage';

export { formatNoticeMessage, hashNoticeIdToInt32, isNativeNotificationPlatform, type NoticeOpenTarget };

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';
export type NoticeListener = (notices: AppNotice[]) => void;
export type NoticeOpenListener = (noticeId: string, target?: NoticeOpenTarget) => void;
export type RemotePushData = NoticeOpenTarget & {
  noticeId?: string;
  targetMemberId?: string;
  kind?: string;
  actorName?: string;
  taskTitle?: string;
  subtaskTitle?: string;
  createdAt?: string;
};

export class NotificationService {
  private listeners = new Set<NoticeListener>();
  private openListeners = new Set<NoticeOpenListener>();
  private remotePushScopes = new Set<string>();
  private memoryFallbackStore: PersistedNoticeStore = { noticesByScope: {}, dispatchedNoticeIds: [] };
  private androidChannelReady = false;
  private syncingNativePerm = false;
  private storageListenerAttached = false;
  private notificationOpenListenersAttached = false;

  constructor() {
    if (!this.storageListenerAttached && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      this.storageListenerAttached = true;
      window.addEventListener('storage', (event: StorageEvent) => {
        if (event.key === NOTICE_STORE_KEY || event.key === NATIVE_PERMISSION_CACHE_KEY || event.key === DEVICE_ALERTS_PREF_KEY) {
          this.notifySubscribers();
        }
      });
    }
  }

  private readStore(): PersistedNoticeStore { return readPersistedNoticeStore(this.memoryFallbackStore); }
  private writeStore(store: PersistedNoticeStore): void { this.memoryFallbackStore = writePersistedNoticeStore(store); }
  private emitScopeChange(workspaceId: string, memberId: string): void {
    domainEventBus.emit('notices:changed', { workspaceId, memberId, notices: this.getNotices(workspaceId, memberId) });
  }

  private notifySubscribers(): void {
    if (this.listeners.size === 0) return;
    const snapshot = collectAllNotices(this.readStore());
    for (const listener of [...this.listeners]) listener(snapshot);
  }

  private async syncNativePermissionInBackground(): Promise<void> {
    if (this.syncingNativePerm || !isNativeNotificationPlatform()) return;
    this.syncingNativePerm = true;
    try {
      const mapped = mapCapacitorPermission((await LocalNotifications.checkPermissions())?.display);
      if (mapped !== readNativePermissionCache()) { writeNativePermissionCache(mapped); this.notifySubscribers(); }
    } catch { /* Safe fallback */ } finally { this.syncingNativePerm = false; }
  }

  public getAssignmentCheckpoint(workspaceId: string, memberId: string): AssignmentCheckpoint | null { return readAssignmentCheckpoint(workspaceId, memberId); }
  public saveAssignmentCheckpoint(snapshot: WorkspaceSnapshot, memberId: string): void { writeAssignmentCheckpoint(snapshot, memberId); }
  public areDeviceAlertsEnabled(workspaceId: string, memberId: string): boolean { return readDeviceAlertsEnabled(workspaceId, memberId); }
  public setDeviceAlertsEnabled(workspaceId: string, memberId: string, enabled: boolean): void {
    if (writeDeviceAlertsEnabled(workspaceId, memberId, enabled)) this.notifySubscribers();
  }

  public getPermissionState(): NotificationPermissionState {
    if (isNativeNotificationPlatform()) { void this.syncNativePermissionInBackground(); return readNativePermissionCache(); }
    if (typeof window === 'undefined' || typeof window.Notification === 'undefined') return 'unsupported';
    const perm = window.Notification.permission;
    return perm === 'granted' || perm === 'denied' || perm === 'default' ? perm : 'default';
  }

  public async requestPermission(): Promise<boolean> {
    if (isNativeNotificationPlatform()) {
      try {
        const mapped = mapCapacitorPermission((await LocalNotifications.requestPermissions())?.display);
        writeNativePermissionCache(mapped);
        if (mapped === 'granted') this.androidChannelReady = await ensureAndroidNotificationChannel(this.androidChannelReady);
        this.notifySubscribers();
        return mapped === 'granted';
      } catch { return false; }
    }
    if (typeof window === 'undefined' || typeof window.Notification === 'undefined') return false;
    if (window.Notification.permission === 'granted') { this.notifySubscribers(); return true; }
    if (typeof window.Notification.requestPermission !== 'function') return false;
    try {
      const result = await Promise.resolve(window.Notification.requestPermission());
      this.notifySubscribers();
      return result === 'granted';
    } catch { return false; }
  }

  public getNotices(workspaceId: string, memberId: string): AppNotice[] {
    if (!workspaceId || !memberId) return [];
    const list = this.readStore().noticesByScope[makeScopeKey(workspaceId, memberId)];
    return Array.isArray(list) ? [...list].map((n) => ({ ...n })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
  }

  public getUnreadCount(workspaceId: string, memberId: string): number { return this.getNotices(workspaceId, memberId).filter((n) => !n.read).length; }
  public subscribeNotices(listener: NoticeListener): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }

  public subscribeNoticeOpens(listener: NoticeOpenListener): () => void {
    this.openListeners.add(listener);
    if (!this.notificationOpenListenersAttached) {
      this.notificationOpenListenersAttached = true;
      attachPlatformNotificationOpenListeners((id, target) => this.openNotice(id, target), () => { this.notificationOpenListenersAttached = false; });
    }
    return () => this.openListeners.delete(listener);
  }

  public openNotice(noticeId: unknown, target?: NoticeOpenTarget): void {
    if (typeof noticeId !== 'string' || !noticeId) return;
    for (const listener of this.openListeners) listener(noticeId, target);
  }

  public setRemotePushActive(workspaceId: string, memberId: string, active: boolean): void {
    const scope = makeScopeKey(workspaceId, memberId);
    if (active) this.remotePushScopes.add(scope); else this.remotePushScopes.delete(scope);
  }

  public receiveRemotePush(data: RemotePushData, open = false): void {
    if (!data.noticeId || !data.workspaceId || !data.targetMemberId || !data.taskId) return;
    if (data.kind !== 'task_assigned' && data.kind !== 'subtask_assigned') return;
    this.dispatchNotices([{
      id: data.noticeId, workspaceId: data.workspaceId, workspaceCode: '', targetMemberId: data.targetMemberId,
      actorName: data.actorName || 'Đồng đội', kind: data.kind, taskId: data.taskId,
      taskTitle: data.taskTitle || 'Việc mới', subtaskTitle: data.subtaskTitle || undefined,
      createdAt: data.createdAt || new Date().toISOString(), read: false,
    }], { deviceAlert: false });
    if (open) this.openNotice(data.noticeId, { taskId: data.taskId, workspaceId: data.workspaceId });
  }

  public markAllRead(workspaceId: string, memberId: string): void {
    if (!workspaceId || !memberId) return;
    const store = this.readStore();
    const key = makeScopeKey(workspaceId, memberId);
    const existing = store.noticesByScope[key];
    if (!Array.isArray(existing) || existing.every((n) => n.read)) return;
    store.noticesByScope[key] = existing.map((n) => (n.read ? n : { ...n, read: true }));
    this.writeStore(store);
    this.emitScopeChange(workspaceId, memberId);
    this.notifySubscribers();
  }

  public markNoticeRead(noticeId: string, workspaceId?: string, memberId?: string): void {
    if (!noticeId) return;
    const store = this.readStore();
    const touched = mutateMarkNoticeRead(store, noticeId, workspaceId, memberId);
    if (touched.length === 0) return;
    this.writeStore(store);
    for (const s of touched) this.emitScopeChange(s.workspaceId, s.memberId);
    this.notifySubscribers();
  }

  public clearNotices(workspaceId: string, memberId: string): void {
    if (!workspaceId || !memberId) return;
    const store = this.readStore();
    const key = makeScopeKey(workspaceId, memberId);
    if (!store.noticesByScope[key]?.length) return;
    store.noticesByScope[key] = [];
    this.writeStore(store);
    domainEventBus.emit('notices:changed', { workspaceId, memberId, notices: [] });
    this.notifySubscribers();
  }

  public clearReadNotices(workspaceId: string, memberId: string): void {
    if (!workspaceId || !memberId) return;
    const store = this.readStore();
    const key = makeScopeKey(workspaceId, memberId);
    const existing = store.noticesByScope[key];
    if (!Array.isArray(existing)) return;
    const unread = existing.filter((n) => !n.read);
    if (unread.length === existing.length) return;
    store.noticesByScope[key] = unread;
    this.writeStore(store);
    this.emitScopeChange(workspaceId, memberId);
    this.notifySubscribers();
  }

  public dispatchNotices(notices: AppNotice[], options: { deviceAlert?: boolean; snapshot?: WorkspaceSnapshot } = {}): AppNotice[] {
    if (!Array.isArray(notices) || notices.length === 0) return [];
    const store = this.readStore();
    const { newlyAccepted, touched } = mutateAcceptNotices(store, notices);
    if (newlyAccepted.length === 0) return [];
    this.writeStore(store);
    for (const s of touched) this.emitScopeChange(s.workspaceId, s.memberId);
    this.notifySubscribers();

    if (options.deviceAlert !== false) {
      const sounded = new Set<string>();
      for (const notice of newlyAccepted) {
        const scope = makeScopeKey(notice.workspaceId, notice.targetMemberId);
        if (!notice.read && !sounded.has(scope)) {
          notificationSoundService.playForNotice(notice.workspaceId, notice.targetMemberId);
          sounded.add(scope);
        }
        if (notice.isSelfAction) continue;
        if (this.remotePushScopes.has(scope) || !this.areDeviceAlertsEnabled(notice.workspaceId, notice.targetMemberId)) continue;
        void triggerPlatformOsNotification({
          notice,
          stackTitle: options.snapshot ? resolveNoticeStackTitle(notice, options.snapshot) : null,
          androidChannelReady: this.androidChannelReady,
          setAndroidChannelReady: (ready) => { this.androidChannelReady = ready; },
          onOpen: (id, target) => this.openNotice(id, target),
        });
      }
    }
    return newlyAccepted;
  }
}

export const notificationService = new NotificationService();
