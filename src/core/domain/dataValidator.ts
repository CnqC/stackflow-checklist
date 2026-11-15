import { z } from 'zod';
import {
  CURRENT_SCHEMA_VERSION,
  MAX_TEAM_MEMBERS,
  type ActivityLog,
  type ChecklistItem,
  type Member,
  type StackGroup,
  type SubtaskItem,
  type TaskLink,
  type Workspace,
  type WorkspaceSnapshot,
} from '../../types/models';

export type LegacySubtaskInput = {
  id?: string;
  title?: string;
  completed?: boolean;
  assigneeId?: string | null;
  completedById?: string | null;
  completedByName?: string | null;
};

export type LegacyChecklistItemInput = Omit<
  ChecklistItem,
  'assigneeIds' | 'assigneeId' | 'subtasks' | 'links'
> & {
  assigneeId?: string | null;
  assigneeIds?: string[] | null;
  subtasks?: LegacySubtaskInput[] | null;
  links?: TaskLink[] | null;
};

export type RawWorkspaceSnapshotInput = {
  schemaVersion?: number;
  workspace: Workspace;
  members: Member[];
  stacks: StackGroup[];
  items: Array<ChecklistItem | LegacyChecklistItemInput>;
  activities: ActivityLog[];
};

export const WorkspaceBoundarySchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().default(''),
  pinCode: z.string().default('GOOGLE'),
  maxMembers: z.number().int().min(1).max(MAX_TEAM_MEMBERS).optional(),
  schemaVersion: z.number().int().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export function normalizeAssigneeIds(
  assigneeIds?: string[] | null,
  legacyAssigneeId?: string | null,
  validMemberIds?: Set<string>,
): string[] {
  const rawCandidates: string[] = Array.isArray(assigneeIds)
    ? assigneeIds
    : typeof legacyAssigneeId === 'string' && legacyAssigneeId.trim().length > 0
      ? [legacyAssigneeId]
      : [];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of rawCandidates) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    if (validMemberIds && !validMemberIds.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

export function sanitizeSubtaskItem(
  raw: LegacySubtaskInput,
  fallbackIndex: number,
  validMemberIds?: Set<string>,
): SubtaskItem {
  const id = typeof raw.id === 'string' && raw.id.trim().length > 0 ? raw.id.trim() : `sub-${fallbackIndex + 1}`;
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const completed = Boolean(raw.completed);
  const candidate = typeof raw.assigneeId === 'string' && raw.assigneeId.trim().length > 0 ? raw.assigneeId.trim() : null;
  const assigneeId = candidate && (!validMemberIds || validMemberIds.has(candidate)) ? candidate : null;
  const completedByName = typeof raw.completedByName === 'string' && raw.completedByName.trim().length > 0 ? raw.completedByName.trim() : null;
  const completedById = typeof raw.completedById === 'string' && raw.completedById.trim().length > 0 ? raw.completedById.trim() : null;

  return {
    id,
    title,
    completed,
    assigneeId,
    ...(completed && completedById ? { completedById } : {}),
    completedByName: completed ? completedByName : null,
  };
}

export function sanitizeWorkspaceSnapshot(
  raw: WorkspaceSnapshot | RawWorkspaceSnapshotInput,
): WorkspaceSnapshot {
  const incomingVersion = raw.schemaVersion ?? raw.workspace?.schemaVersion ?? 1;
  const parsedWs = WorkspaceBoundarySchema.safeParse(raw.workspace);
  const wsSource = parsedWs.success ? parsedWs.data : raw.workspace;

  const members: Member[] = Array.isArray(raw.members)
    ? raw.members.slice(0, MAX_TEAM_MEMBERS).map((m) => ({
        id: m.id,
        workspaceId: m.workspaceId,
        name: m.name,
        role: m.role,
        color: m.color,
        avatar: m.avatar,
        createdAt: m.createdAt,
      }))
    : [];

  const validMemberIds = new Set<string>(members.map((m) => m.id));
  const workspace: Workspace = {
    id: wsSource.id,
    code: wsSource.code,
    name: wsSource.name,
    description: wsSource.description ?? '',
    pinCode: wsSource.pinCode,
    maxMembers: Math.min(Math.max(wsSource.maxMembers ?? MAX_TEAM_MEMBERS, 1), MAX_TEAM_MEMBERS),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: wsSource.createdAt,
    updatedAt: wsSource.updatedAt,
  };

  const stacks: StackGroup[] = Array.isArray(raw.stacks)
    ? raw.stacks.map((s) => ({
        id: s.id,
        workspaceId: s.workspaceId,
        title: s.title,
        description: s.description ?? '',
        color: s.color,
        position: typeof s.position === 'number' ? s.position : 0,
        sequentialLock: Boolean(s.sequentialLock),
        collapsed: Boolean(s.collapsed),
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }))
    : [];

  const items: ChecklistItem[] = Array.isArray(raw.items)
    ? raw.items.map((item) => {
        const rawIds =
          Array.isArray(item.assigneeIds) &&
          (item.assigneeIds.length > 0 || incomingVersion >= CURRENT_SCHEMA_VERSION || !item.assigneeId)
            ? item.assigneeIds
            : undefined;
        const normalizedAssignees = normalizeAssigneeIds(rawIds, item.assigneeId ?? null, validMemberIds);
        const subtasks: SubtaskItem[] = Array.isArray(item.subtasks)
          ? item.subtasks.map((sub, idx) => sanitizeSubtaskItem(sub, idx, validMemberIds)).filter((sub) => sub.title.length > 0)
          : [];
        const links: TaskLink[] = Array.isArray(item.links)
          ? item.links.map((lnk) => ({ id: lnk.id, label: lnk.label, url: lnk.url }))
          : [];
        const completed = Boolean(item.completed || item.status === 'done');
        const status = completed ? 'done' : item.status === 'doing' || item.status === 'blocked' ? item.status : 'todo';

        return {
          id: item.id,
          ...(Number.isSafeInteger(item.version) && (item.version ?? 0) > 0 ? { version: item.version } : {}),
          workspaceId: item.workspaceId,
          stackId: item.stackId,
          title: item.title,
          notes: item.notes ?? '',
          status,
          priority: item.priority === 'low' || item.priority === 'medium' || item.priority === 'high' ? item.priority : 'medium',
          completed,
          assigneeId: normalizedAssignees[0] ?? null,
          assigneeIds: normalizedAssignees,
          dueDate: item.dueDate ?? null,
          position: typeof item.position === 'number' ? item.position : 0,
          subtasks,
          links,
          completedById: item.completedById ?? null,
          completedByName: item.completedByName ?? null,
          completedAt: item.completedAt ?? null,
          updatedByName: item.updatedByName ?? null,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        };
      })
    : [];

  const activities: ActivityLog[] = Array.isArray(raw.activities)
    ? raw.activities.map((a) => ({
        id: a.id,
        workspaceId: a.workspaceId,
        actorId: a.actorId ?? null,
        actorName: a.actorName,
        actorColor: a.actorColor,
        actionType: a.actionType,
        targetTitle: a.targetTitle,
        detail: a.detail ?? '',
        createdAt: a.createdAt,
      }))
    : [];

  return { schemaVersion: CURRENT_SCHEMA_VERSION, workspace, members, stacks, items, activities };
}

export function isMemberInvolvedInItem(item: ChecklistItem, memberId: string): boolean {
  if (!memberId) return false;
  if (Array.isArray(item.assigneeIds) && item.assigneeIds.includes(memberId)) return true;
  if (item.assigneeId === memberId) return true;
  return Array.isArray(item.subtasks) && item.subtasks.some((sub) => sub.assigneeId === memberId);
}
