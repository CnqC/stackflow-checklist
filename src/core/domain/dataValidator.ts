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

/**
 * Normalizes multi-assignee IDs with seamless Schema v1 (`assigneeId`) -> v2 (`assigneeIds`) upgrade.
 * Pure, deterministic, deduplicated, optionally filtered against valid workspace member IDs, and immutable.
 */
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

/**
 * Normalizes a single SubtaskItem so all v2 fields are guaranteed clean and immutable.
 */
export function sanitizeSubtaskItem(
  raw: LegacySubtaskInput,
  fallbackIndex: number,
  validMemberIds?: Set<string>,
): SubtaskItem {
  const id =
    typeof raw.id === 'string' && raw.id.trim().length > 0
      ? raw.id.trim()
      : `sub-${fallbackIndex + 1}`;
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const completed = Boolean(raw.completed);

  const candidateAssignee =
    typeof raw.assigneeId === 'string' && raw.assigneeId.trim().length > 0
      ? raw.assigneeId.trim()
      : null;
  const assigneeId =
    candidateAssignee && (!validMemberIds || validMemberIds.has(candidateAssignee))
      ? candidateAssignee
      : null;

  const completedByName =
    typeof raw.completedByName === 'string' && raw.completedByName.trim().length > 0
      ? raw.completedByName.trim()
      : null;
  const completedById =
    typeof raw.completedById === 'string' && raw.completedById.trim().length > 0
      ? raw.completedById.trim()
      : null;

  return {
    id,
    title,
    completed,
    assigneeId,
    ...(completed && completedById ? { completedById } : {}),
    completedByName: completed ? completedByName : null,
  };
}

/**
 * Pure DataIntegrityGuard at every persistence/network boundary (localStorage, E2EE Relay, Supabase).
 * Upgrades Schema v1 -> v2, keeps `assigneeId = assigneeIds[0] ?? null` in 2-way sync,
 * strips deleted/invalid member references, normalizes subtasks, and returns a deep immutable copy.
 */
export function sanitizeWorkspaceSnapshot(
  raw: WorkspaceSnapshot | RawWorkspaceSnapshotInput,
): WorkspaceSnapshot {
  const incomingVersion = raw.schemaVersion ?? raw.workspace?.schemaVersion ?? 1;

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
    id: raw.workspace.id,
    code: raw.workspace.code,
    name: raw.workspace.name,
    description: raw.workspace.description ?? '',
    pinCode: raw.workspace.pinCode,
    maxMembers: Math.min(Math.max(raw.workspace.maxMembers ?? MAX_TEAM_MEMBERS, 1), MAX_TEAM_MEMBERS),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: raw.workspace.createdAt,
    updatedAt: raw.workspace.updatedAt,
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
        // If unmigrated v1/DB row had default empty array `[]` alongside a non-null legacy `assigneeId`,
        // treat `assigneeIds` as unpopulated so v1 `assigneeId` upgrades seamlessly.
        const rawIds =
          Array.isArray(item.assigneeIds) &&
          (item.assigneeIds.length > 0 || incomingVersion >= CURRENT_SCHEMA_VERSION || !item.assigneeId)
            ? item.assigneeIds
            : undefined;

        const normalizedAssignees = normalizeAssigneeIds(
          rawIds,
          item.assigneeId ?? null,
          validMemberIds,
        );

        const subtasks: SubtaskItem[] = Array.isArray(item.subtasks)
          ? item.subtasks
              .map((sub, idx) => sanitizeSubtaskItem(sub, idx, validMemberIds))
              .filter((sub) => sub.title.length > 0)
          : [];

        const links: TaskLink[] = Array.isArray(item.links)
          ? item.links.map((lnk) => ({
              id: lnk.id,
              label: lnk.label,
              url: lnk.url,
            }))
          : [];

        const completed = Boolean(item.completed || item.status === 'done');
        const status = completed
          ? 'done'
          : item.status === 'doing' || item.status === 'blocked'
            ? item.status
            : 'todo';

        return {
          id: item.id,
          workspaceId: item.workspaceId,
          stackId: item.stackId,
          title: item.title,
          notes: item.notes ?? '',
          status,
          priority:
            item.priority === 'low' || item.priority === 'medium' || item.priority === 'high'
              ? item.priority
              : 'medium',
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

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    workspace,
    members,
    stacks,
    items,
    activities,
  };
}

/**
 * Pure helper checking whether `memberId` is involved in `item` — either as a primary/co-assignee
 * on the task (`assigneeIds` / `assigneeId`) OR assigned to at least one subtask (`subtask.assigneeId`).
 */
export function isMemberInvolvedInItem(item: ChecklistItem, memberId: string): boolean {
  if (!memberId) return false;
  if (Array.isArray(item.assigneeIds) && item.assigneeIds.includes(memberId)) {
    return true;
  }
  if (item.assigneeId === memberId) {
    return true;
  }
  if (Array.isArray(item.subtasks) && item.subtasks.some((sub) => sub.assigneeId === memberId)) {
    return true;
  }
  return false;
}
