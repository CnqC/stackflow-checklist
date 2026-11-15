import type { ProjectStack, ProjectSubtask, ProjectTask } from '../../core/domain/accountProject';
import { getAccountSupabaseClient } from '../../services/supabaseConfig';

export class VersionConflictError extends Error {
  constructor() {
    super('Dữ liệu vừa được người khác thay đổi. Hãy tải lại rồi thử tiếp.');
    this.name = 'VersionConflictError';
  }
}

export function accountClient() {
  const value = getAccountSupabaseClient();
  if (!value) throw new Error('Chưa cấu hình kết nối dữ liệu nhóm.');
  return value;
}

export function checkDbError(error: { message: string; code?: string } | null): void {
  if (!error) return;
  if (error.code === '40001') throw new VersionConflictError();
  throw new Error(error.message);
}

export async function versionedUpdate(
  table: 'stacks' | 'tasks' | 'subtasks' | 'task_links',
  id: string,
  version: number,
  patch: Record<string, unknown>,
): Promise<number> {
  const { data, error } = await accountClient()
    .from(table)
    .update(patch)
    .eq('id', id)
    .eq('version', version)
    .select('version')
    .maybeSingle();
  checkDbError(error);
  if (!data) throw new VersionConflictError();
  return data.version as number;
}

export async function versionedDelete(
  table: 'stacks' | 'tasks' | 'subtasks' | 'task_links',
  id: string,
  version: number,
): Promise<void> {
  const { data, error } = await accountClient()
    .from(table)
    .delete()
    .eq('id', id)
    .eq('version', version)
    .select('id')
    .maybeSingle();
  checkDbError(error);
  if (!data) throw new VersionConflictError();
}

export const accountProjectMutations = {
  async addStack(input: {
    projectId: string;
    title: string;
    description: string;
    color: string;
    sequentialLock: boolean;
    priority: ProjectStack['priority'];
  }): Promise<void> {
    const { error } = await accountClient().rpc('create_stack', {
      p_project_id: input.projectId,
      p_title: input.title,
      p_description: input.description,
      p_color: input.color,
      p_sequential_lock: input.sequentialLock,
      p_priority: input.priority,
    });
    checkDbError(error);
  },
  async moveStack(id: string, version: number, direction: 'up' | 'down'): Promise<void> {
    const { error } = await accountClient().rpc('move_stack', {
      p_stack_id: id,
      p_direction: direction,
      p_expected_version: version,
    });
    checkDbError(error);
  },
  async updateStack(id: string, version: number, patch: Partial<ProjectStack>): Promise<void> {
    await versionedUpdate('stacks', id, version, patch);
  },
  async deleteStack(id: string, version: number): Promise<void> {
    await versionedDelete('stacks', id, version);
  },
  async addTask(input: {
    projectId: string;
    stackId: string;
    title: string;
    notes?: string;
    priority?: ProjectTask['priority'];
    dueDate?: string | null;
    assigneeIds: string[];
  }): Promise<void> {
    const { error } = await accountClient().rpc('create_task_with_assignees', {
      p_project_id: input.projectId,
      p_stack_id: input.stackId,
      p_title: input.title,
      p_notes: input.notes ?? '',
      p_priority: input.priority ?? 'medium',
      p_due_date: input.dueDate ?? null,
      p_assignee_member_ids: input.assigneeIds,
    });
    checkDbError(error);
  },
  async updateTask(id: string, version: number, patch: Partial<ProjectTask>): Promise<number> {
    return versionedUpdate('tasks', id, version, patch);
  },
  async deleteTask(id: string, version: number): Promise<void> {
    await versionedDelete('tasks', id, version);
  },
  async moveTask(id: string, version: number, direction: 'up' | 'down'): Promise<void> {
    const { error } = await accountClient().rpc('move_task', {
      p_task_id: id,
      p_direction: direction,
      p_expected_version: version,
    });
    checkDbError(error);
  },
  async setTaskAssignees(id: string, version: number, assigneeIds: string[]): Promise<number> {
    const { data, error } = await accountClient().rpc('set_task_assignees', {
      p_task_id: id,
      p_expected_version: version,
      p_assignee_member_ids: assigneeIds,
    });
    checkDbError(error);
    return Number(data);
  },
  async addSubtask(input: {
    projectId: string;
    taskId: string;
    title: string;
    assigneeId: string | null;
    id?: string;
  }): Promise<void> {
    const { error } = await accountClient().from('subtasks').insert({
      ...(input.id ? { id: input.id } : {}),
      project_id: input.projectId,
      task_id: input.taskId,
      title: input.title,
      assignee_member_id: input.assigneeId,
    });
    checkDbError(error);
  },
  async updateSubtask(id: string, version: number, patch: Partial<ProjectSubtask>): Promise<void> {
    await versionedUpdate('subtasks', id, version, patch);
  },
  async deleteSubtask(id: string, version: number): Promise<void> {
    await versionedDelete('subtasks', id, version);
  },
  async addTaskLink(projectId: string, taskId: string, label: string, url: string, id?: string): Promise<void> {
    const { error } = await accountClient().from('task_links').insert({
      ...(id ? { id } : {}),
      project_id: projectId,
      task_id: taskId,
      label,
      url,
    });
    checkDbError(error);
  },
  async deleteTaskLink(id: string, version: number): Promise<void> {
    await versionedDelete('task_links', id, version);
  },
  async markNoticeRead(id: string): Promise<void> {
    const { error } = await accountClient().rpc('mark_assignment_notice_read', { p_notice_id: id });
    checkDbError(error);
  },
};
