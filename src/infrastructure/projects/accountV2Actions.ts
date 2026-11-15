import type { ProjectData, ProjectTask } from '../../core/domain/accountProject';
import type { ChecklistItem } from '../../types/models';
import { accountProjectRepository } from './accountProjectRepository';

type V2ItemPatch = Partial<Pick<ChecklistItem,
  'title' | 'notes' | 'status' | 'priority' | 'assigneeId' | 'assigneeIds' |
  'dueDate' | 'subtasks' | 'links' | 'stackId'>>;

/** Translate V2 drawer edits into the account repository's versioned writes. */
export async function saveV2Item(data: ProjectData, itemId: string, patch: V2ItemPatch, expectedVersion?: number): Promise<number> {
  const task = data.tasks.find((entry) => entry.id === itemId);
  if (!task) throw new Error('Đầu việc không còn tồn tại.');
  if (expectedVersion !== undefined && task.version !== expectedVersion) {
    throw new Error('Đầu việc đã được cập nhật ở nơi khác. Hãy đóng và mở lại để xem bản mới.');
  }
  if (patch.links?.some((link) => {
    const saved = data.links.find((entry) => entry.id === link.id && entry.task_id === task.id);
    return saved && (saved.label !== link.label || saved.url !== link.url);
  })) throw new Error('Để sửa link, hãy xóa link cũ rồi thêm link mới.');

  const taskPatch: Partial<ProjectTask> = {};
  if (patch.title !== undefined && patch.title.trim() !== task.title) taskPatch.title = patch.title.trim();
  if (patch.notes !== undefined && patch.notes !== task.notes) taskPatch.notes = patch.notes;
  if (patch.status !== undefined && patch.status !== task.status) taskPatch.status = patch.status;
  if (patch.priority !== undefined && patch.priority !== task.priority) taskPatch.priority = patch.priority;
  if (patch.dueDate !== undefined && (patch.dueDate || null) !== task.due_date) taskPatch.due_date = patch.dueDate || null;
  if (patch.stackId !== undefined && patch.stackId !== task.stack_id) taskPatch.stack_id = patch.stackId;
  let taskVersion = task.version;
  if (Object.keys(taskPatch).length) {
    taskVersion = await accountProjectRepository.updateTask(task.id, taskVersion, taskPatch);
  }

  if (patch.assigneeIds !== undefined || patch.assigneeId !== undefined) {
    const nextIds = patch.assigneeIds ?? (patch.assigneeId ? [patch.assigneeId] : []);
    const previousIds = data.assignees.filter((entry) => entry.task_id === task.id).map((entry) => entry.member_id);
    if (nextIds.length !== previousIds.length || nextIds.some((id) => !previousIds.includes(id))) {
      taskVersion = await accountProjectRepository.setTaskAssignees(task.id, taskVersion, nextIds);
    }
  }

  if (patch.subtasks) {
    const previous = data.subtasks.filter((entry) => entry.task_id === task.id);
    const nextIds = new Set(patch.subtasks.map((entry) => entry.id));
    for (const subtask of previous) {
      if (!nextIds.has(subtask.id)) await accountProjectRepository.deleteSubtask(subtask.id, subtask.version);
    }
    for (const subtask of patch.subtasks) {
      const saved = previous.find((entry) => entry.id === subtask.id);
      if (!saved) {
        await accountProjectRepository.addSubtask({
          id: subtask.id, projectId: task.project_id, taskId: task.id,
          title: subtask.title, assigneeId: subtask.assigneeId ?? null,
        });
      } else if (saved.title !== subtask.title || saved.assignee_member_id !== (subtask.assigneeId ?? null)) {
        await accountProjectRepository.updateSubtask(saved.id, saved.version, {
          title: subtask.title, assignee_member_id: subtask.assigneeId ?? null,
        });
      }
    }
  }

  if (patch.links) {
    const previous = data.links.filter((entry) => entry.task_id === task.id);
    const nextIds = new Set(patch.links.map((entry) => entry.id));
    for (const link of previous) {
      if (!nextIds.has(link.id)) await accountProjectRepository.deleteTaskLink(link.id, link.version);
    }
    for (const link of patch.links) {
      const saved = previous.find((entry) => entry.id === link.id);
      if (!saved) await accountProjectRepository.addTaskLink(task.project_id, task.id, link.label, link.url, link.id);
    }
  }
  return taskVersion;
}
