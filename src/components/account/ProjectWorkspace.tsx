import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowLeft, CheckSquare2, Filter, PanelRightClose, PanelRightOpen, Search, UserCheck, Users } from 'lucide-react';
import type { ProjectData, ProjectStack, ProjectTable } from '../../core/domain/accountProject';
import { sortProjectStacks, type StackSort } from '../../core/domain/accountStack';
import { toV2WorkspaceSnapshot } from '../../core/domain/accountV2Snapshot';
import type { AccountIdentity } from '../../infrastructure/auth/accountAuthService';
import { useAccountNoticeBridge } from '../../infrastructure/notifications/accountNoticeBridge';
import { accountProjectRepository } from '../../infrastructure/projects/accountProjectRepository';
import { accountTeamInviteRepository } from '../../infrastructure/projects/accountTeamInviteRepository';
import { saveV2Item } from '../../infrastructure/projects/accountV2Actions';
import type { PresencePeer, WorkspaceSnapshot } from '../../types/models';
import { ActivityPanel } from '../ActivityPanel';
import { StackGroupCard } from '../StackGroupCard';
import { TaskDetailDrawer } from '../TaskDetailDrawer';
import { AdminObserverStackList } from './AdminObserverStackList';
import { WorkspaceAddStackForm } from './WorkspaceAddStackForm';
import { WorkspaceLeftSidebar } from './WorkspaceLeftSidebar';
import { WorkspaceTopToolbar } from './WorkspaceTopToolbar';
import { ProjectTeamModal, type TeamModalTab } from './team/ProjectTeamModal';

interface Props {
  projectId: string;
  identity: AccountIdentity;
  onBack: () => void;
  onSignOut: () => void;
  onSettings: () => void;
  onSnapshotChange?: (snapshot: WorkspaceSnapshot | null, memberId: string | null) => void;
}

type TaskFilter = 'all' | 'mine' | 'incomplete' | 'doing' | 'blocked' | 'done';
const SIDEBAR_STORAGE_KEY = 'stackflow_v3_sidebars';
const errText = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

function readSidebarState(): { left: boolean; right: boolean } {
  if (typeof window === 'undefined') return { left: true, right: true };
  try {
    const val = JSON.parse(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) ?? '{}') as { left?: boolean; right?: boolean };
    return { left: val.left !== false, right: val.right !== false };
  } catch { return { left: true, right: true }; }
}

