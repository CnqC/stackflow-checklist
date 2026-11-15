import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowLeft, CheckSquare2, Filter, Layers, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, Search, Settings2, UserCheck, Users } from 'lucide-react';
import type { ProjectData, ProjectStack, ProjectTable } from '../../core/domain/accountProject';
import { sortProjectStacks, type StackSort } from '../../core/domain/accountStack';
import { toV2WorkspaceSnapshot } from '../../core/domain/accountV2Snapshot';
import type { AccountIdentity } from '../../infrastructure/auth/accountAuthService';
import { accountProjectRepository } from '../../infrastructure/projects/accountProjectRepository';
import { saveV2Item } from '../../infrastructure/projects/accountV2Actions';
import { ActivityPanel } from '../ActivityPanel';
import { StackGroupCard } from '../StackGroupCard';
import { TaskDetailDrawer } from '../TaskDetailDrawer';
import { AccountNoticeBell } from './AccountNoticeBell';
import { AdminObserverStackList } from './AdminObserverStackList';
import { WorkspaceAddStackForm } from './WorkspaceAddStackForm';

interface Props {
  projectId: string;
  identity: AccountIdentity;
  onBack: () => void;
  onSettings: () => void;
}

type TaskFilter = 'all' | 'mine' | 'incomplete' | 'doing' | 'blocked' | 'done';
const SIDEBAR_STORAGE_KEY = 'stackflow_v3_sidebars';

function readSidebarState(): { left: boolean; right: boolean } {
  if (typeof window === 'undefined') return { left: true, right: true };
  try {
    const value = JSON.parse(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) ?? '{}') as { left?: boolean; right?: boolean };
    return { left: value.left !== false, right: value.right !== false };
  } catch { return { left: true, right: true }; }
}

const errText = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

