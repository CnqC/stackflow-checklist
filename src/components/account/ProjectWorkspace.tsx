import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, ChevronDown, ChevronRight, Plus, Settings2, Users } from 'lucide-react';
import {
  canManageTask,
  canToggleSubtask,
  canToggleTask,
  type ProjectData,
  type ProjectMember,
  type ProjectStack,
  type ProjectSubtask,
  type ProjectTask,
  type ProjectTable,
} from '../../core/domain/accountProject';
import type { AccountIdentity } from '../../infrastructure/auth/accountAuthService';
import { accountProjectRepository } from '../../infrastructure/projects/accountProjectRepository';

interface Props {
  projectId: string;
  identity: AccountIdentity;
  onBack: () => void;
  onSettings: () => void;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function memberName(members: ProjectMember[], memberId: string | null): string {
  return members.find((member) => member.id === memberId)?.display_name ?? 'Chưa giao';
}

function CreateTaskForm({ stack, members, actor, onCreate, busy }: {
  stack: ProjectStack;
  members: ProjectMember[];
  actor: ProjectMember;
  onCreate: (title: string, assigneeIds: string[]) => Promise<boolean>;
  busy: boolean;
}) {
  const [title, setTitle] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([actor.id]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await onCreate(title, assigneeIds)) setTitle('');
  }
  return <form onSubmit={(event) => void submit(event)} className="mt-4 rounded-xl border border-slate-700 bg-slate-950/70 p-3">
    <label className="block text-xs font-semibold text-slate-300">Việc mới trong {stack.title}
      <input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={240}
        placeholder="Viết tên việc cần làm" className="mt-2 min-h-11 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-foreground" />
    </label>
    <p className="mt-3 text-xs text-slate-400">Người cùng làm</p>
    <div className="mt-2 flex flex-wrap gap-2">
      {members.filter((member) => member.active).map((member) => {
        const selected = assigneeIds.includes(member.id);
        return <button type="button" key={member.id} aria-pressed={selected}
          onClick={() => setAssigneeIds((current) => selected ? current.filter((id) => id !== member.id) : [...current, member.id])}
          className={`min-h-10 rounded-full border px-3 text-xs ${selected ? 'border-indigo-400 bg-indigo-500/20 text-indigo-100' : 'border-slate-700 text-slate-300'}`}>
          {selected ? '✓ ' : ''}{member.display_name}
        </button>;
      })}
    </div>
    <button type="submit" disabled={busy} className="mt-3 min-h-10 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50">Thêm việc</button>
  </form>;
}

