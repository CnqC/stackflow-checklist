import {
  MAX_TEAM_MEMBERS,
  type ChecklistItem,
  type Member,
  type StackGroup,
  type StackProgressStats,
  type TaskPriority,
  type TaskStatus,
} from '../../types/models';
import {
  createSeedWorkspaceSnapshot,
  SEED_MEMBER_PALETTE,
  SEED_STACK_PALETTE,
} from './seedSnapshot';

export const MEMBER_PALETTE = SEED_MEMBER_PALETTE;
export const STACK_PALETTE = SEED_STACK_PALETTE;
export { createSeedWorkspaceSnapshot };

export interface RuntimePlatformHint {
  isNativePlatform?: boolean;
  isStandaloneDisplay?: boolean;
}

export function generateId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (typeof g.crypto?.randomUUID === 'function') {
    return g.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function normalizeRoomCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9-_]/g, '');
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  const first = parts[0]![0] ?? '';
  const last = parts[parts.length - 1]![0] ?? '';
  return `${first}${last}`.toUpperCase();
}

export function statusLabelVi(status: TaskStatus): string {
  switch (status) {
    case 'todo':
      return 'Cần làm';
    case 'doing':
      return 'Đang làm';
    case 'blocked':
      return 'Đang kẹt';
    case 'done':
      return 'Hoàn thành';
  }
}

export function priorityLabelVi(priority: TaskPriority): string {
  switch (priority) {
    case 'high':
      return 'Ưu tiên cao';
    case 'medium':
      return 'Trung bình';
    case 'low':
      return 'Thấp';
  }
}

export function calculateProgress(items: ChecklistItem[]): StackProgressStats {
  const total = items.length;
  if (total === 0) {
    return { total: 0, completed: 0, doing: 0, blocked: 0, percentage: 0 };
  }
  let completed = 0;
  let doing = 0;
  let blocked = 0;
  for (const item of items) {
    if (item.completed || item.status === 'done') completed += 1;
    else if (item.status === 'doing') doing += 1;
    else if (item.status === 'blocked') blocked += 1;
  }
  return {
    total,
    completed,
    doing,
    blocked,
    percentage: Math.round((completed / total) * 100),
  };
}

export function sortByPosition<T extends { position: number; createdAt: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function isItemLockedBySequence(
  stack: StackGroup,
  targetItem: ChecklistItem,
  stackItems: ChecklistItem[],
): { locked: boolean; blockingItemTitle: string | null } {
  if (!stack.sequentialLock) {
    return { locked: false, blockingItemTitle: null };
  }
  for (const candidate of sortByPosition(stackItems)) {
    if (candidate.id === targetItem.id) break;
    if (!candidate.completed) {
      return { locked: true, blockingItemTitle: candidate.title };
    }
  }
  return { locked: false, blockingItemTitle: null };
}

export function canAddMember(members: Member[], maxMembers: number = MAX_TEAM_MEMBERS): boolean {
  return members.length < Math.min(maxMembers, MAX_TEAM_MEMBERS);
}

export function detectPlatform(hint?: RuntimePlatformHint): 'Web' | 'App' {
  if (hint) {
    return hint.isNativePlatform || hint.isStandaloneDisplay ? 'App' : 'Web';
  }
  const g = globalThis as Record<string, unknown>;
  const cap = g['Capacitor'] as { isNativePlatform?: () => boolean } | undefined;
  if (cap?.isNativePlatform?.()) return 'App';
  const matchMediaFn = g['matchMedia'] as ((query: string) => { matches?: boolean }) | undefined;
  const nav = g['navigator'] as { standalone?: boolean } | undefined;
  const isStandalone =
    Boolean(matchMediaFn?.('(display-mode: standalone)')?.matches) || nav?.standalone === true;
  return isStandalone ? 'App' : 'Web';
}

export {
  isMemberInvolvedInItem,
  normalizeAssigneeIds,
  sanitizeSubtaskItem,
  sanitizeWorkspaceSnapshot,
  type LegacyChecklistItemInput,
  type LegacySubtaskInput,
  type RawWorkspaceSnapshotInput,
} from './dataValidator';

export {
  detectAssignmentNotices,
  detectNewAssignmentNotices,
} from './notificationDiffEngine';