export function ProjectWorkspace({ projectId, identity, onBack, onSignOut, onSettings, onSnapshotChange }: Props) {
  const [data, setData] = useState<ProjectData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [teamModalTab, setTeamModalTab] = useState<TeamModalTab>('roster');
  const [showMobileActivity, setShowMobileActivity] = useState(false);
  const [stackSort, setStackSort] = useState<StackSort>('position');
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [memberFilterId, setMemberFilterId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(() => readSidebarState().left);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(() => readSidebarState().right);
  const [showAddStack, setShowAddStack] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [peers, setPeers] = useState<PresencePeer[]>([]);

  useEffect(() => {
    try { window.localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify({ left: leftSidebarOpen, right: rightSidebarOpen })); }
    catch { /* Ignore */ }
  }, [leftSidebarOpen, rightSidebarOpen]);

  const refresh = useCallback(async () => setData(await accountProjectRepository.loadProject(projectId)), [projectId]);

  useEffect(() => {
    const syncOnline = () => setOnline(navigator.onLine);
    window.addEventListener('online', syncOnline);
    window.addEventListener('offline', syncOnline);
    return () => { window.removeEventListener('online', syncOnline); window.removeEventListener('offline', syncOnline); };
  }, []);

  useEffect(() => {
    let active = true;
    const pending = new Map<ProjectTable, ReturnType<typeof setTimeout>>();
    void accountProjectRepository.loadProject(projectId).then((next) => { if (active) setData(next); }).catch((c: unknown) => { if (active) setError(errText(c)); });
    const unsubscribe = accountProjectRepository.subscribe(projectId, (table) => {
      const prev = pending.get(table);
      if (prev) clearTimeout(prev);
      pending.set(table, setTimeout(() => {
        pending.delete(table);
        void accountProjectRepository.loadTable(projectId, table).then((next) => { if (active) setData((cur) => (cur ? { ...cur, [table]: next } : cur)); }).catch((c: unknown) => { if (active) setError(errText(c)); });
      }, 250));
    });
    return () => { active = false; unsubscribe(); for (const t of pending.values()) clearTimeout(t); };
  }, [projectId]);

  const actor = useMemo(() => data?.members.find((m) => m.user_id === identity.id && m.active) ?? null, [data, identity.id]);
  const v2Snapshot = useMemo(() => (data ? toV2WorkspaceSnapshot(data) : null), [data]);
  const v2Actor = useMemo(() => v2Snapshot?.members.find((m) => m.id === actor?.id), [v2Snapshot, actor]);

  useEffect(() => {
    onSnapshotChange?.(v2Snapshot, actor?.id ?? null);
    return () => onSnapshotChange?.(null, null);
  }, [v2Snapshot, actor?.id, onSnapshotChange]);

  useEffect(() => accountTeamInviteRepository.subscribePresence(projectId, v2Actor ?? null, setPeers), [projectId, v2Actor]);

  const mutate = useCallback(async (action: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true); setError(null);
    try { await action(); await refresh(); return true; }
    catch (c) { setError(errText(c)); await refresh().catch(() => undefined); return false; }
    finally { setBusy(false); }
  }, [refresh]);

  const mutateForV2 = useCallback(async (action: () => Promise<unknown>): Promise<void> => {
    setBusy(true); setError(null);
    try { await action(); await refresh(); }
    catch (c) { setError(errText(c)); await refresh().catch(() => undefined); throw c; }
    finally { setBusy(false); }
  }, [refresh]);

  const openTaskFromNotice = useCallback(async (taskId: string) => {
    const task = data?.tasks.find((e) => e.id === taskId);
    if (!task) { setError('Việc này đã bị xóa hoặc bạn không còn quyền xem.'); return; }
    setFilter('all'); setSearchQuery('');
    const stack = data?.stacks.find((e) => e.id === task.stack_id);
    if (stack?.collapsed) await mutate(() => accountProjectRepository.updateStack(stack.id, stack.version, { collapsed: false }));
    setSelectedTaskId(taskId);
  }, [data, mutate]);

  useAccountNoticeBridge({ projectId, actorMemberId: actor?.id ?? null, serverNotices: data?.notices ?? [], v2Snapshot, onOpenTask: (id) => void openTaskFromNotice(id) });

  useEffect(() => {
    if (!selectedTaskId || !data) return;
    const timer = setTimeout(() => document.getElementById(`task-${selectedTaskId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    return () => clearTimeout(timer);
  }, [selectedTaskId, data]);

  if (!data || !v2Snapshot) {
    return <main className="mx-auto max-w-5xl p-6 text-slate-300"><button type="button" onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-sm cursor-pointer"><ArrowLeft className="h-4 w-4" />Dự án</button>{error ? <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-rose-200">{error}</p> : <p>Đang tải bảng Stack...</p>}</main>;
  }

  const canManageProject = data.project.accessRole === 'owner' || data.project.accessRole === 'global_admin';
  const stacks = sortProjectStacks(data.stacks, stackSort);
  const selectedV2Item = v2Snapshot.items.find((item) => item.id === selectedTaskId) ?? null;
  const mineIds = new Set(data.assignees.filter((e) => e.member_id === actor?.id).map((e) => e.task_id));
  const mySubtaskIds = new Set(data.subtasks.filter((e) => e.assignee_member_id === actor?.id).map((e) => e.task_id));
  const mineCount = data.tasks.filter((t) => !t.completed && (mineIds.has(t.id) || mySubtaskIds.has(t.id))).length;
  const completedCount = data.tasks.filter((t) => t.completed).length;
  const progress = data.tasks.length ? Math.round((completedCount / data.tasks.length) * 100) : 0;
  const query = searchQuery.trim().toLocaleLowerCase('vi');

  const visibleTasks = (stackId: string) => data.tasks.filter((task) => {
    if (task.stack_id !== stackId) return false;
    if (memberFilterId && !data.assignees.some((e) => e.task_id === task.id && e.member_id === memberFilterId) && !data.subtasks.some((e) => e.task_id === task.id && e.assignee_member_id === memberFilterId)) return false;
    if (filter === 'mine' && !(mineIds.has(task.id) || mySubtaskIds.has(task.id))) return false;
    if (filter === 'incomplete' && task.completed) return false;
    if (filter === 'doing' && task.status !== 'doing') return false;
    if (filter === 'blocked' && task.status !== 'blocked') return false;
    if (filter === 'done' && !task.completed) return false;
    if (query && !`${task.title} ${task.notes} ${data.subtasks.filter((s) => s.task_id === task.id).map((s) => s.title).join(' ')}`.toLocaleLowerCase('vi').includes(query)) return false;
    return true;
  }).sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));

  const gridCols = leftSidebarOpen
    ? (rightSidebarOpen ? 'lg:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)_20rem]' : 'lg:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)_3.5rem]')
    : (rightSidebarOpen ? 'lg:grid-cols-[3.5rem_minmax(0,1fr)] xl:grid-cols-[3.5rem_minmax(0,1fr)_20rem]' : 'lg:grid-cols-[3.5rem_minmax(0,1fr)] xl:grid-cols-[3.5rem_minmax(0,1fr)_3.5rem]');

  return (
    <main className={`min-h-dvh bg-slate-950 text-slate-100 lg:grid ${gridCols}`}>
      <WorkspaceLeftSidebar data={data} stacks={stacks} currentUserId={identity.id} canWrite={Boolean(actor)} online={online} peers={peers} leftSidebarOpen={leftSidebarOpen} memberFilterId={memberFilterId} onToggleLeftSidebar={() => setLeftSidebarOpen((v) => !v)} onOpenInviteModal={() => { setTeamModalTab('invites'); setTeamModalOpen(true); }} onShowAddStack={() => setShowAddStack(true)} onSelectMemberFilter={setMemberFilterId} onOpenSettings={onSettings} onBackToProjects={onBack} onSignOut={onSignOut} />

      <div className="min-w-0 w-full px-4 py-5 pb-24 sm:px-6 lg:pb-8 xl:px-8">
        <WorkspaceTopToolbar data={data} v2Snapshot={v2Snapshot} v2Actor={v2Actor} identityName={identity.name} progress={progress} leftSidebarOpen={leftSidebarOpen} peers={peers} searchQuery={searchQuery} onSearchChange={setSearchQuery} onOpenTaskFromNotice={(id) => void openTaskFromNotice(id)} onOpenTeamModal={() => { setTeamModalTab('roster'); setTeamModalOpen(true); }} onOpenSettings={onSettings} onToggleAddStack={() => setShowAddStack((v) => !v)} />

        {data.project.accessRole === 'global_admin' && <p className="mt-4 rounded-xl border border-indigo-500/40 bg-indigo-500/10 p-3 text-sm text-indigo-100">Chế độ theo dõi của admin. Bạn không nằm trong danh sách thành viên đánh dấu công việc.</p>}
        {error && <p role="alert" className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p>}
        {!online && <p role="status" className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">Đang mất kết nối Internet. Hãy kết nối lại để đồng bộ thay đổi lên Google Cloud.</p>}
        {showMobileActivity && <div className="mt-5 lg:hidden"><ActivityPanel activities={v2Snapshot.activities} /></div>}
        {actor && showAddStack && <WorkspaceAddStackForm busy={busy} onClose={() => setShowAddStack(false)} onCreate={(input) => mutate(() => accountProjectRepository.addStack({ projectId, ...input }))} />}

        <section className="mt-5 space-y-3" aria-label="Tìm và lọc công việc">
          {memberFilterId && <button type="button" onClick={() => setMemberFilterId(null)} className="rounded-lg border border-indigo-500/50 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-200 cursor-pointer">Đang lọc: {data.members.find((m) => m.id === memberFilterId)?.display_name ?? 'Thành viên'} · Bỏ lọc</button>}
          <label className="relative block max-w-md lg:hidden"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><span className="sr-only">Tìm kiếm đầu việc</span><input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Tìm kiếm đầu việc hoặc ghi chú..." className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 pl-9 pr-3 text-sm text-foreground" /></label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 overflow-x-auto pb-1"><Filter className="h-4 w-4 shrink-0 text-slate-400" />{([['all', 'Tất cả'], ['mine', `Việc của tôi (${mineCount})`], ['incomplete', 'Chưa xong'], ['doing', 'Đang làm'], ['blocked', 'Đang kẹt'], ['done', 'Hoàn thành']] as [TaskFilter, string][]).map(([val, label]) => <button type="button" key={val} aria-pressed={filter === val} onClick={() => setFilter(val)} className={`shrink-0 rounded-xl border px-3 py-1.5 text-xs font-semibold cursor-pointer ${filter === val ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'}`}>{label}</button>)}</div>
            <label className="flex items-center gap-2 text-xs text-slate-400">Sắp xếp<select value={stackSort} onChange={(e) => setStackSort(e.target.value as StackSort)} className="min-h-8 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-foreground"><option value="position">Thứ tự thủ công</option><option value="priority_high">Ưu tiên cao trước</option><option value="priority_low">Ưu tiên thấp trước</option></select></label>
          </div>
        </section>

        <div className="mt-5 space-y-4">
          {v2Actor && stacks.map((stack, index) => {
            const v2Stack = v2Snapshot.stacks.find((s) => s.id === stack.id)!;
            const stackItems = v2Snapshot.items.filter((item) => item.stackId === stack.id);
            const visibleIds = new Set(visibleTasks(stack.id).map((t) => t.id));
            return <div key={stack.id} id={`stack-${stack.id}`} className="scroll-mt-20 space-y-2">
              <div className="flex justify-end"><select aria-label={`Mức độ ưu tiên của ${stack.title}`} value={stack.priority} disabled={busy} onChange={(e) => void mutate(() => accountProjectRepository.updateStack(stack.id, stack.version, { priority: e.target.value as ProjectStack['priority'] }))} className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300"><option value="low">Ưu tiên thấp</option><option value="medium">Ưu tiên trung bình</option><option value="high">Ưu tiên cao</option></select></div>
              <StackGroupCard stack={v2Stack} stackIndex={index} totalStacks={stacks.length} allStackItems={stackItems} visibleItems={stackItems.filter((i) => visibleIds.has(i.id))} members={v2Snapshot.members} currentMember={v2Actor} allowManualMove={stackSort === 'position'} canDeleteStack={actor?.access_role === 'owner'}
                onToggleItem={(item) => { const saved = data.tasks.find((t) => t.id === item.id); if (saved) void mutate(() => accountProjectRepository.updateTask(saved.id, saved.version, { completed: !saved.completed })); }}
                onSelectItem={(item) => setSelectedTaskId(item.id)}
                onQuickAddItem={(stackId, title, assigneeId, assigneeIds) => mutateForV2(() => accountProjectRepository.addTask({ projectId, stackId, title, assigneeIds: assigneeIds ?? (assigneeId ? [assigneeId] : []) }))}
                onUpdateStack={(id, patch) => { const saved = data.stacks.find((s) => s.id === id); if (saved) void mutate(() => accountProjectRepository.updateStack(id, saved.version, { ...(patch.title !== undefined ? { title: patch.title } : {}), ...(patch.description !== undefined ? { description: patch.description } : {}), ...(patch.sequentialLock !== undefined ? { sequential_lock: patch.sequentialLock } : {}), ...(patch.collapsed !== undefined ? { collapsed: patch.collapsed } : {}) })); }}
                onMoveStack={(id, dir) => { const saved = data.stacks.find((s) => s.id === id); if (saved) void mutate(() => accountProjectRepository.moveStack(id, saved.version, dir)); }}
                onDeleteStack={(id) => { const saved = data.stacks.find((s) => s.id === id); if (saved) void mutate(() => accountProjectRepository.deleteStack(id, saved.version)); }}
                onNotifyBlockedSequence={(title) => setError(`Stack tuần tự: Hãy hoàn thành “${title}” trước.`)} />
            </div>;
          })}
          {!v2Actor && <AdminObserverStackList stacks={stacks} data={data} visibleTasks={visibleTasks} mutate={mutate} />}
          {stacks.length === 0 && <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">Chưa có giai đoạn nào. {actor ? 'Bấm “Thêm Stack mới” để khởi tạo giai đoạn đầu tiên.' : 'Chủ dự án sẽ thêm công việc sau.'}</div>}
        </div>

        {v2Actor && <TaskDetailDrawer item={selectedV2Item} stacks={v2Snapshot.stacks} members={v2Snapshot.members} currentMember={v2Actor} onClose={() => setSelectedTaskId(null)}
          onSaveItem={async (id, patch, expectedVersion) => { let v: number | undefined; await mutateForV2(async () => { const latest = await accountProjectRepository.loadProject(projectId); v = await saveV2Item(latest, id, patch, expectedVersion); }); return v; }}
          onToggleSubtask={async (itemId, subtaskId) => { await mutateForV2(async () => { const latest = await accountProjectRepository.loadProject(projectId); const sub = latest.subtasks.find((s) => s.id === subtaskId && s.task_id === itemId); if (!sub) throw new Error('Phần việc không còn tồn tại.'); await accountProjectRepository.updateSubtask(sub.id, sub.version, { completed: !sub.completed }); }); const updated = await accountProjectRepository.loadProject(projectId); return toV2WorkspaceSnapshot(updated).items.find((i) => i.id === itemId)?.subtasks ?? []; }}
          onDeleteItem={(id) => { const t = data.tasks.find((e) => e.id === id); return t ? mutateForV2(() => accountProjectRepository.deleteTask(t.id, t.version)) : Promise.reject(new Error('Đầu việc không còn tồn tại.')); }}
          onMoveItem={(id, dir) => { const t = data.tasks.find((e) => e.id === id); return t ? mutateForV2(() => accountProjectRepository.moveTask(t.id, t.version, dir)) : Promise.reject(new Error('Đầu việc không còn tồn tại.')); }} />}
      </div>

      <aside className={`hidden border-l border-slate-800 xl:sticky xl:top-0 xl:block xl:h-dvh xl:overflow-y-auto ${rightSidebarOpen ? 'p-5' : 'p-2'}`}>
        <button type="button" onClick={() => setRightSidebarOpen((v) => !v)} aria-label={rightSidebarOpen ? 'Ẩn thanh nhật ký bên phải' : 'Mở thanh nhật ký bên phải'} className={`mb-4 rounded-lg border border-slate-800 p-2 text-slate-400 hover:bg-slate-900 hover:text-foreground cursor-pointer ${rightSidebarOpen ? '' : 'mx-auto block'}`}>{rightSidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}</button>
        {rightSidebarOpen && <ActivityPanel activities={v2Snapshot.activities} />}
      </aside>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-slate-800 bg-slate-950/95 px-2 pb-2 pt-2 backdrop-blur lg:hidden" aria-label="Điều hướng dự án">
        <button type="button" onClick={() => { setFilter('all'); setShowMobileActivity(false); }} className={`flex flex-col items-center gap-1 text-[11px] ${filter === 'all' && !showMobileActivity ? 'text-indigo-300' : 'text-slate-400'}`}><CheckSquare2 className="h-5 w-5" />Checklist</button>
        <button type="button" onClick={() => { setFilter('mine'); setShowMobileActivity(false); }} className={`flex flex-col items-center gap-1 text-[11px] ${filter === 'mine' && !showMobileActivity ? 'text-indigo-300' : 'text-slate-400'}`}><UserCheck className="h-5 w-5" />Của tôi ({mineCount})</button>
        <button type="button" onClick={() => setShowMobileActivity((v) => !v)} className={`flex flex-col items-center gap-1 text-[11px] ${showMobileActivity ? 'text-indigo-300' : 'text-slate-400'}`}><Activity className="h-5 w-5" />Hoạt động</button>
        <button type="button" onClick={() => { setTeamModalTab('roster'); setTeamModalOpen(true); }} className={`flex flex-col items-center gap-1 text-[11px] ${teamModalOpen ? 'text-indigo-300' : 'text-slate-400'}`}><Users className="h-5 w-5" />Nhóm</button>
      </nav>

      <ProjectTeamModal open={teamModalOpen} initialTab={teamModalTab} project={data.project} members={data.members} currentUserId={identity.id} canManageProject={canManageProject} peers={peers} onClose={() => setTeamModalOpen(false)} onRefreshProject={refresh} onFilterByMember={setMemberFilterId} />
    </main>
  );
}