function TaskCard({ task, data, actor, busy, mutate }: {
  task: ProjectTask;
  data: ProjectData;
  actor: ProjectMember | null;
  busy: boolean;
  mutate: (action: () => Promise<unknown>) => Promise<boolean>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [newSubtask, setNewSubtask] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const [status, setStatus] = useState(task.status);
  const assigneeIds = data.assignees.filter((entry) => entry.task_id === task.id).map((entry) => entry.member_id);
  const subtasks = data.subtasks.filter((entry) => entry.task_id === task.id)
    .sort((a, b) => a.position - b.position);
  const manager = canManageTask(task, actor);
  const canTick = canToggleTask(task, data.assignees, actor);

  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    await mutate(() => accountProjectRepository.updateTask(task.id, task.version, {
      title: title.trim(), notes: notes.trim(), status,
    }));
  }

  async function addSubtask(event: FormEvent) {
    event.preventDefault();
    const saved = await mutate(() => accountProjectRepository.addSubtask({
      projectId: task.project_id, taskId: task.id, title: newSubtask.trim(),
      assigneeId: newAssignee || null,
    }));
    if (saved) { setNewSubtask(''); setNewAssignee(''); }
  }

  return <article className="rounded-xl border border-slate-700 bg-slate-900/80 p-3">
    <div className="flex items-start gap-3">
      <button type="button" aria-label={task.completed ? 'Mở lại việc' : 'Đánh dấu hoàn thành'}
        title={canTick ? 'Đánh dấu việc của bạn' : 'Chỉ người được giao việc mới có thể đánh dấu'}
        disabled={!canTick || busy}
        onClick={() => void mutate(() => accountProjectRepository.updateTask(task.id, task.version, { completed: !task.completed }))}
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${task.completed ? 'border-emerald-400 bg-emerald-500 text-white' : 'border-slate-500 text-slate-500'} disabled:opacity-50`}>
        {task.completed && <Check className="h-5 w-5" />}
      </button>
      <button type="button" onClick={() => setExpanded((value) => !value)} className="min-w-0 flex-1 text-left">
        <span className={`block text-sm font-semibold ${task.completed ? 'text-slate-400 line-through' : 'text-foreground'}`}>{task.title}</span>
        <span className="mt-1 block text-xs text-slate-400">{assigneeIds.length ? assigneeIds.map((id) => memberName(data.members, id)).join(', ') : 'Chưa giao'} · {subtasks.length} phần việc nhỏ</span>
      </button>
      <button type="button" onClick={() => setExpanded((value) => !value)} aria-label="Xem chi tiết việc" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800">{expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}</button>
    </div>

    {expanded && <div className="mt-4 space-y-4 border-t border-slate-800 pt-4">
      {manager ? <form onSubmit={(event) => void saveDetails(event)} className="space-y-2">
        <label className="block text-xs text-slate-400">Tên việc<input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={240} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-sm text-foreground" /></label>
        <label className="block text-xs text-slate-400">Ghi chú<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-sm text-foreground" /></label>
        <label className="block text-xs text-slate-400">Trạng thái<select value={status} onChange={(event) => setStatus(event.target.value as ProjectTask['status'])} disabled={task.completed} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-sm text-foreground"><option value="todo">Cần làm</option><option value="doing">Đang làm</option><option value="blocked">Bị chặn</option>{task.completed && <option value="done">Hoàn thành</option>}</select></label>
        <button type="submit" disabled={busy} className="rounded-lg border border-indigo-500 px-3 py-2 text-xs font-semibold text-indigo-200 disabled:opacity-50">Lưu thay đổi</button>
      </form> : <p className="text-sm text-slate-300">{task.notes || 'Chưa có ghi chú.'}</p>}

      {manager && <div>
        <p className="text-xs font-semibold text-slate-300">Người cùng làm</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {data.members.filter((member) => member.active).map((member) => {
            const assigned = assigneeIds.includes(member.id);
            return <button type="button" key={member.id} aria-pressed={assigned} disabled={busy}
              onClick={() => void mutate(() => accountProjectRepository.setTaskAssignees(
                task.id, task.version,
                assigned ? assigneeIds.filter((id) => id !== member.id) : [...assigneeIds, member.id],
              ))}
              className={`min-h-9 rounded-full border px-3 text-xs disabled:opacity-50 ${assigned ? 'border-indigo-400 bg-indigo-500/20 text-indigo-100' : 'border-slate-700 text-slate-300'}`}>{assigned ? '✓ ' : ''}{member.display_name}</button>;
          })}
        </div>
      </div>}

      <div>
        <p className="text-xs font-semibold text-slate-300">Phần việc nhỏ</p>
        <div className="mt-2 space-y-2">
          {subtasks.map((subtask: ProjectSubtask) => {
            const allowed = canToggleSubtask(subtask, data.assignees, actor);
            return <div key={subtask.id} className="flex items-center gap-2 rounded-lg bg-slate-950 p-2">
              <button type="button" aria-label={subtask.completed ? 'Mở lại phần việc nhỏ' : 'Hoàn thành phần việc nhỏ'}
                disabled={!allowed || busy} title={allowed ? '' : 'Chỉ người phụ trách được đánh dấu'}
                onClick={() => void mutate(() => accountProjectRepository.updateSubtask(subtask.id, subtask.version, { completed: !subtask.completed }))}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border disabled:opacity-50 ${subtask.completed ? 'border-emerald-400 bg-emerald-500 text-white' : 'border-slate-600'}`}>{subtask.completed && <Check className="h-4 w-4" />}</button>
              <span className={`min-w-0 flex-1 text-xs ${subtask.completed ? 'text-slate-500 line-through' : 'text-slate-200'}`}>{subtask.title}</span>
              <span className="max-w-28 truncate text-[11px] text-slate-400">{memberName(data.members, subtask.assignee_member_id)}</span>
            </div>;
          })}
          {subtasks.length === 0 && <p className="text-xs text-slate-500">Chưa chia phần việc nhỏ.</p>}
        </div>
        {manager && <form onSubmit={(event) => void addSubtask(event)} className="mt-3 flex flex-wrap gap-2">
          <input required maxLength={240} value={newSubtask} onChange={(event) => setNewSubtask(event.target.value)} placeholder="Tên phần việc nhỏ" className="min-h-10 min-w-40 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-foreground" />
          <select value={newAssignee} onChange={(event) => setNewAssignee(event.target.value)} aria-label="Người phụ trách phần việc nhỏ" className="min-h-10 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-foreground"><option value="">Theo việc lớn</option>{data.members.filter((member) => member.active).map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}</select>
          <button type="submit" disabled={busy} className="min-h-10 rounded-lg bg-slate-700 px-3 text-xs font-semibold text-white disabled:opacity-50">Thêm</button>
        </form>}
      </div>
      {manager && <button type="button" disabled={busy} onClick={() => {
        if (window.confirm(`Xóa việc “${task.title}” và mọi phần việc nhỏ?`)) {
          void mutate(() => accountProjectRepository.deleteTask(task.id, task.version));
        }
      }} className="text-xs text-red-300 disabled:opacity-50">Xóa việc này</button>}
    </div>}
  </article>;
}

