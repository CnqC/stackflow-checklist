export const MAX_TEAM_MEMBERS = 10;

export type TaskStatus = 'todo' | 'doing' | 'blocked' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';
export type SyncMode = 'supabase' | 'local';

export interface Workspace {
  id: string;
  code: string;
  name: string;
  description: string;
  pinCode: string;
  maxMembers: number;
  createdAt: string;
  updatedAt: string;
}

export interface Member {
  id: string;
  workspaceId: string;
  name: string;
  role: string;
  color: string;
  avatar: string;
  createdAt: string;
}

export interface SubtaskItem {
  id: string;
  title: string;
  completed: boolean;
}

export interface TaskLink {
  id: string;
  label: string;
  url: string;
}

export interface StackGroup {
  id: string;
  workspaceId: string;
  title: string;
  description: string;
  color: string;
  position: number;
  sequentialLock: boolean;
  collapsed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistItem {
  id: string;
  workspaceId: string;
  stackId: string;
  title: string;
  notes: string;
  status: TaskStatus;
  priority: TaskPriority;
  completed: boolean;
  assigneeId: string | null;
  dueDate: string | null;
  position: number;
  subtasks: SubtaskItem[];
  links: TaskLink[];
  completedById: string | null;
  completedByName: string | null;
  completedAt: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityLog {
  id: string;
  workspaceId: string;
  actorId: string | null;
  actorName: string;
  actorColor: string;
  actionType: 'check' | 'uncheck' | 'create_task' | 'update_task' | 'delete_task' | 'create_stack' | 'join_member' | 'status_change';
  targetTitle: string;
  detail: string;
  createdAt: string;
}

export interface PresencePeer {
  memberId: string;
  name: string;
  color: string;
  role: string;
  platform: 'Web' | 'App';
  lastSeenAt: string;
}

export interface WorkspaceSnapshot {
  workspace: Workspace;
  members: Member[];
  stacks: StackGroup[];
  items: ChecklistItem[];
  activities: ActivityLog[];
}

export interface SupabaseRuntimeConfig {
  url: string;
  anonKey: string;
}

export interface StackProgressStats {
  total: number;
  completed: number;
  doing: number;
  blocked: number;
  percentage: number;
}
