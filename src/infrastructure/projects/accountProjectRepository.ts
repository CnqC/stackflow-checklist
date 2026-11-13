import type {
  AccountProject,
  ProjectData,
  ProjectStack,
  ProjectSubtask,
  ProjectTable,
  ProjectTask,
} from '../../core/domain/accountProject';
import { getSupabaseClient } from '../../services/supabaseConfig';
import { accountAuthService } from '../auth/accountAuthService';

interface ProjectRow {
  id: string;
  code: string;
  name: string;
  description: string;
  version: number;
}

interface MembershipRow {
  project_id: string;
  access_role: 'owner' | 'member';
}

interface InvitationRow {
  invitation_id: string;
  project_id: string;
  project_code: string;
  project_name: string;
  expires_at: string;
}

export interface ProjectInvitation {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  expiresAt: string;
}

export class VersionConflictError extends Error {
  constructor() {
    super('Dữ liệu vừa được người khác thay đổi. Hãy tải lại rồi thử tiếp.');
    this.name = 'VersionConflictError';
  }
}

function client() {
  const value = getSupabaseClient();
  if (!value) throw new Error('Chưa cấu hình kết nối dữ liệu nhóm.');
  return value;
}

function check(error: { message: string; code?: string } | null): void {
  if (!error) return;
  if (error.code === '40001') throw new VersionConflictError();
  throw new Error(error.message);
}

async function versionedUpdate(
  table: 'stacks' | 'tasks' | 'subtasks' | 'task_links',
  id: string,
  version: number,
  patch: Record<string, unknown>,
): Promise<number> {
  const { data, error } = await client().from(table).update(patch)
    .eq('id', id).eq('version', version).select('version').maybeSingle();
  check(error);
  if (!data) throw new VersionConflictError();
  return data.version as number;
}

async function versionedDelete(
  table: 'stacks' | 'tasks' | 'subtasks' | 'task_links',
  id: string,
  version: number,
): Promise<void> {
  const { data, error } = await client().from(table).delete()
    .eq('id', id).eq('version', version).select('id').maybeSingle();
  check(error);
  if (!data) throw new VersionConflictError();
}

