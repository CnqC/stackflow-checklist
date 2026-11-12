import type { AppNotice, ChecklistItem, SubtaskItem, WorkspaceSnapshot } from '../../types/models';
import { normalizeAssigneeIds } from './dataValidator';

export interface AssignmentCheckpoint {
  workspace: { id: string };
  items: Array<Pick<ChecklistItem, 'id' | 'assigneeId' | 'assigneeIds'> & {
    subtasks: Array<Pick<SubtaskItem, 'id' | 'assigneeId'>>;
  }>;
}

type AssignmentItem = AssignmentCheckpoint['items'][number];

/** Retain only the assignments for this member, enough to detect changes after reopening. */
export function captureAssignmentCheckpoint(
  snapshot: WorkspaceSnapshot,
  memberId: string,
): AssignmentCheckpoint {
  return {
    workspace: { id: snapshot.workspace.id },
    items: snapshot.items.flatMap((item) => {
      const hasTask = resolveEffectiveAssignees(item).includes(memberId);
      const subtasks = item.subtasks
        .filter((subtask) => subtask.assigneeId === memberId)
        .map((subtask) => ({ id: subtask.id, assigneeId: subtask.assigneeId }));
      if (!hasTask && subtasks.length === 0) return [];
      return [{
        id: item.id,
        assigneeId: hasTask ? memberId : null,
        assigneeIds: hasTask ? [memberId] : [],
        subtasks,
      }];
    }),
  };
}

function resolveEffectiveAssignees(item: Pick<ChecklistItem, 'assigneeId' | 'assigneeIds'>): string[] {
  if (Array.isArray(item.assigneeIds) && item.assigneeIds.length > 0) {
    return normalizeAssigneeIds(item.assigneeIds);
  }
  if (Array.isArray(item.assigneeIds) && item.assigneeIds.length === 0 && !item.assigneeId) {
    return [];
  }
  return normalizeAssigneeIds(
    Array.isArray(item.assigneeIds) && item.assigneeIds.length > 0 ? item.assigneeIds : undefined,
    item.assigneeId,
  );
}

function isActorSelf(updatedByName: string | null | undefined, selfName: string | undefined): boolean {
  if (!updatedByName || !selfName) return false;
  return updatedByName.trim().toLowerCase() === selfName.trim().toLowerCase();
}

/**
 * Pure, deterministic diff engine detecting new task & subtask assignments targeted at `currentMemberId`.
 * - Returns `[]` on initial workspace load (`prev === null`) or workspace switch so historical tasks never spam.
 * - Never emits self-notifications when `nextItem.updatedByName` matches `currentMember`'s own name.
 * - Produces deterministic notice IDs so duplicate deliveries never re-trigger popups.
 */
export function detectNewAssignmentNotices(
  prev: AssignmentCheckpoint | WorkspaceSnapshot | null,
  next: WorkspaceSnapshot,
  currentMemberId: string,
): AppNotice[] {
  if (!prev || !currentMemberId) {
    return [];
  }

  if (prev.workspace.id !== next.workspace.id) {
    return [];
  }

  const currentMember = next.members.find((m) => m.id === currentMemberId);

  const prevItemMap = new Map<string, AssignmentItem>();
  for (const pItem of prev.items) {
    prevItemMap.set(pItem.id, pItem);
  }

  const notices: AppNotice[] = [];

  for (const nextItem of next.items) {
    if (isActorSelf(nextItem.updatedByName, currentMember?.name)) {
      continue;
    }

    const actorName = nextItem.updatedByName?.trim() || 'Đồng đội';
    const rawCreatedAt =
      nextItem.updatedAt ||
      nextItem.createdAt ||
      next.workspace.updatedAt ||
      '1970-01-01T00:00:00.000Z';
    const parsedCreatedAt = Date.parse(rawCreatedAt);
    const createdAt = Number.isNaN(parsedCreatedAt)
      ? rawCreatedAt
      : new Date(parsedCreatedAt).toISOString();

    const prevItem = prevItemMap.get(nextItem.id);
    const prevAssignees = prevItem ? resolveEffectiveAssignees(prevItem) : [];
    const nextAssignees = resolveEffectiveAssignees(nextItem);

    const wasAssignedToTask = prevItem ? prevAssignees.includes(currentMemberId) : false;
    const isNowAssignedToTask = nextAssignees.includes(currentMemberId);

    // (a) Brand-new task assigned to currentMemberId OR newly added to assigneeIds on an incomplete task
    if ((!prevItem || !wasAssignedToTask) && isNowAssignedToTask && !nextItem.completed) {
      notices.push({
        id: `notice:task:${next.workspace.id}:${nextItem.id}:${currentMemberId}:${createdAt}`,
        workspaceId: next.workspace.id,
        workspaceCode: next.workspace.code,
        targetMemberId: currentMemberId,
        actorName,
        kind: 'task_assigned',
        taskId: nextItem.id,
        taskTitle: nextItem.title,
        createdAt,
        read: false,
      });
    }

    // (b) Subtask newly created or newly assigned to currentMemberId (and not completed)
    if (Array.isArray(nextItem.subtasks)) {
      for (const sub of nextItem.subtasks) {
        if (sub.assigneeId !== currentMemberId || sub.completed) {
          continue;
        }
        const prevSub = prevItem?.subtasks?.find((s) => s.id === sub.id);
        if (!prevSub || prevSub.assigneeId !== currentMemberId) {
          notices.push({
            id: `notice:subtask:${next.workspace.id}:${nextItem.id}:${sub.id}:${currentMemberId}:${createdAt}`,
            workspaceId: next.workspace.id,
            workspaceCode: next.workspace.code,
            targetMemberId: currentMemberId,
            actorName,
            kind: 'subtask_assigned',
            taskId: nextItem.id,
            taskTitle: nextItem.title,
            subtaskTitle: sub.title,
            createdAt,
            read: false,
          });
        }
      }
    }
  }

  return notices;
}

export const detectAssignmentNotices = detectNewAssignmentNotices;
