import { Layers, Plus, Search, Settings2, Users } from 'lucide-react';
import type { ProjectData } from '../../core/domain/accountProject';
import { getInitials } from '../../core/domain/stackDomain';
import type { Member, PresencePeer, WorkspaceSnapshot } from '../../types/models';
import { NotificationBell } from '../NotificationBell';

interface Props {
  data: ProjectData;
  v2Snapshot: WorkspaceSnapshot;
  v2Actor: Member | undefined;
  identityName: string;
  progress: number;
  leftSidebarOpen: boolean;
  peers: PresencePeer[];
  searchQuery: string;
  onSearchChange: (next: string) => void;
  onOpenTaskFromNotice: (taskId: string) => void;
  onOpenTeamModal: () => void;
  onOpenSettings: () => void;
  onToggleAddStack: () => void;
}

export function WorkspaceTopToolbar({
  data,
  v2Snapshot,
  v2Actor,
  identityName,
  progress,
  leftSidebarOpen,
  peers,
  searchQuery,
  onSearchChange,
  onOpenTaskFromNotice,
  onOpenTeamModal,
  onOpenSettings,
  onToggleAddStack,
}: Props) {
  const activeCount = data.members.filter((m) => m.active).length;
  const onlineCount = Math.max(peers.length, v2Actor ? 1 : 0);

  return (
    <header className="sticky top-0 z-30 -mx-4 -mt-5 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 xl:-mx-8 xl:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <div className={`min-w-0 items-center gap-2.5 ${leftSidebarOpen ? 'flex lg:hidden' : 'flex'}`}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 shadow-lg shadow-indigo-500/20">
            <Layers className="h-4.5 w-4.5 text-white" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="max-w-28 truncate text-sm font-bold text-foreground sm:max-w-56">
                {data.project.name}
              </h1>
              <span className="rounded-md bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300">
                {progress}%
              </span>
            </div>
            <p className="truncate font-mono text-[11px] text-slate-400">Mã: {data.project.code}</p>
          </div>
        </div>

        <label className="relative hidden min-w-40 max-w-xl flex-1 lg:block">
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <span className="sr-only">Tìm kiếm đầu việc hoặc ghi chú</span>
          <input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm kiếm đầu việc hoặc ghi chú..."
            className="h-10 w-full rounded-xl border border-slate-800 bg-slate-900 pl-9 pr-3 text-sm text-foreground focus:border-indigo-500 focus:outline-none"
          />
        </label>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <span
            title="Số thành viên đang trực tuyến trực tiếp"
            className="hidden items-center gap-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-300 xl:inline-flex"
          >
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            {onlineCount} online
          </span>

          {v2Actor && (
            <NotificationBell
              snapshot={v2Snapshot}
              memberId={v2Actor.id}
              memberName={v2Actor.name}
              onOpenTask={onOpenTaskFromNotice}
            />
          )}

          <button
            type="button"
            onClick={onOpenTeamModal}
            aria-label="Thành viên và lời mời"
            className="hidden h-10 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-slate-200 hover:border-indigo-500/50 hover:bg-slate-800 lg:inline-flex cursor-pointer"
          >
            <Users className="h-4 w-4 text-indigo-300" />
            <span>Mời nhóm ({activeCount}/20)</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Cài đặt"
            className="hidden h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-indigo-300 hover:bg-slate-800 lg:flex cursor-pointer"
          >
            <Settings2 className="h-4 w-4" />
          </button>

          {v2Actor && (
            <button
              type="button"
              onClick={onToggleAddStack}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 text-xs font-bold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-500 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Thêm Stack mới</span>
              <span className="sm:hidden">Stack</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Cài đặt tài khoản và ứng dụng"
            style={{ backgroundColor: v2Actor?.color ?? '#10b981' }}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[11px] font-bold text-white lg:hidden cursor-pointer"
          >
            {getInitials(v2Actor?.name ?? identityName)}
          </button>
        </div>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-900 lg:hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400"
          style={{ width: `${progress}%` }}
        />
      </div>
    </header>
  );
}
