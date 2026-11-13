export interface AccountProject {
  id: string;
  code: string;
  name: string;
  description: string;
  version: number;
  accessRole: 'owner' | 'member' | 'global_admin';
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  display_name: string;
  job_title: string;
  access_role: 'owner' | 'member';
  active: boolean;
}

export interface ProjectStack {
  id: string;
  project_id: string;
  title: string;
  description: string;
  color: string;
  position: number;
  sequential_lock: boolean;
  collapsed: boolean;
  version: number;
}

export interface ProjectTask {
  id: string;
  project_id: string;
  stack_id: string;
  title: string;
  notes: string;
  status: 'todo' | 'doing' | 'blocked' | 'done';
  priority: 'low' | 'medium' | 'high';
  completed: boolean;
  due_date: string | null;
  position: number;
  created_by_member_id: string | null;
  completed_by_member_id: string | null;
  version: number;
}

export interface TaskAssignee {
  task_id: string;
  member_id: string;
  project_id: string;
}

export interface ProjectSubtask {
  id: string;
  task_id: string;
  project_id: string;
  title: string;
  position: number;
  assignee_member_id: string | null;
  completed: boolean;
  completed_by_member_id: string | null;
  version: number;
}

export interface ProjectData {
  project: AccountProject;
  members: ProjectMember[];
  stacks: ProjectStack[];
  tasks: ProjectTask[];
  assignees: TaskAssignee[];
  subtasks: ProjectSubtask[];
}

export type ProjectTable = 'project' | 'members' | 'stacks' | 'tasks' | 'assignees' | 'subtasks';

export function canManageTask(task: ProjectTask, actor: ProjectMember | null): boolean {
  return Boolean(actor?.active &&
    (actor.access_role === 'owner' || task.created_by_member_id === actor.id));
}

export function canToggleTask(
  task: ProjectTask,
  assignees: readonly TaskAssignee[],
  actor: ProjectMember | null,
): boolean {
  return Boolean(actor?.active &&
    assignees.some((entry) => entry.task_id === task.id && entry.member_id === actor.id));
}

export function canToggleSubtask(
  subtask: ProjectSubtask,
  assignees: readonly TaskAssignee[],
  actor: ProjectMember | null,
): boolean {
  if (!actor?.active) return false;
  return subtask.assignee_member_id
    ? subtask.assignee_member_id === actor.id
    : assignees.some((entry) => entry.task_id === subtask.task_id && entry.member_id === actor.id);
}
