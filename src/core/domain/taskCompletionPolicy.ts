import type { ChecklistItem, SubtaskItem } from '../../types/models';

/** An unassigned task cannot be completed until someone takes responsibility. */
export function canCompleteTask(item: ChecklistItem, memberId: string): boolean {
  return item.assigneeIds.includes(memberId);
}

/** A subtask owner takes precedence; unassigned subtasks belong to the parent owners. */
export function canCompleteSubtask(item: ChecklistItem, subtask: SubtaskItem, memberId: string): boolean {
  return subtask.assigneeId
    ? subtask.assigneeId === memberId
    : canCompleteTask(item, memberId);
}
