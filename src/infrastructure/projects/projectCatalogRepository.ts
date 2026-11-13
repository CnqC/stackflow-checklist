import type { ProjectAccessRole } from '../../core/domain/projectAccess';
import { getSupabaseClient } from '../../services/supabaseConfig';
import { accountAuthService } from '../auth/accountAuthService';

export interface ProjectSummary {
  id: string;
  code: string;
  name: string;
  description: string;
  role: ProjectAccessRole;
}

export interface ProjectInvitation {
  id: string;
  workspaceId: string;
  workspaceCode: string;
  workspaceName: string;
  expiresAt: string;
}

interface InvitationRow {
  invitation_id: string;
  workspace_id: string;
  workspace_code: string;
  workspace_name: string;
  expires_at: string;
}

interface MembershipRow {
  workspace_id: string;
  access_role: 'owner' | 'member';
}

interface WorkspaceRow {
  id: string;
  code: string;
  name: string;
  description: string;
}

export const projectCatalogRepository = {
  async listMyProjects(): Promise<ProjectSummary[]> {
    const client = getSupabaseClient();
    if (!client) throw new Error('Chưa cấu hình Supabase.');

    const identity = await accountAuthService.currentIdentity();
    if (!identity) throw new Error('Vui lòng đăng nhập.');

    const { data: admin, error: adminError } = await client.rpc('is_global_admin');
    if (adminError) throw new Error(`Không kiểm tra được quyền quản trị: ${adminError.message}`);

    const { data: memberships, error: memberError } = await client
      .from('members')
      .select('workspace_id,access_role')
      .eq('user_id', identity.id);
    if (memberError) throw new Error(`Không tải được dự án của bạn: ${memberError.message}`);

    const rows = (memberships ?? []) as MembershipRow[];
    const membershipByWorkspace = new Map(rows.map((row) => [row.workspace_id, row.access_role]));
    if (!admin && membershipByWorkspace.size === 0) return [];

    let query = client.from('workspaces').select('id,code,name,description').order('name');
    if (!admin) query = query.in('id', [...membershipByWorkspace.keys()]);
    const { data: workspaces, error: workspaceError } = await query;
    if (workspaceError) throw new Error(`Không tải được danh sách dự án: ${workspaceError.message}`);

    return ((workspaces ?? []) as WorkspaceRow[]).map((workspace) => ({
      id: workspace.id,
      code: workspace.code,
      name: workspace.name,
      description: workspace.description,
      role: admin ? 'global_admin' : membershipByWorkspace.get(workspace.id) ?? 'member',
    }));
  },

  async listInvitations(): Promise<ProjectInvitation[]> {
    const client = getSupabaseClient();
    if (!client) throw new Error('Chưa cấu hình Supabase.');
    const { data, error } = await client.rpc('list_account_invitations');
    if (error) throw new Error(error.message);
    return ((data ?? []) as InvitationRow[]).map((row) => ({
      id: row.invitation_id,
      workspaceId: row.workspace_id,
      workspaceCode: row.workspace_code,
      workspaceName: row.workspace_name,
      expiresAt: row.expires_at,
    }));
  },

  async acceptInvitation(invitationId: string): Promise<string> {
    const client = getSupabaseClient();
    if (!client) throw new Error('Chưa cấu hình Supabase.');
    const { data, error } = await client.rpc('accept_account_invitation', {
      p_invitation_id: invitationId,
    });
    if (error) throw new Error(error.message);
    if (typeof data !== 'string') throw new Error('Server không trả về ID dự án.');
    return data;
  },

  async createProject(input: {
    code: string;
    name: string;
    description?: string;
    ownerUserId?: string;
  }): Promise<string> {
    const client = getSupabaseClient();
    if (!client) throw new Error('Chưa cấu hình Supabase.');
    const { data, error } = await client.rpc('create_account_project', {
      p_code: input.code,
      p_name: input.name,
      p_description: input.description ?? '',
      p_owner_user_id: input.ownerUserId ?? null,
    });
    if (error) throw new Error(error.message);
    if (typeof data !== 'string') throw new Error('Server không trả về ID dự án.');
    return data;
  },

  async inviteMember(workspaceId: string, email: string): Promise<string> {
    const client = getSupabaseClient();
    if (!client) throw new Error('Chưa cấu hình Supabase.');
    const { data, error } = await client.rpc('invite_account_member', {
      p_workspace_id: workspaceId,
      p_email: email,
    });
    if (error) throw new Error(error.message);
    if (typeof data !== 'string') throw new Error('Server không trả về ID lời mời.');
    return data;
  },
};
