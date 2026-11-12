import { PushNotifications } from '@capacitor/push-notifications';
import type { WorkspaceSnapshot, SyncMode } from '../../types/models';
import { getSupabaseConfig } from '../../services/supabaseConfig';
import { isNativeNotificationPlatform, notificationService, type RemotePushData } from './notificationService';

type DeviceContext = {
  workspaceId: string;
  roomCode: string;
  pinCode: string;
  memberId: string;
};

function contextFor(snapshot: WorkspaceSnapshot, memberId: string): DeviceContext {
  return {
    workspaceId: snapshot.workspace.id,
    roomCode: snapshot.workspace.code,
    pinCode: snapshot.workspace.pinCode,
    memberId,
  };
}

function vapidPublicKey(): Uint8Array | null {
  const key = (import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY as string | undefined)?.trim();
  if (!key) return null;
  try {
    const base64 = key.replace(/-/g, '+').replace(/_/g, '/');
    const bytes = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
    return Uint8Array.from(bytes, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

export class PushRegistrationService {
  private statusListeners = new Set<() => void>();
  private activeContext: DeviceContext | null = null;
  private activePlatform: 'android' | 'web' | null = null;
  private activeToken: string | null = null;
  private listenersReady = false;
  private lastAttemptScope = '';
  private lastAttemptAt = 0;

  public isWebConfigured(): boolean {
    return vapidPublicKey() !== null;
  }

  public isActiveFor(workspaceId: string, memberId: string): boolean {
    return Boolean(this.activeToken && this.activeContext?.workspaceId === workspaceId &&
      this.activeContext.memberId === memberId);
  }

  public subscribeStatus(listener: () => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private notifyStatus(): void {
    for (const listener of this.statusListeners) listener();
  }

  private async callDeviceEndpoint(context: DeviceContext, platform: 'android' | 'web',
    token: string, subscription?: PushSubscriptionJSON, method: 'POST' | 'DELETE' = 'POST'): Promise<void> {
    const config = getSupabaseConfig();
    if (!config) throw new Error('Supabase is not configured');
    const response = await fetch(`${config.url.replace(/\/$/, '')}/functions/v1/push-device`, {
      method,
      headers: { 'Content-Type': 'application/json', apikey: config.anonKey },
      body: JSON.stringify({
        roomCode: context.roomCode,
        pinCode: context.pinCode,
        memberId: context.memberId,
        platform,
        token,
        ...(subscription ? { subscription } : {}),
      }),
    });
    if (!response.ok) throw new Error(`Device registration failed: ${response.status}`);
  }

  private async ensureNativeListeners(): Promise<void> {
    if (this.listenersReady) return;
    this.listenersReady = true;
    try {
      await PushNotifications.addListener('pushNotificationReceived', (notification) => {
        notificationService.receiveRemotePush(notification.data as RemotePushData);
      });
      await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        notificationService.receiveRemotePush(action.notification.data as RemotePushData, true);
      });
    } catch {
      this.listenersReady = false;
    }
  }

  private async nativeToken(): Promise<string> {
    await this.ensureNativeListeners();
    await PushNotifications.createChannel({
      id: 'stackflow_assignments_push_v1',
      name: 'Việc mới được giao',
      description: 'Báo trên điện thoại khi đồng đội giao việc cho bạn',
      importance: 4,
      visibility: 0,
      vibration: true,
    });
    return new Promise<string>((resolve, reject) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout>;
      const finish = (token?: string, error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        void registrationHandle.then((handle) => handle.remove());
        void errorHandle.then((handle) => handle.remove());
        if (token) resolve(token);
        else reject(error ?? new Error('Firebase registration failed'));
      };
      const registrationHandle = PushNotifications.addListener('registration', (token) => finish(token.value));
      const errorHandle = PushNotifications.addListener('registrationError', () => finish());
      timeout = setTimeout(() => finish(undefined, new Error('Firebase registration timed out')), 10000);
      void Promise.all([registrationHandle, errorHandle]).then(() => PushNotifications.register())
        .catch((error: unknown) => finish(undefined, error instanceof Error ? error : new Error(String(error))));
    });
  }

  private async webSubscription(): Promise<{ token: string; subscription: PushSubscriptionJSON }> {
    const key = vapidPublicKey();
    if (!key || !('serviceWorker' in navigator)) throw new Error('Web Push is not configured');
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const oldKey = existing?.options.applicationServerKey;
    const sameKey = oldKey && new Uint8Array(oldKey).length === key.length &&
      new Uint8Array(oldKey).every((byte, index) => byte === key[index]);
    if (existing && !sameKey) await existing.unsubscribe();
    const subscription = existing && sameKey ? existing : await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key as BufferSource,
    });
    return { token: subscription.endpoint, subscription: subscription.toJSON() };
  }

  public async sync(snapshot: WorkspaceSnapshot, memberId: string, mode: SyncMode,
    force = false): Promise<boolean> {
    if (mode !== 'supabase' || !notificationService.areDeviceAlertsEnabled(snapshot.workspace.id, memberId)) {
      return false;
    }
    const context = contextFor(snapshot, memberId);
    const scope = `${context.workspaceId}:${memberId}`;
    if (this.activeContext?.workspaceId === context.workspaceId &&
        this.activeContext.memberId === memberId && this.activeToken) return true;
    if (this.activeContext &&
        (this.activeContext.workspaceId !== context.workspaceId || this.activeContext.memberId !== memberId)) {
      await this.disable();
    }
    if (!force && this.lastAttemptScope === scope && Date.now() - this.lastAttemptAt < 60000) return false;
    this.lastAttemptScope = scope;
    this.lastAttemptAt = Date.now();

    try {
      const native = isNativeNotificationPlatform();
      if (native) {
        const permission = await PushNotifications.checkPermissions();
        if (permission.receive !== 'granted') return false;
      } else if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
        return false;
      }
      const platform = native ? 'android' : 'web';
      const registration = native
        ? { token: await this.nativeToken(), subscription: undefined }
        : await this.webSubscription();
      await this.callDeviceEndpoint(context, platform, registration.token, registration.subscription);
      this.activeContext = context;
      this.activePlatform = platform;
      this.activeToken = registration.token;
      notificationService.setRemotePushActive(context.workspaceId, memberId, true);
      this.notifyStatus();
      return true;
    } catch {
      notificationService.setRemotePushActive(context.workspaceId, memberId, false);
      this.notifyStatus();
      return false;
    }
  }

  public async disable(): Promise<void> {
    const context = this.activeContext;
    const token = this.activeToken;
    const platform = this.activePlatform;
    this.activeContext = null;
    this.activeToken = null;
    this.activePlatform = null;
    this.lastAttemptAt = 0;
    if (!context || !token || !platform) return;
    notificationService.setRemotePushActive(context.workspaceId, context.memberId, false);
    this.notifyStatus();
    try { await this.callDeviceEndpoint(context, platform, token, undefined, 'DELETE'); } catch { /* best effort */ }
    try {
      if (platform === 'android') await PushNotifications.unregister();
      else {
        const registration = await navigator.serviceWorker.getRegistration();
        await (await registration?.pushManager.getSubscription())?.unsubscribe();
      }
    } catch { /* stale server tokens are removed after delivery failure */ }
  }
}

export const pushRegistrationService = new PushRegistrationService();
