import type {
  JoinCodePreview,
  PendingEmailInvitation,
  ProjectJoinLinkInfo,
} from '../../core/domain/accountProject';
import {
  ConfigureJoinLinkInputSchema,
  extractJoinCode,
  JoinCodeInputSchema,
  UpdateMemberRoleInputSchema,
  UpdateMyProfileInputSchema,
} from '../../core/domain/accountSchemas';
import { detectPlatform } from '../../core/domain/stackDomain';
import type { Member, PresencePeer } from '../../types/models';
import { accountClient, checkDbError } from './accountProjectMutations';

const PENDING_JOIN_STORAGE_KEY = 'stackflow_v3_pending_join_code';

interface PendingInvitationRow {
  id: string;
  invited_email: string;
  invited_job_title: string;
  access_role: 'owner' | 'member';
  expires_at: string;
  created_at: string;
}

interface JoinLinkRow {
  project_id: string;
  join_code: string;
  enabled: boolean;
  default_job_title: string;
  expires_at: string | null;
  use_count: number;
}

interface JoinPreviewRow {
  project_id: string;
  project_code: string;
  project_name: string;
  default_job_title: string;
  already_member: boolean;
}

function mapJoinLinkRow(row: JoinLinkRow): ProjectJoinLinkInfo {
  return {
    projectId: row.project_id,
    joinCode: row.join_code,
    enabled: row.enabled,
    defaultJobTitle: row.default_job_title ?? '',
    expiresAt: row.expires_at,
    useCount: row.use_count ?? 0,
  };
}

export function capturePendingJoinCodeFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromUrl = extractJoinCode(window.location.search);
    if (fromUrl) {
      window.sessionStorage.setItem(PENDING_JOIN_STORAGE_KEY, fromUrl);
      return fromUrl;
    }
    const stored = window.sessionStorage.getItem(PENDING_JOIN_STORAGE_KEY);
    return stored ? extractJoinCode(stored) : null;
  } catch {
    return null;
  }
}

export function clearPendingJoinCode(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(PENDING_JOIN_STORAGE_KEY);
    const url = new URL(window.location.href);
    if (url.searchParams.has('join')) {
      url.searchParams.delete('join');
      const next = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState({}, '', next);
    }
  } catch {
    // Ignore storage/history restrictions in sandboxed webviews
  }
}

export const accountTeamInviteRepository = {
  async listPendingInvitations(projectId: string): Promise<PendingEmailInvitation[]> {
    const { data, error } = await accountClient().rpc('list_project_pending_invitations', {
      p_project_id: projectId,
    });
    checkDbError(error);
    return ((data ?? []) as PendingInvitationRow[]).map((row) => ({
      id: row.id,
      invitedEmail: row.invited_email,
      invitedJobTitle: row.invited_job_title ?? '',
      accessRole: row.access_role,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    }));
  },

  async revokeInvitation(invitationId: string): Promise<void> {
    const { error } = await accountClient().rpc('revoke_project_invitation', {
      p_invitation_id: invitationId,
    });
    checkDbError(error);
  },

  async declineInvitation(invitationId: string): Promise<void> {
    const { error } = await accountClient().rpc('decline_project_invitation', {
      p_invitation_id: invitationId,
    });
    checkDbError(error);
  },

  async getJoinLink(projectId: string): Promise<ProjectJoinLinkInfo> {
    const { data, error } = await accountClient().rpc('get_project_join_link', {
      p_project_id: projectId,
    });
    checkDbError(error);
    const rows = (data ?? []) as JoinLinkRow[];
    if (rows.length === 0) throw new Error('Không tải được đường dẫn mời của dự án.');
    return mapJoinLinkRow(rows[0]!);
  },

  async configureJoinLink(input: {
    projectId: string;
    enabled: boolean;
    regenerate?: boolean;
    defaultJobTitle?: string;
    expiresInDays?: number;
  }): Promise<ProjectJoinLinkInfo> {
    const parsed = ConfigureJoinLinkInputSchema.parse(input);
    const { data, error } = await accountClient().rpc('configure_project_join_link', {
      p_project_id: parsed.projectId,
      p_enabled: parsed.enabled,
      p_regenerate: parsed.regenerate ?? false,
      p_default_job_title: parsed.defaultJobTitle ?? null,
      p_expires_in_days: parsed.expiresInDays ?? null,
    });
    checkDbError(error);
    const rows = (data ?? []) as JoinLinkRow[];
    if (rows.length === 0) throw new Error('Không thể cập nhật đường dẫn mời nhóm.');
    return mapJoinLinkRow(rows[0]!);
  },

  async previewByJoinCode(rawCodeOrUrl: string): Promise<JoinCodePreview | null> {
    const joinCode = JoinCodeInputSchema.parse(rawCodeOrUrl);
    const { data, error } = await accountClient().rpc('preview_project_by_join_code', {
      p_join_code: joinCode,
    });
    checkDbError(error);
    const rows = (data ?? []) as JoinPreviewRow[];
    if (rows.length === 0) return null;
    const row = rows[0]!;
    return {
      projectId: row.project_id,
      projectCode: row.project_code,
      projectName: row.project_name,
      defaultJobTitle: row.default_job_title ?? '',
      alreadyMember: Boolean(row.already_member),
    };
  },

  async joinByCode(rawCodeOrUrl: string, jobTitle: string = ''): Promise<string> {
    const joinCode = JoinCodeInputSchema.parse(rawCodeOrUrl);
    const { data, error } = await accountClient().rpc('join_project_by_code', {
      p_join_code: joinCode,
      p_job_title: jobTitle.trim(),
    });
    checkDbError(error);
    return data as string;
  },

  async updateMyProfile(input: {
    projectId: string;
    displayName: string;
    jobTitle: string;
    avatarColor: string;
  }): Promise<void> {
    const parsed = UpdateMyProfileInputSchema.parse(input);
    const { error } = await accountClient().rpc('update_my_project_profile', {
      p_project_id: parsed.projectId,
      p_display_name: parsed.displayName,
      p_job_title: parsed.jobTitle,
      p_avatar_color: parsed.avatarColor,
    });
    checkDbError(error);
  },

  async updateMemberRole(input: {
    projectId: string;
    memberId: string;
    jobTitle: string;
  }): Promise<void> {
    const parsed = UpdateMemberRoleInputSchema.parse(input);
    const { error } = await accountClient().rpc('update_project_member_role', {
      p_project_id: parsed.projectId,
      p_member_id: parsed.memberId,
      p_job_title: parsed.jobTitle,
    });
    checkDbError(error);
  },

  subscribePresence(
    projectId: string,
    selfMember: Member | null,
    onPeers: (peers: PresencePeer[]) => void,
  ): () => void {
    const supabase = accountClient();
    const key = selfMember?.id ?? `observer-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase.channel(`presence-v3:${projectId}`, {
      config: { presence: { key } },
    });

    const syncPeers = () => {
      const state = channel.presenceState<PresencePeer>();
      const seen = new Map<string, PresencePeer>();
      for (const entries of Object.values(state)) {
        for (const item of entries) {
          if (item && typeof item.memberId === 'string') {
            seen.set(item.memberId, item);
          }
        }
      }
      onPeers([...seen.values()]);
    };

    channel
      .on('presence', { event: 'sync' }, syncPeers)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && selfMember) {
          void channel.track({
            memberId: selfMember.id,
            name: selfMember.name,
            color: selfMember.color,
            role: selfMember.role,
            platform: detectPlatform(),
            lastSeenAt: new Date().toISOString(),
          } satisfies PresencePeer);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  },
};
