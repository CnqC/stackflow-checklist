import { ArrowLeft, Layers, LogOut, PanelLeftClose, PanelLeftOpen, Plus, Settings2, Share2 } from 'lucide-react';
import type { ProjectData, ProjectStack } from '../../core/domain/accountProject';
import { getInitials, MEMBER_PALETTE } from '../../core/domain/stackDomain';
import type { PresencePeer } from '../../types/models';

interface Props {
  data: ProjectData;
  stacks: ProjectStack[];
  currentUserId: string;
  canWrite: boolean;
  online: boolean;
  peers: PresencePeer[];
  leftSidebarOpen: boolean;
  memberFilterId: string | null;
  onToggleLeftSidebar: () => void;
  onOpenInviteModal: () => void;
  onShowAddStack: () => void;
  onSelectMemberFilter: (memberId: string | null) => void;
  onOpenSettings: () => void;
  onBackToProjects: () => void;
  onSignOut: () => void;
}

export function WorkspaceLeftSidebar({
  data, stacks, currentUserId, canWrite, online, peers, leftSidebarOpen, memberFilterId,
  onToggleLeftSidebar, onOpenInviteModal, onShowAddStack, onSelectMemberFilter, onOpenSettings, onBackToProjects, onSignOut,
}: Props) {
  const completedCount = data.tasks.filter((t) => t.completed).length;
  const doingCount = data.tasks.filter((t) => !t.completed && t.status === 'doing').length;
  const blockedCount = data.tasks.filter((t) => !t.completed && t.status === 'blocked').length;
  const progress = data.tasks.length ? Math.round((completedCount / data.tasks.length) * 100) : 0;
  const activeMembers = data.members.filter((m) => m.active);
  const onlineMemberIds = new Set(peers.map((p) => p.memberId));

  return (
    <aside className={`hidden border-r border-slate-800 bg-slate-950/90 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:overflow-y-auto ${leftSidebarOpen ? 'p-4' : 'items-center p-2'}`}>
      <div className={`flex items-center ${leftSidebarOpen ? 'justify-between gap-2' : 'flex-col gap-3'}`}>
        <button type="button" onClick={onBackToProjects} title="Đổi dự án" className={`flex min-w-0 items-center gap-2.5 text-left cursor-pointer ${leftSidebarOpen ? 'flex-1' : ''}`}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 shadow-lg shadow-indigo-500/20">
            <Layers className="h-5 w-5 text-white" />
          </span>
          {leftSidebarOpen && (
            <span className="min-w-0">
              <span className="block truncate font-mono text-[10px] font-bold uppercase tracking-wider text-indigo-300">{data.project.code}</span>
              <span className="mt-0.5 block truncate text-sm font-extrabold text-foreground">{data.project.name}</span>
            </span>
          )}
        </button>
        {leftSidebarOpen && (
          <button type="button" onClick={onOpenInviteModal} aria-label="Mời thành viên vào dự án" title="Lấy Link mời Zalo / Mời Gmail" className="rounded-xl border border-slate-800 bg-slate-900 p-2 text-indigo-300 hover:border-indigo-500/50 hover:bg-slate-800 cursor-pointer">
            <Share2 className="h-4 w-4" />
          </button>
        )}
        <button type="button" onClick={onToggleLeftSidebar} aria-label={leftSidebarOpen ? 'Ẩn thanh bên trái' : 'Mở thanh bên trái'} className="rounded-xl border border-slate-800 p-2 text-slate-400 hover:bg-slate-900 hover:text-foreground cursor-pointer">
          {leftSidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </button>
      </div>

      {leftSidebarOpen && (
        <>
          <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/90 p-4" aria-label="Tiến độ toàn dự án">
            <p className="text-xs text-slate-400">Tiến độ toàn dự án</p>
            <div className="mt-1 flex items-end justify-between">
              <strong className="text-2xl font-extrabold text-foreground">{progress}%</strong>
              <span className="text-xs text-slate-400">{completedCount}/{data.tasks.length} mục</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-950">
              <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-3.5 grid grid-cols-3 gap-2 text-center text-[11px]">
              <div className="rounded-xl border border-slate-800/80 bg-slate-950 p-2"><span className="block font-bold text-emerald-400">{completedCount}</span>Đã xong</div>
              <div className="rounded-xl border border-slate-800/80 bg-slate-950 p-2"><span className="block font-bold text-sky-400">{doingCount}</span>Đang làm</div>
              <div className="rounded-xl border border-slate-800/80 bg-slate-950 p-2"><span className="block font-bold text-rose-400">{blockedCount}</span>Đang kẹt</div>
            </div>
          </section>

          <div className="mt-6 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Các tầng Stack ({stacks.length})</p>
            {canWrite && (
              <button type="button" onClick={onShowAddStack} className="inline-flex items-center gap-0.5 text-[11px] font-bold text-indigo-300 hover:text-indigo-200 cursor-pointer">
                <Plus className="h-3.5 w-3.5" /> Thêm Stack
              </button>
            )}
          </div>

          <nav className="mt-2 space-y-1.5">
            {stacks.map((stack) => {
              const stackTasks = data.tasks.filter((t) => t.stack_id === stack.id);
              const pct = stackTasks.length ? Math.round((stackTasks.filter((t) => t.completed).length / stackTasks.length) * 100) : 0;
              return (
                <button key={stack.id} type="button" onClick={() => document.getElementById(`stack-${stack.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="flex w-full items-center gap-2 rounded-xl border border-slate-800/90 bg-slate-900/70 px-3 py-2 text-left text-xs text-slate-200 transition hover:border-indigo-500/60 cursor-pointer">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: stack.color }} />
                  <span className="min-w-0 flex-1 truncate font-medium">{stack.title}</span>
                  <span className="font-mono text-[11px] text-slate-400">{pct}%</span>
                </button>
              );
            })}
          </nav>

          <p className="mt-6 text-[11px] font-bold uppercase tracking-wider text-slate-400">Thành viên ({activeMembers.length}/20)</p>
          <div className="mt-2 space-y-1">
            {activeMembers.map((m, idx) => {
              const color = m.avatar_color || MEMBER_PALETTE[idx % MEMBER_PALETTE.length]!;
              const isOnline = onlineMemberIds.has(m.id) || m.user_id === currentUserId;
              const openCount = data.assignees.filter((e) => e.member_id === m.id && data.tasks.some((t) => t.id === e.task_id && !t.completed)).length;
              return (
                <button type="button" key={m.id} aria-pressed={memberFilterId === m.id} onClick={() => onSelectMemberFilter(memberFilterId === m.id ? null : m.id)} className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs transition cursor-pointer ${memberFilterId === m.id ? 'bg-indigo-500/20 text-indigo-100 ring-1 ring-indigo-500/40' : 'text-slate-300 hover:bg-slate-900'}`}>
                  <span style={{ backgroundColor: color }} className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[11px] font-extrabold text-white">
                    {getInitials(m.display_name)}
                    {isOnline && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-foreground">{m.display_name}{m.user_id === currentUserId ? ' (Bạn)' : ''}</span>
                    <span className="block truncate text-[10px] text-slate-400">{m.job_title || (m.access_role === 'owner' ? 'Chủ dự án' : 'Thành viên')}</span>
                  </span>
                  <span className="rounded-md border border-slate-800 bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">{openCount} việc</span>
                </button>
              );
            })}
          </div>

          <div className="mt-auto space-y-2.5 border-t border-slate-800 pt-4">
            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-2 text-xs">
              <span className="flex items-center gap-2 font-medium text-slate-200">
                <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                {online ? 'Google Cloud: Trực tuyến' : 'Tạm ngoại tuyến'}
              </span>
              <button type="button" onClick={onOpenSettings} className="inline-flex items-center gap-1 font-semibold text-indigo-300 hover:text-indigo-200 cursor-pointer">
                <Settings2 className="h-3.5 w-3.5" /> Cài đặt
              </button>
            </div>
            <div className="flex items-center justify-between px-1 text-xs text-slate-400">
              <button type="button" onClick={onBackToProjects} className="inline-flex items-center gap-1.5 hover:text-foreground cursor-pointer">
                <ArrowLeft className="h-3.5 w-3.5" /> Đổi dự án
              </button>
              <button type="button" onClick={onSignOut} className="inline-flex items-center gap-1.5 hover:text-rose-300 cursor-pointer">
                <LogOut className="h-3.5 w-3.5" /> Thoát
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