export function ProjectWorkspace({ projectId, identity, onBack, onSettings }: Props) {
  const [data, setData] = useState<ProjectData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [showMobileActivity, setShowMobileActivity] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [stackSort, setStackSort] = useState<StackSort>('position');
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<TaskFilter>('all');
  const [memberFilterId, setMemberFilterId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(() => readSidebarState().left);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(() => readSidebarState().right);
  const [showAddStack, setShowAddStack] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);

  useEffect(() => {
    try { window.localStorage.setItem(SIDEBAR_STORAGE_KEY, JSON.stringify({ left: leftSidebarOpen, right: rightSidebarOpen })); }
    catch { /* Ignore storage unavailability */ }
  }, [leftSidebarOpen, rightSidebarOpen]);

  const refresh = useCallback(async () => setData(await accountProjectRepository.loadProject(projectId)), [projectId]);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => { window.removeEventListener('online', updateOnline); window.removeEventListener('offline', updateOnline); };
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
        void accountProjectRepository.loadTable(projectId, table)
          .then((next) => { if (active) setData((cur) => (cur ? { ...cur, [table]: next } : cur)); })
          .catch((c: unknown) => { if (active) setError(errText(c)); });
      }, 250));
    });
    return () => { active = false; unsubscribe(); for (const t of pending.values()) clearTimeout(t); };
  }, [projectId]);

  const actor = useMemo(() => data?.members.find((m) => m.user_id === identity.id && m.active) ?? null, [data, identity.id]);
  const canManageProject = data?.project.accessRole === 'owner' || data?.project.accessRole === 'global_admin';

  useEffect(() => {
    if (!selectedTaskId || !data) return;
    const timer = setTimeout(() => document.getElementById(`task-${selectedTaskId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    return () => clearTimeout(timer);
  }, [selectedTaskId, data]);

  async function mutate(action: () => Promise<unknown>): Promise<boolean> {
    setBusy(true); setError(null);
    try { await action(); await refresh(); return true; }
    catch (c) { setError(errText(c)); await refresh().catch(() => undefined); return false; }
    finally { setBusy(false); }
  }

  async function mutateForV2(action: () => Promise<unknown>): Promise<void> {
    setBusy(true); setError(null);
    try { await action(); await refresh(); }
    catch (c) { setError(errText(c)); await refresh().catch(() => undefined); throw c; }
    finally { setBusy(false); }
  }

  async function openTaskFromNotice(taskId: string) {
    const task = data?.tasks.find((entry) => entry.id === taskId);
    if (!task) { setError('Việc này đã bị xóa hoặc bạn không còn quyền xem.'); return; }
    setFilter('all'); setSearchQuery('');
    const stack = data?.stacks.find((entry) => entry.id === task.stack_id);
    if (stack?.collapsed) await mutate(() => accountProjectRepository.updateStack(stack.id, stack.version, { collapsed: false }));
    setSelectedTaskId(taskId);
  }

  if (!data) return <main className="mx-auto max-w-5xl p-6 text-slate-300"><button type="button" onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-sm"><ArrowLeft className="h-4 w-4" />Dự án</button>{error ? <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">{error}</p> : <p>Đang tải dự án...</p>}</main>;

  const stacks = sortProjectStacks(data.stacks, stackSort);
  const v2Snapshot = toV2WorkspaceSnapshot(data);
  const v2Actor = v2Snapshot.members.find((m) => m.id === actor?.id);
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

  return <main className={`min-h-dvh bg-slate-950 text-slate-100 lg:grid ${gridCols}`}>
    <aside className={`hidden border-r border-slate-800 bg-slate-950/80 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:overflow-y-auto ${leftSidebarOpen ? 'p-5' : 'items-center p-2'}`}>
      <div className={`flex items-start ${leftSidebarOpen ? 'justify-between gap-2' : 'flex-col items-center gap-3'}`}>
        <button type="button" onClick={onBack} aria-label="Về danh sách dự án" className={`flex min-w-0 items-center gap-2.5 text-left ${leftSidebarOpen ? 'flex-1' : ''}`}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 shadow-lg shadow-indigo-500/20"><Layers className="h-5 w-5 text-white" /></span>{leftSidebarOpen && <span className="min-w-0"><span className="block truncate text-[10px] font-semibold uppercase tracking-wider text-indigo-300">{data.project.code}</span><span className="mt-0.5 block truncate text-sm font-bold text-foreground">{data.project.name}</span></span>}</button>
        <button type="button" onClick={() => setLeftSidebarOpen((v) => !v)} aria-label={leftSidebarOpen ? 'Ẩn thanh bên trái' : 'Mở thanh bên trái'} className="rounded-lg border border-slate-800 p-2 text-slate-400 hover:bg-slate-900 hover:text-foreground">{leftSidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}</button>
      </div>
      {leftSidebarOpen && <>
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-4" aria-label="Tiến độ toàn dự án">
          <p className="text-xs text-slate-400">Tiến độ toàn dự án</p><div className="mt-1 flex items-end justify-between"><strong className="text-2xl text-white">{progress}%</strong><span className="text-xs text-slate-400">{completedCount}/{data.tasks.length} việc</span></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-950"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400" style={{ width: `${progress}%` }} /></div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px]"><div className="rounded-lg bg-slate-950 p-2"><span className="block font-bold text-emerald-400">{completedCount}</span>Đã xong</div><div className="rounded-lg bg-slate-950 p-2"><span className="block font-bold text-sky-400">{data.tasks.filter((t) => t.status === 'doing').length}</span>Đang làm</div><div className="rounded-lg bg-slate-950 p-2"><span className="block font-bold text-rose-400">{data.tasks.filter((t) => t.status === 'blocked').length}</span>Đang kẹt</div></div>
        </section>
        <p className="mt-7 text-xs font-semibold uppercase tracking-wider text-slate-400">Các tầng Stack ({stacks.length})</p>
        <nav className="mt-2 space-y-1">{stacks.map((stack) => { const tasks = data.tasks.filter((t) => t.stack_id === stack.id); const pct = tasks.length ? Math.round((tasks.filter((t) => t.completed).length / tasks.length) * 100) : 0; return <button key={stack.id} type="button" onClick={() => document.getElementById(`stack-${stack.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="flex w-full items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-left text-xs text-slate-200 hover:border-indigo-500"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: stack.color }} /><span className="min-w-0 flex-1 truncate">{stack.title}</span><span className="text-[11px] font-mono text-slate-500">{pct}%</span></button>; })}</nav>
        <p className="mt-7 text-xs font-semibold uppercase tracking-wider text-slate-400">Thành viên ({data.members.filter((m) => m.active).length}/20)</p>
        <div className="mt-2 space-y-1">{data.members.filter((m) => m.active).map((m) => <button type="button" key={m.id} aria-pressed={memberFilterId === m.id} onClick={() => setMemberFilterId((cur) => (cur === m.id ? null : m.id))} className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs ${memberFilterId === m.id ? 'bg-indigo-500/20 text-indigo-100' : 'text-slate-300 hover:bg-slate-900'}`}><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-[10px] font-bold text-white">{m.display_name.slice(0, 2).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{m.display_name}{m.user_id === identity.id ? ' (Bạn)' : ''}</span><span className="block truncate text-[10px] text-slate-500">{m.job_title || (m.access_role === 'owner' ? 'Chủ dự án' : 'Thành viên')}</span></span><span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">{data.assignees.filter((e) => e.member_id === m.id && data.tasks.some((t) => t.id === e.task_id && !t.completed)).length} việc</span></button>)}</div>
        <div className="mt-auto space-y-2 border-t border-slate-800 pt-4"><button type="button" onClick={onSettings} className="flex w-full items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"><Settings2 className="h-4 w-4 text-indigo-300" />Cài đặt</button><button type="button" onClick={onBack} className="flex items-center gap-2 text-xs text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" />Tất cả dự án</button></div>
      </>}
    </aside>

    <div className="min-w-0 w-full px-4 py-5 pb-24 sm:px-6 lg:pb-8 xl:px-8">
      <header className="sticky top-0 z-30 -mx-4 -mt-5 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 xl:-mx-8 xl:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`min-w-0 items-center gap-2.5 ${leftSidebarOpen ? 'flex lg:hidden' : 'flex'}`}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 shadow-lg shadow-indigo-500/20"><Layers className="h-4.5 w-4.5 text-white" /></span><div className="min-w-0"><div className="flex items-center gap-1.5"><h1 className="max-w-28 truncate text-sm font-bold text-foreground sm:max-w-56">{data.project.name}</h1><span className="rounded-md bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300">{progress}%</span></div><p className="truncate text-[11px] text-slate-400">Mã: {data.project.code}</p></div></div>
          <label className="relative hidden min-w-40 max-w-xl flex-1 lg:block"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" /><span className="sr-only">Tìm kiếm đầu việc hoặc ghi chú</span><input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Tìm kiếm đầu việc hoặc ghi chú..." className="h-10 w-full rounded-xl border border-slate-800 bg-slate-900 pl-9 pr-3 text-sm text-foreground focus:border-indigo-500 focus:outline-none" /></label>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            {actor && <AccountNoticeBell projectId={projectId} memberId={identity.id} notices={data.notices} onRead={(id) => void mutate(() => accountProjectRepository.markNoticeRead(id))} onOpenTask={(id) => void openTaskFromNotice(id)} />}
            <button type="button" onClick={() => { setProjectName(data.project.name); setProjectDescription(data.project.description); setShowTeam((v) => !v); }} aria-label="Thành viên và lời mời" className="hidden h-10 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-2.5 text-xs font-semibold text-slate-200 lg:inline-flex xl:px-3"><Users className="h-4 w-4 text-indigo-300" /><span className="hidden xl:inline">Mời nhóm ({data.members.filter((m) => m.active).length}/20)</span></button>
            <button type="button" onClick={onSettings} aria-label="Cài đặt" className="hidden h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-indigo-300 lg:flex"><Settings2 className="h-4 w-4" /></button>
            {actor && <button type="button" onClick={() => setShowAddStack((v) => !v)} className="inline-flex h-10 items-center gap-1 rounded-xl bg-indigo-600 px-2.5 text-xs font-semibold text-white sm:px-3"><Plus className="h-4 w-4" /><span className="hidden sm:inline">Thêm Stack mới</span><span className="sm:hidden">Stack</span></button>}
            <button type="button" onClick={onSettings} aria-label="Cài đặt tài khoản và ứng dụng" className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-[11px] font-bold text-white lg:hidden">{identity.name.slice(0, 2).toUpperCase()}</button>
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-900 lg:hidden"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400" style={{ width: `${progress}%` }} /></div>
      </header>

      {data.project.accessRole === 'global_admin' && <p className="mt-4 rounded-xl border border-indigo-500/40 bg-indigo-500/10 p-3 text-sm text-indigo-100">Chế độ theo dõi của admin. Bạn không ở danh sách thành viên và không thể tạo hoặc đánh dấu việc.</p>}
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      {!online && <p role="status" className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">Đang mất kết nối. Chưa thể lưu thay đổi vào dữ liệu nhóm; hãy kết nối Internet trước khi chỉnh sửa.</p>}
      {showMobileActivity && <div className="mt-5 lg:hidden"><ActivityPanel activities={v2Snapshot.activities} /></div>}

      {showTeam && <section className="mt-5 rounded-2xl border border-slate-700 bg-slate-900 p-4">
        <h2 className="font-semibold text-foreground">Thành viên dự án ({data.members.filter((m) => m.active).length}/20)</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">{data.members.map((m) => <li key={m.id} className="rounded-lg bg-slate-950 p-3 text-sm text-foreground"><button type="button" onClick={() => { setMemberFilterId(m.id); setShowTeam(false); }} className="text-left">{m.display_name}<span className="ml-2 text-xs text-slate-400">{!m.active ? 'Tạm ngưng' : m.access_role === 'owner' ? 'Chủ dự án' : m.job_title || 'Thành viên'}</span></button>{canManageProject && m.access_role !== 'owner' && <div className="mt-2 flex gap-3 text-xs"><button type="button" disabled={busy} onClick={() => void mutate(() => accountProjectRepository.setMemberActive(projectId, m.id, !m.active))} className="text-indigo-300 disabled:opacity-50">{m.active ? 'Tạm ngưng' : 'Kích hoạt lại'}</button>{m.active && <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Chuyển quyền chủ dự án cho ${m.display_name}?`)) void mutate(() => accountProjectRepository.transferOwner(projectId, m.id)); }} className="text-indigo-300 disabled:opacity-50">Chuyển quyền chủ</button>}</div>}</li>)}</ul>
        {canManageProject && <div className="mt-4 space-y-3 border-t border-slate-800 pt-4">
          <form onSubmit={(e) => { e.preventDefault(); void mutate(() => accountProjectRepository.invite(projectId, inviteEmail)).then((ok) => { if (ok) setInviteEmail(''); }); }} className="flex flex-wrap gap-2"><input type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="Email Google của người muốn mời" className="min-h-11 min-w-52 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-foreground" /><button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50">Mời thành viên</button></form>
          <form onSubmit={(e) => { e.preventDefault(); void mutate(() => accountProjectRepository.updateProject(projectId, projectName, projectDescription, data.project.version)); }} className="grid gap-2 sm:grid-cols-2"><label className="text-xs text-slate-400">Tên dự án<input value={projectName} onChange={(e) => setProjectName(e.target.value)} required className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-sm text-foreground" /></label><label className="text-xs text-slate-400">Mô tả<input value={projectDescription} onChange={(e) => setProjectDescription(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-sm text-foreground" /></label><button type="submit" disabled={busy} className="w-fit rounded-lg border border-indigo-500 px-3 py-2 text-xs font-semibold text-indigo-200 disabled:opacity-50">Lưu thông tin</button></form>
        </div>}
      </section>}

      {actor && showAddStack && <WorkspaceAddStackForm busy={busy} onClose={() => setShowAddStack(false)} onCreate={(input) => mutate(() => accountProjectRepository.addStack({ projectId, ...input }))} />}

      <section className="mt-6 space-y-3" aria-label="Tìm và lọc công việc">
        {memberFilterId && <button type="button" onClick={() => setMemberFilterId(null)} className="rounded-lg border border-indigo-500/50 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-200">Đang lọc: {data.members.find((m) => m.id === memberFilterId)?.display_name ?? 'Thành viên'} · Bỏ lọc</button>}
        <label className="relative block max-w-md lg:hidden"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><span className="sr-only">Tìm kiếm đầu việc hoặc ghi chú</span><input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Tìm kiếm đầu việc hoặc ghi chú..." className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 pl-9 pr-3 text-sm text-foreground" /></label>
        <div className="flex items-center gap-2 overflow-x-auto pb-1"><Filter className="h-4 w-4 shrink-0 text-slate-400" />{([['all', 'Tất cả'], ['mine', `Việc của tôi (${mineCount})`], ['incomplete', 'Chưa xong'], ['doing', 'Đang làm'], ['blocked', 'Đang kẹt'], ['done', 'Hoàn thành']] as [TaskFilter, string][]).map(([val, label]) => <button type="button" key={val} aria-pressed={filter === val} onClick={() => setFilter(val)} className={`shrink-0 rounded-xl border px-3 py-1.5 text-xs font-medium ${filter === val ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-slate-700 bg-slate-900 text-slate-300'}`}>{label}</button>)}</div>
        <label className="flex w-fit items-center gap-2 text-xs text-slate-400">Sắp xếp Stack<select value={stackSort} onChange={(e) => setStackSort(e.target.value as StackSort)} className="min-h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-foreground"><option value="position">Thứ tự thủ công</option><option value="priority_high">Ưu tiên cao trước</option><option value="priority_low">Ưu tiên thấp trước</option></select></label>
      </section>

      <div className="mt-6 space-y-4">
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
        {stacks.length === 0 && <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">Chưa có giai đoạn nào. {actor ? 'Hãy thêm giai đoạn đầu tiên.' : 'Chủ dự án sẽ thêm công việc sau.'}</div>}
      </div>

      {v2Actor && <TaskDetailDrawer item={selectedV2Item} stacks={v2Snapshot.stacks} members={v2Snapshot.members} currentMember={v2Actor} onClose={() => setSelectedTaskId(null)}
        onSaveItem={async (id, patch, expectedVersion) => { let v: number | undefined; await mutateForV2(async () => { const latest = await accountProjectRepository.loadProject(projectId); v = await saveV2Item(latest, id, patch, expectedVersion); }); return v; }}
        onToggleSubtask={async (itemId, subtaskId) => { await mutateForV2(async () => { const latest = await accountProjectRepository.loadProject(projectId); const sub = latest.subtasks.find((s) => s.id === subtaskId && s.task_id === itemId); if (!sub) throw new Error('Phần việc không còn tồn tại.'); await accountProjectRepository.updateSubtask(sub.id, sub.version, { completed: !sub.completed }); }); const updated = await accountProjectRepository.loadProject(projectId); return toV2WorkspaceSnapshot(updated).items.find((i) => i.id === itemId)?.subtasks ?? []; }}
        onDeleteItem={(id) => { const t = data.tasks.find((e) => e.id === id); return t ? mutateForV2(() => accountProjectRepository.deleteTask(t.id, t.version)) : Promise.reject(new Error('Đầu việc không còn tồn tại.')); }}
        onMoveItem={(id, dir) => { const t = data.tasks.find((e) => e.id === id); return t ? mutateForV2(() => accountProjectRepository.moveTask(t.id, t.version, dir)) : Promise.reject(new Error('Đầu việc không còn tồn tại.')); }} />}
    </div>

    <aside className={`hidden border-l border-slate-800 xl:sticky xl:top-0 xl:block xl:h-dvh xl:overflow-y-auto ${rightSidebarOpen ? 'p-5' : 'p-2'}`}>
      <button type="button" onClick={() => setRightSidebarOpen((v) => !v)} aria-label={rightSidebarOpen ? 'Ẩn thanh nhật ký bên phải' : 'Mở thanh nhật ký bên phải'} className={`mb-4 rounded-lg border border-slate-800 p-2 text-slate-400 hover:bg-slate-900 hover:text-foreground ${rightSidebarOpen ? '' : 'mx-auto block'}`}>{rightSidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}</button>
      {rightSidebarOpen && <ActivityPanel activities={v2Snapshot.activities} />}
    </aside>

    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-slate-800 bg-slate-950/95 px-2 pb-2 pt-2 backdrop-blur lg:hidden" aria-label="Điều hướng dự án">
      <button type="button" onClick={() => { setFilter('all'); setShowTeam(false); setShowMobileActivity(false); }} className={`flex flex-col items-center gap-1 text-[11px] ${filter === 'all' && !showTeam && !showMobileActivity ? 'text-indigo-300' : 'text-slate-400'}`}><CheckSquare2 className="h-5 w-5" />Checklist</button>
      <button type="button" onClick={() => { setFilter('mine'); setShowTeam(false); setShowMobileActivity(false); }} className={`flex flex-col items-center gap-1 text-[11px] ${filter === 'mine' && !showTeam && !showMobileActivity ? 'text-indigo-300' : 'text-slate-400'}`}><UserCheck className="h-5 w-5" />Của tôi ({mineCount})</button>
      <button type="button" onClick={() => { setShowMobileActivity((v) => !v); setShowTeam(false); }} className={`flex flex-col items-center gap-1 text-[11px] ${showMobileActivity ? 'text-indigo-300' : 'text-slate-400'}`}><Activity className="h-5 w-5" />Hoạt động</button>
      <button type="button" onClick={() => { setShowTeam(true); setShowMobileActivity(false); }} className={`flex flex-col items-center gap-1 text-[11px] ${showTeam ? 'text-indigo-300' : 'text-slate-400'}`}><Users className="h-5 w-5" />Nhóm</button>
    </nav>
  </main>;
}
