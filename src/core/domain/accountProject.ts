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
  avatar_color?: string;
  access_role: 'owner' | 'member';
  active: boolean;
}

export interface PendingEmailInvitation {
  id: string;
  invitedEmail: string;
  invitedJobTitle: string;
  accessRole: 'owner' | 'member';
  expiresAt: string;
  createdAt: string;
}

export interface ProjectJoinLinkInfo {
  projectId: string;
  joinCode: string;
  enabled: boolean;
  defaultJobTitle: string;
  expiresAt: string | null;
  useCount: number;
}

export interface JoinCodePreview {
  projectId: string;
  projectCode: string;
  projectName: string;
  defaultJobTitle: string;
  alreadyMember: boolean;
}

export interface ProjectStack {
  id: string;
  project_id: string;
  title: string;
  description: string;
  color: string;
  priority: 'low' | 'medium' | 'high';
  position: number;
  sequential_lock: boolean;
  collapsed: boolean;
  version: number;
  created_at: string;
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
  created_at: string;
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

export interface ProjectTaskLink {
  id: string;
  project_id: string;
  task_id: string;
  label: string;
  url: string;
  position: number;
  version: number;
}

export interface ProjectActivity {
  id: string;
  project_id: string;
  actor_user_id?: string | null;
  actor_name: string;
  action_type: string;
  target_title: string;
  detail: string;
  created_at: string;
}

export interface ProjectNotice {
  id: string;
  project_id: string;
  recipient_member_id: string;
  actor_name: string;
  kind: 'task_assigned' | 'subtask_assigned';
  task_id: string;
  task_title: string;
  subtask_title: string | null;
  created_at: string;
  read_at: string | null;
}

export interface ProjectData {
  project: AccountProject;
  members: ProjectMember[];
  stacks: ProjectStack[];
  tasks: ProjectTask[];
  assignees: TaskAssignee[];
  subtasks: ProjectSubtask[];
  links: ProjectTaskLink[];
  activities: ProjectActivity[];
  notices: ProjectNotice[];
}

export type ProjectTable =
  | 'project'
  | 'members'
  | 'stacks'
  | 'tasks'
  | 'assignees'
  | 'subtasks'
  | 'links'
  | 'activities'
  | 'notices';

export function canManageTask(_task: ProjectTask, actor: ProjectMember | null): boolean {
  return Boolean(actor?.active);
}

export function canToggleTask(
  task: ProjectTask,
  assignees: readonly TaskAssignee[],
  actor: ProjectMember | null,
): boolean {
  return Boolean(
    actor?.active && assignees.some((entry) => entry.task_id === task.id && entry.member_id === actor.id),
  );
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
