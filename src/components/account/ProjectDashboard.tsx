import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, FolderPlus, Layers, LogOut, Settings2, Users } from 'lucide-react';
import type { AccountProject, JoinCodePreview } from '../../core/domain/accountProject';
import type { AccountIdentity } from '../../infrastructure/auth/accountAuthService';
import {
  accountProjectRepository,
  type ProjectInvitation,
} from '../../infrastructure/projects/accountProjectRepository';
import {
  accountTeamInviteRepository,
  capturePendingJoinCodeFromUrl,
  clearPendingJoinCode,
} from '../../infrastructure/projects/accountTeamInviteRepository';
import { DashboardCreateProjectForm } from './DashboardCreateProjectForm';
import { DashboardJoinAndInvites } from './DashboardJoinAndInvites';

interface Props {
  identity: AccountIdentity;
  onOpen: (projectId: string) => void;
  onSignOut: () => void;
  onSettings: () => void;
}

export function ProjectDashboard({ identity, onOpen, onSignOut, onSettings }: Props) {
  const [projects, setProjects] = useState<AccountProject[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [pendingCodeRaw, setPendingCodeRaw] = useState<string | null>(() => capturePendingJoinCodeFromUrl());
  const [pendingCodePreview, setPendingCodePreview] = useState<JoinCodePreview | null>(null);

  const refresh = useCallback(async () => {
    const [nextProjects, nextInvitations, admin] = await Promise.all([
      accountProjectRepository.listProjects(),
      accountProjectRepository.listInvitations(),
      accountProjectRepository.isGlobalAdmin(),
    ]);
    setProjects(nextProjects);
    setInvitations(nextInvitations);
    setIsAdmin(admin);
    return admin;
  }, []);

  useEffect(() => {
    let active = true;
    void refresh()
      .then(async (admin) => {
        if (!active || admin || !pendingCodeRaw) return;
        const preview = await accountTeamInviteRepository.previewByJoinCode(pendingCodeRaw).catch(() => null);
        if (active) setPendingCodePreview(preview);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refresh, pendingCodeRaw]);

  async function runBusy(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative min-h-dvh bg-slate-950 text-foreground">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-36 mx-auto h-80 max-w-3xl rounded-full bg-indigo-600/15 blur-3xl" />

      <div className="relative z-10 mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-9">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 backdrop-blur">
          <div className="flex items-center gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-lg shadow-indigo-500/20">
              <Layers className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-extrabold text-foreground sm:text-xl">Không Gian Dự Án StackFlow</h1>
                <span className="hidden rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300 sm:inline-block">
                  Google Cloud
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {identity.name} · <span className="text-slate-300">{identity.email}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={onSettings} aria-label="Cài đặt" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-indigo-500/50 hover:bg-slate-800 cursor-pointer">
              <Settings2 className="h-4 w-4 text-indigo-400" />
              <span className="hidden sm:inline">Giao diện &amp; Cài đặt</span>
            </button>
            <button type="button" onClick={onSignOut} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer">
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </button>
          </div>
        </header>

        {isAdmin && (
          <div className="mt-5 rounded-2xl border border-indigo-500/40 bg-indigo-500/10 p-4 text-xs text-indigo-100 sm:text-sm">
            Chế độ Quản trị toàn cục: Bạn có thể giám sát mọi dự án và cấu hình thông tin chung, nhưng tách biệt khỏi danh sách thành viên đánh dấu việc.
          </div>
        )}

        {error && <p role="alert" className="mt-5 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 text-sm text-rose-200">{error}</p>}

        <div className="mt-6">
          <DashboardJoinAndInvites
            busy={busy}
            isAdmin={isAdmin}
            pendingCodePreview={pendingCodePreview}
            pendingCodeRaw={pendingCodeRaw}
            invitations={invitations}
            onJoinByCode={(raw, role) =>
              runBusy(async () => {
                const joinedId = await accountTeamInviteRepository.joinByCode(raw, role);
                clearPendingJoinCode();
                setPendingCodeRaw(null);
                setPendingCodePreview(null);
                await refresh();
                onOpen(joinedId);
              })
            }
            onDismissPendingCode={() => {
              clearPendingJoinCode();
              setPendingCodeRaw(null);
              setPendingCodePreview(null);
            }}
            onAcceptInvite={(id) =>
              runBusy(async () => {
                const joinedId = await accountProjectRepository.accept(id);
                await refresh();
                onOpen(joinedId);
              })
            }
            onDeclineInvite={(id) =>
              runBusy(async () => {
                await accountTeamInviteRepository.declineInvitation(id);
                await refresh();
              })
            }
          />
        </div>

        <section className="mt-8" aria-label="Danh sách dự án">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-foreground">{isAdmin ? 'Tất cả dự án hệ thống' : 'Dự án tôi đang tham gia'}</h2>
              <p className="text-xs text-slate-400">Chọn một dự án để vào bảng Stack tuần tự hoặc tạo không gian mới cho nhóm.</p>
            </div>
            <button type="button" onClick={() => setShowCreate((v) => !v)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 cursor-pointer">
              <FolderPlus className="h-4 w-4" />
              Tạo dự án mới
            </button>
          </div>

          {showCreate && (
            <DashboardCreateProjectForm
              busy={busy}
              isAdmin={isAdmin}
              identityName={identity.name}
              onCancel={() => setShowCreate(false)}
              onCreate={(input) =>
                runBusy(async () => {
                  const createdId = await accountProjectRepository.createProject(input);
                  setShowCreate(false);
                  await refresh();
                  onOpen(createdId);
                })
              }
            />
          )}

          {loading ? (
            <p className="text-sm text-slate-400">Đang đồng bộ danh sách dự án...</p>
          ) : projects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-10 text-center text-slate-400">
              <Users className="mx-auto mb-3 h-9 w-9 text-indigo-400/80" />
              <p className="font-semibold text-foreground">Bạn chưa tham gia dự án nào</p>
              <p className="mt-1 text-xs">
                Hãy bấm <strong>Tạo dự án mới</strong> ở góc phải, dán <strong>Mã mời SF-XXXXXX</strong> ở thanh phía trên, hoặc nhờ trưởng nhóm mời email <strong>{identity.email}</strong>.
              </p>
            </div>
          ) : (
            <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <button type="button" key={project.id} onClick={() => onOpen(project.id)} className="group flex min-h-36 flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/90 p-5 text-left transition hover:border-indigo-500/60 hover:bg-slate-900 cursor-pointer">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-md bg-indigo-500/15 px-2 py-0.5 font-mono text-[11px] font-bold text-indigo-300">{project.code}</span>
                      <ArrowUpRight className="h-4 w-4 text-slate-500 transition group-hover:text-indigo-300" />
                    </div>
                    <h3 className="mt-3 text-base font-bold text-foreground group-hover:text-indigo-200">{project.name}</h3>
                    {project.description && <p className="mt-1 line-clamp-2 text-xs text-slate-400">{project.description}</p>}
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-slate-800/80 pt-3 text-[11px]">
                    <span className={project.accessRole === 'owner' ? 'font-semibold text-emerald-300' : 'text-slate-400'}>
                      {project.accessRole === 'global_admin' ? 'Giám sát · Admin' : project.accessRole === 'owner' ? 'Chủ dự án' : 'Thành viên'}
                    </span>
                    <span className="font-semibold text-indigo-300">Mở bảng Stack →</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
