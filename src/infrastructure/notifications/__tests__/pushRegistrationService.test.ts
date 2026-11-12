import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSeedWorkspaceSnapshot } from '../../../core/domain/stackDomain';
import { notificationService } from '../notificationService';
import { PushRegistrationService } from '../pushRegistrationService';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('../../../services/supabaseConfig', () => ({
  getSupabaseConfig: () => ({ url: 'https://example.supabase.co', anonKey: 'public-key' }),
}));

describe('Web Push registration', () => {
  const originalNotification = window.Notification;
  const originalFetch = globalThis.fetch;
  const serviceWorkerDescriptor = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');

  afterEach(() => {
    vi.unstubAllEnvs();
    Object.defineProperty(window, 'Notification', { configurable: true, value: originalNotification });
    globalThis.fetch = originalFetch;
    if (serviceWorkerDescriptor) Object.defineProperty(navigator, 'serviceWorker', serviceWorkerDescriptor);
    else Reflect.deleteProperty(navigator, 'serviceWorker');
    window.localStorage.clear();
  });

  it('registers only after permission, suppresses duplicate local OS alerts, and unregisters', async () => {
    const snapshot = createSeedWorkspaceSnapshot();
    const memberId = snapshot.members[1]!.id;
    const service = new PushRegistrationService();
    const unsubscribe = vi.fn(async () => true);
    const vapidPublicKey = 'B'.repeat(87);
    const applicationServerKey = Uint8Array.from(atob(`${vapidPublicKey}=`),
      (char) => char.charCodeAt(0));
    const subscription = {
      endpoint: 'https://push.example/device',
      options: { applicationServerKey },
      toJSON: () => ({ endpoint: 'https://push.example/device', keys: { p256dh: 'p', auth: 'a' } }),
      unsubscribe,
    };
    const showNotification = vi.fn(async () => {});
    const registration = {
      pushManager: { getSubscription: vi.fn(async () => subscription), subscribe: vi.fn() },
      showNotification,
    };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {
      ready: Promise.resolve(registration), getRegistration: vi.fn(async () => registration),
    } });
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    globalThis.fetch = fetchMock as typeof fetch;
    vi.stubEnv('VITE_WEB_PUSH_PUBLIC_KEY', vapidPublicKey);
    Object.defineProperty(window, 'Notification', { configurable: true, value: class {
      static permission = 'granted';
    } });

    expect(await service.sync(snapshot, memberId, 'supabase', true)).toBe(true);
    expect(service.isActiveFor(snapshot.workspace.id, memberId)).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('https://example.supabase.co/functions/v1/push-device',
      expect.objectContaining({ method: 'POST', body: expect.stringContaining(snapshot.workspace.pinCode) }));

    notificationService.dispatchNotices([{
      id: 'remote-dedupe', workspaceId: snapshot.workspace.id, workspaceCode: snapshot.workspace.code,
      targetMemberId: memberId, actorName: snapshot.members[0]!.name, kind: 'task_assigned',
      taskId: snapshot.items[0]!.id, taskTitle: snapshot.items[0]!.title,
      createdAt: '2026-11-12T10:00:00.000Z', read: false,
    }]);
    await Promise.resolve();
    expect(showNotification).not.toHaveBeenCalled();

    await service.disable();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith('https://example.supabase.co/functions/v1/push-device',
      expect.objectContaining({ method: 'DELETE' }));
  });

  it('turns a remote push into the existing inbox notice and opens its task', () => {
    const snapshot = createSeedWorkspaceSnapshot();
    const memberId = snapshot.members[1]!.id;
    const opened: string[] = [];
    const stop = notificationService.subscribeNoticeOpens((id) => opened.push(id));
    notificationService.receiveRemotePush({
      noticeId: 'from-fcm', workspaceId: snapshot.workspace.id, targetMemberId: memberId,
      taskId: snapshot.items[0]!.id, kind: 'task_assigned', actorName: 'Quang',
      taskTitle: snapshot.items[0]!.title,
    }, true);
    expect(notificationService.getNotices(snapshot.workspace.id, memberId)
      .some((notice) => notice.id === 'from-fcm')).toBe(true);
    expect(opened).toEqual(['from-fcm']);
    stop();
  });
});