export function ProjectWorkspace({ projectId, identity, onBack, onSettings }: Props) {
  const [data, setData] = useState<ProjectData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showTeam, setShowTeam] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [newStack, setNewStack] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');

  const refresh = useCallback(async () => {
    const next = await accountProjectRepository.loadProject(projectId);
    setData(next);
  }, [projectId]);

  useEffect(() => {
    let active = true;
    const pending = new Map<ProjectTable, ReturnType<typeof setTimeout>>();
    void accountProjectRepository.loadProject(projectId)
      .then((next) => { if (active) setData(next); })
      .catch((cause: unknown) => { if (active) setError(errorMessage(cause)); });
    const unsubscribe = accountProjectRepository.subscribe(projectId, (table) => {
      const previous = pending.get(table);
      if (previous) clearTimeout(previous);
      pending.set(table, setTimeout(() => {
        pending.delete(table);
        void accountProjectRepository.loadTable(projectId, table)
          .then((next) => {
            if (active) setData((current) => current ? { ...current, [table]: next } : current);
          })
          .catch((cause: unknown) => { if (active) setError(errorMessage(cause)); });
      }, 250));
    });
    return () => {
      active = false;
      unsubscribe();
      for (const timer of pending.values()) clearTimeout(timer);
    };
  }, [projectId]);

  const actor = useMemo(() => data?.members.find((member) =>
    member.user_id === identity.id && member.active) ?? null, [data, identity.id]);
  const canManageProject = data?.project.accessRole === 'owner'
    || data?.project.accessRole === 'global_admin';

  async function mutate(action: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      await refresh().catch(() => undefined);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addStack(event: FormEvent) {
    event.preventDefault();
    const success = await mutate(() => accountProjectRepository.addStack(projectId, newStack.trim()));
    if (success) setNewStack('');
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    const success = await mutate(() => accountProjectRepository.invite(projectId, inviteEmail));
    if (success) setInviteEmail('');
  }

  if (!data) return <main className="mx-auto max-w-5xl p-6 text-slate-300">
    <button type="button" onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-sm"><ArrowLeft className="h-4 w-4" />Dự án</button>
    {error ? <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">{error}</p> : <p>Đang tải dự án...</p>}
  </main>;

  const stacks = [...data.stacks].sort((a, b) => a.position - b.position);
  return <main className="mx-auto min-h-dvh max-w-6xl px-4 py-5 sm:px-7">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-foreground"><ArrowLeft className="h-4 w-4" />Tất cả dự án</button>
        <p className="mt-2 text-xs font-semibold uppercase tracking-widest text-indigo-300">{data.project.code}</p>
        <h1 className="text-2xl font-bold text-foreground">{data.project.name}</h1>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => { setProjectName(data.project.name); setProjectDescription(data.project.description); setShowTeam((value) => !value); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 px-3 text-sm text-slate-200"><Users className="h-4 w-4" />Thành viên</button>
        <button type="button" onClick={onSettings} aria-label="Cài đặt" className="rounded-xl border border-slate-700 p-3 text-slate-200"><Settings2 className="h-5 w-5" /></button>
      </div>
    </header>
    {data.project.accessRole === 'global_admin' && <p className="mt-4 rounded-xl border border-indigo-500/40 bg-indigo-500/10 p-3 text-sm text-indigo-100">Chế độ theo dõi của admin. Bạn không ở danh sách thành viên và không thể tạo hoặc đánh dấu việc.</p>}
    {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}

    {showTeam && <section className="mt-5 rounded-2xl border border-slate-700 bg-slate-900 p-4">
      <h2 className="font-semibold text-foreground">Thành viên dự án</h2>
      <p className="mt-1 text-xs text-slate-400">{data.members.filter((member) => member.active).length} / 20 người · Admin toàn cục không nằm trong danh sách này.</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">{data.members.map((member) =>
        <li key={member.id} className="rounded-lg bg-slate-950 p-3 text-sm text-foreground">
          <div>{member.display_name}<span className="ml-2 text-xs text-slate-400">{!member.active ? 'Tạm ngưng' : member.access_role === 'owner' ? 'Chủ dự án' : member.job_title || 'Thành viên'}</span></div>
          {canManageProject && member.access_role !== 'owner' && <div className="mt-2 flex gap-3 text-xs">
            <button type="button" disabled={busy} onClick={() => void mutate(() => accountProjectRepository.setMemberActive(projectId, member.id, !member.active))} className="text-indigo-300 disabled:opacity-50">{member.active ? 'Tạm ngưng' : 'Kích hoạt lại'}</button>
            {member.active && <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Chuyển quyền chủ dự án cho ${member.display_name}?`)) void mutate(() => accountProjectRepository.transferOwner(projectId, member.id)); }} className="text-indigo-300 disabled:opacity-50">Chuyển quyền chủ</button>}
          </div>}
        </li>)}</ul>
      {canManageProject && <div className="mt-4 space-y-4 border-t border-slate-800 pt-4">
        <form onSubmit={(event) => void invite(event)} className="flex flex-wrap gap-2"><input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="Email Google của người muốn mời" className="min-h-11 min-w-52 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-foreground" /><button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50">Mời thành viên</button></form>
        <form onSubmit={(event) => { event.preventDefault(); void mutate(() => accountProjectRepository.updateProject(projectId, projectName, projectDescription, data.project.version)); }} className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-slate-400">Tên dự án<input value={projectName} onChange={(event) => setProjectName(event.target.value)} required className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-sm text-foreground" /></label>
          <label className="text-xs text-slate-400">Mô tả<input value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-sm text-foreground" /></label>
          <button type="submit" disabled={busy} className="w-fit rounded-lg border border-indigo-500 px-3 py-2 text-xs font-semibold text-indigo-200 disabled:opacity-50">Lưu thông tin</button>
        </form>
      </div>}
    </section>}

    {actor && <form onSubmit={(event) => void addStack(event)} className="mt-6 flex gap-2"><input required value={newStack} onChange={(event) => setNewStack(event.target.value)} placeholder="Thêm giai đoạn công việc" className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm text-foreground" /><button type="submit" disabled={busy} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" />Thêm</button></form>}

    <div className="mt-6 grid gap-5 lg:grid-cols-2">
      {stacks.map((stack) => <section key={stack.id} className="rounded-2xl border border-slate-700 bg-slate-800/50 p-4">
        <div className="flex items-center justify-between gap-2"><div><h2 className="font-bold text-foreground">{stack.title}</h2><p className="mt-1 text-xs text-slate-400">{data.tasks.filter((task) => task.stack_id === stack.id).length} việc</p></div>{actor?.access_role === 'owner' && <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Xóa giai đoạn “${stack.title}” và tất cả việc bên trong?`)) void mutate(() => accountProjectRepository.deleteStack(stack.id, stack.version)); }} className="text-xs text-red-300 disabled:opacity-50">Xóa</button>}</div>
        <div className="mt-4 space-y-3">{data.tasks.filter((task) => task.stack_id === stack.id).sort((a, b) => a.position - b.position).map((task) => <TaskCard key={task.id} task={task} data={data} actor={actor} busy={busy} mutate={mutate} />)}</div>
        {actor && <CreateTaskForm stack={stack} members={data.members} actor={actor} busy={busy} onCreate={(title, assigneeIds) => mutate(() => accountProjectRepository.addTask({ projectId, stackId: stack.id, title, assigneeIds }))} />}
      </section>)}
      {stacks.length === 0 && <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">Chưa có giai đoạn nào. {actor ? 'Hãy thêm giai đoạn đầu tiên.' : 'Chủ dự án sẽ thêm công việc sau.'}</div>}
    </div>
  </main>;
}
