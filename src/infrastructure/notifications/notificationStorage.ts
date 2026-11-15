import {
  captureAssignmentCheckpoint,
  type AssignmentCheckpoint,
} from '../../core/domain/notificationDiffEngine';
import type { AppNotice, WorkspaceSnapshot } from '../../types/models';

export const NOTICE_STORE_KEY = 'stackflow_inapp_notices_v2';
export const NATIVE_PERMISSION_CACHE_KEY = 'stackflow_native_notif_perm_v1';
export const ASSIGNMENT_CHECKPOINT_KEY = 'stackflow_assignment_checkpoints_v1';
export const DEVICE_ALERTS_PREF_KEY = 'stackflow_device_alerts_enabled_v1';
export const MAX_NOTICES_PER_SCOPE = 100;
export const MAX_DISPATCHED_IDS = 500;

export interface PersistedNoticeStore {
  noticesByScope: Record<string, AppNotice[]>;
  dispatchedNoticeIds: string[];
}

export function makeScopeKey(workspaceId: string, memberId: string): string {
  return `${workspaceId.trim()}::${memberId.trim()}`;
}

export function readPersistedNoticeStore(fallback: PersistedNoticeStore): PersistedNoticeStore {
  if (typeof window === 'undefined' || !window.localStorage) return fallback;
  try {
    const raw = window.localStorage.getItem(NOTICE_STORE_KEY);
    if (!raw) return { noticesByScope: {}, dispatchedNoticeIds: [] };
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

export function writePersistedNoticeStore(store: PersistedNoticeStore): PersistedNoticeStore {
  if (typeof window !== 'undefined' && window.localStorage) {
    try { window.localStorage.setItem(NOTICE_STORE_KEY, JSON.stringify(store)); }
    catch { /* Ignore quota / private browsing errors */ }
  }
  return store;
}

export function collectAllNotices(store: PersistedNoticeStore): AppNotice[] {
  const all: AppNotice[] = [];
  for (const bucket of Object.values(store.noticesByScope)) {
    if (Array.isArray(bucket)) for (const item of bucket) all.push({ ...item });
  }
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function readObjectStore<T>(key: string): Record<string, T> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, T>) : {};
  } catch { return {}; }
}

export function readNativePermissionCache(): 'granted' | 'denied' | 'default' {
  if (typeof window === 'undefined' || !window.localStorage) return 'default';
  try {
    const cached = window.localStorage.getItem(NATIVE_PERMISSION_CACHE_KEY);
    if (cached === 'granted' || cached === 'denied' || cached === 'default') return cached;
  } catch { /* Ignore */ }
  return 'default';
}

export function writeNativePermissionCache(state: 'granted' | 'denied' | 'default'): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try { window.localStorage.setItem(NATIVE_PERMISSION_CACHE_KEY, state); } catch { /* Ignore */ }
}

export function readAssignmentCheckpoint(workspaceId: string, memberId: string): AssignmentCheckpoint | null {
  if (typeof window === 'undefined' || !workspaceId || !memberId) return null;
  try {
    const store = readObjectStore<unknown>(ASSIGNMENT_CHECKPOINT_KEY);
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
            ? item.subtasks.flatMap((sub) => (typeof sub?.id === 'string' ? [{ id: sub.id, assigneeId: sub.assigneeId === memberId ? memberId : null }] : []))
            : [],
        }];
      }),
    };
  } catch { return null; }
}

export function writeAssignmentCheckpoint(snapshot: WorkspaceSnapshot, memberId: string): void {
  if (typeof window === 'undefined' || !memberId) return;
  try {
    const store = readObjectStore<AssignmentCheckpoint>(ASSIGNMENT_CHECKPOINT_KEY);
    store[makeScopeKey(snapshot.workspace.id, memberId)] = captureAssignmentCheckpoint(snapshot, memberId);
    window.localStorage.setItem(ASSIGNMENT_CHECKPOINT_KEY, JSON.stringify(store));
  } catch { /* Ignore */ }
}

export function readDeviceAlertsEnabled(workspaceId: string, memberId: string): boolean {
  if (typeof window === 'undefined') return true;
  return readObjectStore<boolean>(DEVICE_ALERTS_PREF_KEY)[makeScopeKey(workspaceId, memberId)] !== false;
}

export function writeDeviceAlertsEnabled(workspaceId: string, memberId: string, enabled: boolean): boolean {
  if (typeof window === 'undefined' || !workspaceId || !memberId) return false;
  try {
    const store = readObjectStore<boolean>(DEVICE_ALERTS_PREF_KEY);
    store[makeScopeKey(workspaceId, memberId)] = enabled;
    window.localStorage.setItem(DEVICE_ALERTS_PREF_KEY, JSON.stringify(store));
    return true;
  } catch { return false; }
}

export function mutateMarkNoticeRead(
  store: PersistedNoticeStore,
  noticeId: string,
  workspaceId?: string,
  memberId?: string,
): Array<{ workspaceId: string; memberId: string }> {
  const scopes = workspaceId && memberId ? [makeScopeKey(workspaceId, memberId)] : Object.keys(store.noticesByScope);
  const touched: Array<{ workspaceId: string; memberId: string }> = [];
  for (const key of scopes) {
    const bucket = store.noticesByScope[key];
    if (!Array.isArray(bucket) || !bucket.some((n) => n.id === noticeId && !n.read)) continue;
    store.noticesByScope[key] = bucket.map((n) => (n.id === noticeId && !n.read ? { ...n, read: true } : n));
    const [wsId = '', memId = ''] = key.split('::');
    if (wsId && memId) touched.push({ workspaceId: wsId, memberId: memId });
  }
  return touched;
}

export function mutateAcceptNotices(
  store: PersistedNoticeStore,
  notices: AppNotice[],
): { newlyAccepted: AppNotice[]; touched: Array<{ workspaceId: string; memberId: string }> } {
  const dispatchedSet = new Set<string>(store.dispatchedNoticeIds);
  const newlyAccepted: AppNotice[] = [];
  const touched = new Map<string, { workspaceId: string; memberId: string }>();

  for (const raw of notices) {
    if (!raw?.id || !raw.workspaceId || !raw.targetMemberId || dispatchedSet.has(raw.id)) continue;
    const key = makeScopeKey(raw.workspaceId, raw.targetMemberId);
    const bucket = Array.isArray(store.noticesByScope[key]) ? store.noticesByScope[key] : [];
    if (bucket.some((item) => item.id === raw.id)) { dispatchedSet.add(raw.id); continue; }
    const clean: AppNotice = { ...raw, read: Boolean(raw.read) };
    store.noticesByScope[key] = [clean, ...bucket].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, MAX_NOTICES_PER_SCOPE);
    dispatchedSet.add(clean.id);
    newlyAccepted.push(clean);
    touched.set(key, { workspaceId: clean.workspaceId, memberId: clean.targetMemberId });
  }
  if (newlyAccepted.length > 0) {
    const merged = Array.from(dispatchedSet);
    store.dispatchedNoticeIds = merged.length > MAX_DISPATCHED_IDS ? merged.slice(merged.length - MAX_DISPATCHED_IDS) : merged;
  }
  return { newlyAccepted, touched: [...touched.values()] };
}