export const accountProjectRepository = {
  async isGlobalAdmin(): Promise<boolean> {
    const { data, error } = await client().rpc('is_global_admin');
    check(error);
    return data === true;
  },

  async listProjects(): Promise<AccountProject[]> {
    const identity = await accountAuthService.currentIdentity();
    if (!identity) return [];
    const supabase = client();
    const [isAdmin, memberResult] = await Promise.all([
      this.isGlobalAdmin(),
      supabase.from('project_members').select('project_id,access_role')
        .eq('user_id', identity.id).eq('active', true),
    ]);
    check(memberResult.error);
    const roles = new Map(((memberResult.data ?? []) as MembershipRow[])
      .map((row) => [row.project_id, row.access_role]));
    if (!isAdmin && roles.size === 0) return [];

    let query = supabase.from('projects').select('id,code,name,description,version').order('name');
    if (!isAdmin) query = query.in('id', [...roles.keys()]);
    const { data, error } = await query;
    check(error);
    return ((data ?? []) as ProjectRow[]).map((row) => ({
      ...row,
      accessRole: isAdmin ? 'global_admin' : roles.get(row.id) ?? 'member',
    }));
  },

  async listInvitations(): Promise<ProjectInvitation[]> {
    const { data, error } = await client().rpc('list_my_invitations');
    check(error);
    return ((data ?? []) as InvitationRow[]).map((row) => ({
      id: row.invitation_id,
      projectId: row.project_id,
      projectCode: row.project_code,
      projectName: row.project_name,
      expiresAt: row.expires_at,
    }));
  },

  async createProject(input: {
    code: string; name: string; description: string; ownerEmail?: string;
  }): Promise<string> {
    const { data, error } = await client().rpc('create_project', {
      p_code: input.code,
      p_name: input.name,
      p_description: input.description,
      p_owner_email: input.ownerEmail ?? null,
    });
    check(error);
    return data as string;
  },

  async invite(projectId: string, email: string): Promise<void> {
    const { error } = await client().rpc('invite_project_member', {
      p_project_id: projectId, p_email: email,
    });
    check(error);
  },

  async setMemberActive(projectId: string, memberId: string, active: boolean): Promise<void> {
    const { error } = await client().rpc('set_project_member_active', {
      p_project_id: projectId, p_member_id: memberId, p_active: active,
    });
    check(error);
  },

  async transferOwner(projectId: string, memberId: string): Promise<void> {
    const { error } = await client().rpc('transfer_project_owner', {
      p_project_id: projectId, p_new_owner_member_id: memberId,
    });
    check(error);
  },

  async accept(invitationId: string): Promise<string> {
    const { data, error } = await client().rpc('accept_project_invitation', {
      p_invitation_id: invitationId,
    });
    check(error);
    return data as string;
  },

  async updateProject(projectId: string, name: string, description: string,
    expectedVersion: number): Promise<number> {
    const { data, error } = await client().rpc('update_project_info', {
      p_project_id: projectId, p_name: name,
      p_description: description, p_expected_version: expectedVersion,
    });
    check(error);
    return data as number;
  },

  async loadTable<T extends ProjectTable>(projectId: string, table: T): Promise<ProjectData[T]> {
    const supabase = client();
    if (table === 'project') {
      const { data, error } = await supabase.from('projects')
        .select('id,code,name,description,version').eq('id', projectId).single();
      check(error);
      if (!data) throw new Error('Không tìm thấy dự án hoặc bạn không có quyền xem.');
      const projects = await this.listProjects();
      const role = projects.find((project) => project.id === projectId)?.accessRole;
      if (!role) throw new Error('Tài khoản không có quyền vào dự án.');
      return { ...(data as ProjectRow), accessRole: role } as ProjectData[T];
    }
    const tableName = table === 'members' ? 'project_members'
      : table === 'assignees' ? 'task_assignees'
        : table === 'links' ? 'task_links'
          : table === 'activities' ? 'activity_logs'
            : table === 'notices' ? 'assignment_notices' : table;
    let query = supabase.from(tableName).select('*').eq('project_id', projectId);
    if (table === 'activities' || table === 'notices') {
      query = query.order('created_at', { ascending: false }).limit(100);
    }
    const { data, error } = await query;
    check(error);
    return (data ?? []) as ProjectData[T];
  },

  async loadProject(projectId: string): Promise<ProjectData> {
    const [project, members, stacks, tasks, assignees, subtasks, links, activities, notices] = await Promise.all([
      this.loadTable(projectId, 'project'),
      this.loadTable(projectId, 'members'),
      this.loadTable(projectId, 'stacks'),
      this.loadTable(projectId, 'tasks'),
      this.loadTable(projectId, 'assignees'),
      this.loadTable(projectId, 'subtasks'),
      this.loadTable(projectId, 'links'),
      this.loadTable(projectId, 'activities'),
      this.loadTable(projectId, 'notices'),
    ]);
    return { project, members, stacks, tasks, assignees, subtasks, links, activities, notices };
  },

  subscribe(projectId: string, onChange: (table: ProjectTable) => void): () => void {
    const channel = client().channel(`project-v3:${projectId}`);
    const tables: ReadonlyArray<[ProjectTable, string]> = [
      ['project', 'projects'], ['members', 'project_members'],
      ['stacks', 'stacks'], ['tasks', 'tasks'],
      ['assignees', 'task_assignees'], ['subtasks', 'subtasks'],
      ['links', 'task_links'],
      ['activities', 'activity_logs'],
      ['notices', 'assignment_notices'],
    ];
    for (const [table, databaseTable] of tables) {
      channel.on('postgres_changes', {
        event: '*', schema: 'public', table: databaseTable,
        filter: table === 'project' ? `id=eq.${projectId}` : `project_id=eq.${projectId}`,
      }, () => onChange(table));
    }
    void channel.subscribe();
    return () => { void client().removeChannel(channel); };
  },

  async addStack(projectId: string, title: string): Promise<void> {
    const { error } = await client().rpc('create_stack', { p_project_id: projectId, p_title: title });
    check(error);
  },
  async moveStack(id: string, version: number, direction: 'up' | 'down'): Promise<void> {
    const { error } = await client().rpc('move_stack', {
      p_stack_id: id, p_direction: direction, p_expected_version: version,
    });
    check(error);
  },
  async updateStack(id: string, version: number, patch: Partial<ProjectStack>): Promise<void> {
    await versionedUpdate('stacks', id, version, patch);
  },
  async deleteStack(id: string, version: number): Promise<void> {
    await versionedDelete('stacks', id, version);
  },

  async addTask(input: {
    projectId: string; stackId: string; title: string; notes?: string;
    priority?: ProjectTask['priority']; dueDate?: string | null; assigneeIds: string[];
  }): Promise<void> {
    const { error } = await client().rpc('create_task_with_assignees', {
      p_project_id: input.projectId,
      p_stack_id: input.stackId,
      p_title: input.title,
      p_notes: input.notes ?? '',
      p_priority: input.priority ?? 'medium',
      p_due_date: input.dueDate ?? null,
      p_assignee_member_ids: input.assigneeIds,
    });
    check(error);
  },
  async updateTask(id: string, version: number, patch: Partial<ProjectTask>): Promise<void> {
    await versionedUpdate('tasks', id, version, patch);
  },
  async deleteTask(id: string, version: number): Promise<void> {
    await versionedDelete('tasks', id, version);
  },
  async moveTask(id: string, version: number, direction: 'up' | 'down'): Promise<void> {
    const { error } = await client().rpc('move_task', {
      p_task_id: id, p_direction: direction, p_expected_version: version,
    });
    check(error);
  },
  async setTaskAssignees(id: string, version: number, assigneeIds: string[]): Promise<void> {
    const { error } = await client().rpc('set_task_assignees', {
      p_task_id: id, p_expected_version: version,
      p_assignee_member_ids: assigneeIds,
    });
    check(error);
  },

  async addSubtask(input: {
    projectId: string; taskId: string; title: string; assigneeId: string | null;
  }): Promise<void> {
    const { error } = await client().from('subtasks').insert({
      project_id: input.projectId,
      task_id: input.taskId,
      title: input.title,
      assignee_member_id: input.assigneeId,
    });
    check(error);
  },
  async updateSubtask(id: string, version: number, patch: Partial<ProjectSubtask>): Promise<void> {
    await versionedUpdate('subtasks', id, version, patch);
  },
  async deleteSubtask(id: string, version: number): Promise<void> {
    await versionedDelete('subtasks', id, version);
  },

  async addTaskLink(projectId: string, taskId: string, label: string, url: string): Promise<void> {
    const { error } = await client().from('task_links').insert({
      project_id: projectId, task_id: taskId, label, url,
    });
    check(error);
  },
  async deleteTaskLink(id: string, version: number): Promise<void> {
    await versionedDelete('task_links', id, version);
  },
  async markNoticeRead(id: string): Promise<void> {
    const { error } = await client().rpc('mark_assignment_notice_read', { p_notice_id: id });
    check(error);
  },
};
