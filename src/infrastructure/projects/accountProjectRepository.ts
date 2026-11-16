import type {
  AccountProject,
  ProjectData,
  ProjectTable,
} from '../../core/domain/accountProject';
import {
  CreateProjectInputSchema,
  InviteMemberEmailSchema,
} from '../../core/domain/accountSchemas';
import { translateAccountError } from '../../core/domain/projectShareLinks';
import { accountAuthService } from '../auth/accountAuthService';
import {
  accountClient,
  accountProjectMutations,
  checkDbError,
  VersionConflictError,
} from './accountProjectMutations';

export { VersionConflictError };

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
  invited_job_title?: string;
  expires_at: string;
}

export interface ProjectInvitation {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  invitedJobTitle?: string;
  expiresAt: string;
}

type RealtimeChannelHandle = ReturnType<ReturnType<typeof accountClient>['channel']>;
const activeProjectChannels = new Map<string, RealtimeChannelHandle>();

export const accountProjectRepository = {
  ...accountProjectMutations,

  async isGlobalAdmin(): Promise<boolean> {
    const { data, error } = await accountClient().rpc('is_global_admin');
    checkDbError(error);
    return data === true;
  },

  async listProjects(): Promise<AccountProject[]> {
    const identity = await accountAuthService.currentIdentity();
    if (!identity) return [];
    const supabase = accountClient();
    const [isAdmin, memberResult] = await Promise.all([
      this.isGlobalAdmin(),
      supabase.from('project_members').select('project_id,access_role').eq('user_id', identity.id).eq('active', true),
    ]);
    checkDbError(memberResult.error);
    const roles = new Map(((memberResult.data ?? []) as MembershipRow[]).map((row) => [row.project_id, row.access_role]));
    if (!isAdmin && roles.size === 0) return [];

    let query = supabase.from('projects').select('id,code,name,description,version').order('name');
    if (!isAdmin) query = query.in('id', [...roles.keys()]);
    const { data, error } = await query;
    checkDbError(error);
    return ((data ?? []) as ProjectRow[]).map((row) => ({
      ...row,
      accessRole: isAdmin ? 'global_admin' : roles.get(row.id) ?? 'member',
    }));
  },

  async listInvitations(): Promise<ProjectInvitation[]> {
    const { data, error } = await accountClient().rpc('list_my_invitations');
    checkDbError(error);
    return ((data ?? []) as InvitationRow[]).map((row) => ({
      id: row.invitation_id,
      projectId: row.project_id,
      projectCode: row.project_code,
      projectName: row.project_name,
      invitedJobTitle: row.invited_job_title ?? '',
      expiresAt: row.expires_at,
    }));
  },

  async createProject(input: {
    code: string;
    name: string;
    description: string;
    ownerEmail?: string;
    jobTitle?: string;
    avatarColor?: string;
  }): Promise<string> {
    let parsed: ReturnType<typeof CreateProjectInputSchema.parse>;
    try { parsed = CreateProjectInputSchema.parse(input); }
    catch (cause) { throw new Error(translateAccountError(cause)); }
    const payload: Record<string, unknown> = {
      p_code: parsed.code,
      p_name: parsed.name,
      p_description: parsed.description,
      p_owner_email: parsed.ownerEmail ?? null,
    };
    if (parsed.jobTitle !== undefined) payload.p_job_title = parsed.jobTitle;
    if (parsed.avatarColor !== undefined) payload.p_avatar_color = parsed.avatarColor;
    const { data, error } = await accountClient().rpc('create_project', payload);
    checkDbError(error);
    return data as string;
  },

  async invite(projectId: string, email: string, jobTitle?: string): Promise<void> {
    let parsed: ReturnType<typeof InviteMemberEmailSchema.parse>;
    try { parsed = InviteMemberEmailSchema.parse({ projectId, email, jobTitle }); }
    catch (cause) { throw new Error(translateAccountError(cause)); }
    const payload: Record<string, unknown> = { p_project_id: parsed.projectId, p_email: parsed.email };
    if (parsed.jobTitle !== undefined) payload.p_job_title = parsed.jobTitle;
    const { error } = await accountClient().rpc('invite_project_member', payload);
    checkDbError(error);
  },

  async setMemberActive(projectId: string, memberId: string, active: boolean): Promise<void> {
    const { error } = await accountClient().rpc('set_project_member_active', {
      p_project_id: projectId,
      p_member_id: memberId,
      p_active: active,
    });
    checkDbError(error);
  },

  async transferOwner(projectId: string, memberId: string): Promise<void> {
    const { error } = await accountClient().rpc('transfer_project_owner', {
      p_project_id: projectId,
      p_new_owner_member_id: memberId,
    });
    checkDbError(error);
  },

  async accept(invitationId: string): Promise<string> {
    const { data, error } = await accountClient().rpc('accept_project_invitation', {
      p_invitation_id: invitationId,
    });
    checkDbError(error);
    return data as string;
  },

  async updateProject(projectId: string, name: string, description: string, expectedVersion: number): Promise<number> {
    const { data, error } = await accountClient().rpc('update_project_info', {
      p_project_id: projectId,
      p_name: name,
      p_description: description,
      p_expected_version: expectedVersion,
    });
    checkDbError(error);
    return data as number;
  },

  async loadTable<T extends ProjectTable>(projectId: string, table: T): Promise<ProjectData[T]> {
    const supabase = accountClient();
    if (table === 'project') {
      const { data, error } = await supabase.from('projects').select('id,code,name,description,version').eq('id', projectId).single();
      checkDbError(error);
      if (!data) throw new Error('Không tìm thấy dự án hoặc bạn không có quyền xem.');
      const projects = await this.listProjects();
      const role = projects.find((project) => project.id === projectId)?.accessRole;
      if (!role) throw new Error('Tài khoản không có quyền vào dự án.');
      return { ...(data as ProjectRow), accessRole: role } as ProjectData[T];
    }
    const tableName =
      table === 'members' ? 'project_members' : table === 'assignees' ? 'task_assignees'
      : table === 'links' ? 'task_links' : table === 'activities' ? 'activity_logs'
      : table === 'notices' ? 'assignment_notices' : table;
    let query = supabase.from(tableName).select('*').eq('project_id', projectId);
    if (table === 'activities' || table === 'notices') query = query.order('created_at', { ascending: false }).limit(100);
    const { data, error } = await query;
    checkDbError(error);
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
    const channel = accountClient().channel(`project-v3:${projectId}`);
    const tables: ReadonlyArray<[ProjectTable, string]> = [
      ['project', 'projects'], ['members', 'project_members'], ['stacks', 'stacks'],
      ['tasks', 'tasks'], ['assignees', 'task_assignees'], ['subtasks', 'subtasks'],
      ['links', 'task_links'], ['activities', 'activity_logs'], ['notices', 'assignment_notices'],
    ];
    for (const [table, databaseTable] of tables) {
      channel.on('postgres_changes', {
        event: '*', schema: 'public', table: databaseTable,
        filter: table === 'project' ? `id=eq.${projectId}` : `project_id=eq.${projectId}`,
      }, () => onChange(table));
    }
    channel.on('broadcast', { event: 'project_mutated' }, () => onChange('project'));
    activeProjectChannels.set(projectId, channel);
    void channel.subscribe();
    return () => {
      if (activeProjectChannels.get(projectId) === channel) {
        activeProjectChannels.delete(projectId);
      }
      void accountClient().removeChannel(channel);
    };
  },

  notifyProjectMutated(projectId: string): void {
    const channel = activeProjectChannels.get(projectId);
    if (!channel) return;
    void channel.send({
      type: 'broadcast',
      event: 'project_mutated',
      payload: { at: Date.now() },
    }).catch(() => undefined);
  },
};
