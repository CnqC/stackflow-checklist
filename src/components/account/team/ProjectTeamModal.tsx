import { useCallback, useEffect, useState } from 'react';
import { Download, Share2, Users, X } from 'lucide-react';
import type {
  AccountProject,
  PendingEmailInvitation,
  ProjectJoinLinkInfo,
  ProjectMember,
} from '../../../core/domain/accountProject';
import { translateAccountError } from '../../../core/domain/projectShareLinks';
import { accountProjectRepository } from '../../../infrastructure/projects/accountProjectRepository';
import { accountTeamInviteRepository } from '../../../infrastructure/projects/accountTeamInviteRepository';
import type { PresencePeer } from '../../../types/models';
import { AppInstallTab } from './AppInstallTab';
import { InviteChannelsTab } from './InviteChannelsTab';
import { TeamRosterTab } from './TeamRosterTab';

export type TeamModalTab = 'roster' | 'invites' | 'install';

interface Props {
  open: boolean;
  initialTab?: TeamModalTab;
  project: AccountProject;
  members: ProjectMember[];
  currentUserId: string;
  canManageProject: boolean;
  peers: PresencePeer[];
  onClose: () => void;
  onRefreshProject: () => Promise<unknown>;
  onFilterByMember: (memberId: string) => void;
}

export function ProjectTeamModal({
  open, initialTab = 'roster', project, members, currentUserId, canManageProject, peers,
  onClose, onRefreshProject, onFilterByMember,
}: Props) {
  const [tab, setTab] = useState<TeamModalTab>(initialTab);
  const [busy, setBusy] = useState(false);
  const [loadingInviteMeta, setLoadingInviteMeta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinLink, setJoinLink] = useState<ProjectJoinLinkInfo | null>(null);
  const [pendingInvites, setPendingInvites] = useState<PendingEmailInvitation[]>([]);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  const loadInviteMeta = useCallback(async () => {
    if (!canManageProject) return;
    setLoadingInviteMeta(true);
    setError(null);
    try {
      const [link, pending] = await Promise.all([
        accountTeamInviteRepository.getJoinLink(project.id),
        accountTeamInviteRepository.listPendingInvitations(project.id),
      ]);
      setJoinLink(link);
      setPendingInvites(pending);
    } catch (cause) {
      setError(translateAccountError(cause));
    } finally {
      setLoadingInviteMeta(false);
    }
  }, [canManageProject, project.id]);

  useEffect(() => {
    if (!open || !canManageProject) return;
    void loadInviteMeta();
  }, [open, canManageProject, loadInviteMeta]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const activeCount = members.filter((m) => m.active).length;

  async function runAction(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(translateAccountError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-5"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Quản lý Nhóm, Mời thành viên & Cài đặt App"
        className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-700/90 bg-slate-950 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-base font-extrabold text-foreground sm:text-lg">
              Quản lý Nhóm, Chia sẻ Link &amp; App
            </h2>
            <p className="text-xs text-slate-400">
              {project.name} ({project.code}) • Đăng nhập Google bảo mật
            </p>
          </div>
          <button type="button" aria-label="Đóng cửa sổ nhóm" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-foreground cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div role="tablist" className="grid grid-cols-3 gap-1.5 border-b border-slate-800 bg-slate-900/50 p-2.5">
          {(
            [
              ['roster', `Nhóm (${activeCount}/20)`, Users],
              ['invites', 'Mời thành viên', Share2],
              ['install', 'Cài đặt App', Download],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`inline-flex items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-[11px] font-bold transition sm:gap-1.5 sm:px-3 sm:text-xs cursor-pointer ${
                tab === id
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                  : 'text-slate-400 hover:bg-slate-800/80 hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {error && (
            <p role="alert" className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
              {error}
            </p>
          )}

          {tab === 'roster' && (
            <TeamRosterTab
              project={project}
              members={members}
              currentUserId={currentUserId}
              canManageProject={canManageProject}
              peers={peers}
              busy={busy}
              onQuickOpenInviteTab={() => setTab('invites')}
              onFilterByMember={(memberId) => {
                onFilterByMember(memberId);
                onClose();
              }}
              onUpdateMyProfile={(input) =>
                runAction(async () => {
                  await accountTeamInviteRepository.updateMyProfile({ projectId: project.id, ...input });
                  await onRefreshProject();
                })
              }
              onUpdateMemberRole={(memberId, jobTitle) =>
                runAction(async () => {
                  await accountTeamInviteRepository.updateMemberRole({ projectId: project.id, memberId, jobTitle });
                  await onRefreshProject();
                })
              }
              onToggleMemberActive={(memberId, active) =>
                runAction(async () => {
                  await accountProjectRepository.setMemberActive(project.id, memberId, active);
                  await onRefreshProject();
                })
              }
              onTransferOwner={(memberId, memberName) =>
                runAction(async () => {
                  if (!window.confirm(`Chuyển quyền Chủ dự án cho ${memberName}?`)) return;
                  await accountProjectRepository.transferOwner(project.id, memberId);
                  await onRefreshProject();
                })
              }
              onUpdateProjectInfo={(name, description) =>
                runAction(async () => {
                  await accountProjectRepository.updateProject(project.id, name, description, project.version);
                  await onRefreshProject();
                })
              }
            />
          )}

          {tab === 'invites' && (
            <InviteChannelsTab
              project={project}
              canManageProject={canManageProject}
              busy={busy}
              loadingInviteMeta={loadingInviteMeta}
              joinLink={joinLink}
              pendingInvites={pendingInvites}
              onRetryLoad={() => void loadInviteMeta()}
              onInviteEmail={(email, jobTitle) =>
                runAction(async () => {
                  await accountProjectRepository.invite(project.id, email, jobTitle);
                  await loadInviteMeta();
                })
              }
              onRevokeInvite={(invitationId) =>
                runAction(async () => {
                  await accountTeamInviteRepository.revokeInvitation(invitationId);
                  await loadInviteMeta();
                })
              }
              onConfigureJoinLink={(patch) =>
                runAction(async () => {
                  const updated = await accountTeamInviteRepository.configureJoinLink({
                    projectId: project.id,
                    ...patch,
                  });
                  setJoinLink(updated);
                })
              }
            />
          )}

          {tab === 'install' && <AppInstallTab />}
        </div>
      </section>
    </div>
  );
}
