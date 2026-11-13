import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, CheckSquare2, ChevronDown, ChevronRight, ChevronUp, ExternalLink, Filter, Layers, Link2, Lock, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Pencil, Plus, Search, Settings2, Trash2, Unlock, UserCheck, Users, X } from 'lucide-react';
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
import { sortProjectStacks, STACK_PALETTE, STACK_PRIORITY_LABELS, type StackSort } from '../../core/domain/accountStack';
import type { AccountIdentity } from '../../infrastructure/auth/accountAuthService';
import { accountProjectRepository } from '../../infrastructure/projects/accountProjectRepository';
import { AccountActivityPanel } from './AccountActivityPanel';
import { AccountNoticeBell } from './AccountNoticeBell';

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

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function memberName(members: ProjectMember[], memberId: string | null): string {
  return members.find((member) => member.id === memberId)?.display_name ?? 'Chưa giao';
}

function draftFromTask(task: ProjectTask) {
  return {
    version: task.version, dirty: false, title: task.title, notes: task.notes,
    status: task.status, priority: task.priority, dueDate: task.due_date ?? '',
    stackId: task.stack_id,
  };
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

function TaskCard({ task, stack, data, actor, busy, mutate, selectedTaskId, onClearSelectedTask }: {
  task: ProjectTask;
  stack: ProjectStack;
  data: ProjectData;
  actor: ProjectMember | null;
  busy: boolean;
  mutate: (action: () => Promise<unknown>) => Promise<boolean>;
  selectedTaskId: string | null;
  onClearSelectedTask: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [newSubtask, setNewSubtask] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [subtaskTitleDraft, setSubtaskTitleDraft] = useState('');
  const [subtaskAssigneeDraft, setSubtaskAssigneeDraft] = useState('');
  const [draft, setDraft] = useState(() => draftFromTask(task));
  const isExpanded = expanded || selectedTaskId === task.id;
  const toggleExpanded = () => { if (selectedTaskId === task.id) onClearSelectedTask(); else setExpanded((value) => !value); };
  const currentDraft = draft.version === task.version || draft.dirty ? draft : draftFromTask(task);
  const assigneeIds = data.assignees.filter((entry) => entry.task_id === task.id).map((entry) => entry.member_id);
  const subtasks = data.subtasks.filter((entry) => entry.task_id === task.id)
    .sort((a, b) => a.position - b.position);
  const links = data.links.filter((entry) => entry.task_id === task.id)
    .sort((a, b) => a.position - b.position);
  const manager = canManageTask(task, actor);
  const canTick = canToggleTask(task, data.assignees, actor);
  const taskOrder = data.tasks.filter((entry) => entry.stack_id === stack.id)
    .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const orderIndex = taskOrder.findIndex((entry) => entry.id === task.id);
  const precedingTask = stack.sequential_lock && !task.completed
    ? data.tasks.filter((candidate) => candidate.stack_id === stack.id &&
      (candidate.position < task.position || (candidate.position === task.position &&
        (candidate.created_at < task.created_at || (candidate.created_at === task.created_at && candidate.id < task.id)))) &&
      !candidate.completed).sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0]
    : undefined;

  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    const saved = await mutate(() => accountProjectRepository.updateTask(task.id, currentDraft.version, {
      title: currentDraft.title.trim(), notes: currentDraft.notes.trim(),
      status: currentDraft.status, priority: currentDraft.priority,
      due_date: currentDraft.dueDate || null,
      stack_id: currentDraft.stackId,
    }));
    if (saved) setDraft({ ...currentDraft, dirty: false });
  }

  async function addSubtask(event: FormEvent) {
    event.preventDefault();
    const saved = await mutate(() => accountProjectRepository.addSubtask({
      projectId: task.project_id, taskId: task.id, title: newSubtask.trim(),
      assigneeId: newAssignee || null,
    }));
    if (saved) { setNewSubtask(''); setNewAssignee(''); }
  }

  async function addLink(event: FormEvent) {
    event.preventDefault();
    let url: URL;
    try { url = new URL(newLinkUrl.trim()); } catch { window.alert('Hãy nhập link http hoặc https hợp lệ.'); return; }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      window.alert('Chỉ hỗ trợ link http hoặc https.'); return;
    }
    const saved = await mutate(() => accountProjectRepository.addTaskLink(
      task.project_id, task.id, newLinkLabel.trim() || url.hostname, url.href,
    ));
    if (saved) { setNewLinkLabel(''); setNewLinkUrl(''); }
  }

  return <article id={`task-${task.id}`} className="rounded-xl border border-slate-700 bg-slate-900/80 p-3">
    <div className="flex items-start gap-3">
      <button type="button" aria-label={task.completed ? 'Mở lại việc' : 'Đánh dấu hoàn thành'}
        title={!canTick ? 'Chỉ người được giao việc mới có thể đánh dấu' : precedingTask ? `Hoàn thành “${precedingTask.title}” trước` : 'Đánh dấu việc của bạn'}
        disabled={!canTick || busy}
        onClick={() => { if (precedingTask) { window.alert(`Stack tuần tự: Hãy hoàn thành “${precedingTask.title}” trước.`); return; } void mutate(() => accountProjectRepository.updateTask(task.id, task.version, { completed: !task.completed })); }}
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${task.completed ? 'border-emerald-400 bg-emerald-500 text-white' : 'border-slate-500 text-slate-500'} disabled:opacity-50`}>
        {task.completed && <Check className="h-5 w-5" />}
      </button>
      <button type="button" onClick={toggleExpanded} className="min-w-0 flex-1 text-left">
        <span className={`block text-sm font-semibold ${task.completed ? 'text-slate-400 line-through' : 'text-foreground'}`}>{task.title}</span>
        {task.notes && !task.completed && <span className="mt-1 block truncate text-xs text-slate-400">{task.notes}</span>}
        <span className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
          {task.status !== 'todo' && <span className={`rounded-md border px-1.5 py-0.5 ${task.completed ? 'border-emerald-500/40 text-emerald-300' : task.status === 'blocked' ? 'border-rose-500/40 text-rose-300' : 'border-sky-500/40 text-sky-300'}`}>{task.completed ? 'Hoàn thành' : task.status === 'blocked' ? 'Đang kẹt' : 'Đang làm'}</span>}
          {task.priority === 'high' && <span className="rounded-md border border-amber-500/40 px-1.5 py-0.5 text-amber-300">Ưu tiên cao</span>}
          {subtasks.length > 0 && <span>☷ {subtasks.filter((entry) => entry.completed).length}/{subtasks.length}</span>}
          {links.length > 0 && <span>↗ {links.length} link</span>}
          {task.due_date && <span>◷ {task.due_date}</span>}
          <span>{assigneeIds.length ? assigneeIds.map((id) => memberName(data.members, id)).join(', ') : 'Chưa giao'}</span>
        </span>
      </button>
      <button type="button" onClick={toggleExpanded} aria-label="Xem chi tiết việc" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800">{isExpanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}</button>
      {actor?.access_role === 'owner' && <div className="flex flex-col"><button type="button" disabled={busy || orderIndex === 0} aria-label={`Đưa ${task.title} lên trên`} onClick={() => void mutate(() => accountProjectRepository.moveTask(task.id, task.version, 'up'))} className="text-slate-400 disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button><button type="button" disabled={busy || orderIndex === taskOrder.length - 1} aria-label={`Đưa ${task.title} xuống dưới`} onClick={() => void mutate(() => accountProjectRepository.moveTask(task.id, task.version, 'down'))} className="text-slate-400 disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button></div>}
    </div>

    {isExpanded && <div role="dialog" aria-modal="true" aria-label={`Chi tiết đầu việc ${task.title}`} onMouseDown={(event) => { if (event.target === event.currentTarget) toggleExpanded(); }} className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      <div className="flex h-dvh w-full max-w-lg flex-col border-l border-slate-800 bg-slate-900 shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4"><h2 className="text-xs font-bold uppercase tracking-wider text-indigo-300">Chi tiết đầu việc</h2><button type="button" onClick={toggleExpanded} aria-label="Đóng chi tiết việc" className="rounded-lg bg-slate-800 p-2 text-slate-300"><X className="h-4 w-4" /></button></header>
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
      {manager ? <form onSubmit={(event) => void saveDetails(event)} className="space-y-2">
        {currentDraft.version !== task.version && <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-300">Việc này vừa được cập nhật trên thiết bị khác. Nội dung bạn đang nhập vẫn còn; hãy đối chiếu trước khi dùng bản mới. <button type="button" onClick={() => setDraft(draftFromTask(task))} className="ml-1 font-semibold underline">Dùng bản mới</button></div>}
        <label className="block text-xs text-slate-400">Tên việc<input value={currentDraft.title} onChange={(event) => setDraft({ ...currentDraft, title: event.target.value, dirty: true })} required maxLength={240} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-sm text-foreground" /></label>
        <label className="block text-xs text-slate-400">Ghi chú<textarea value={currentDraft.notes} onChange={(event) => setDraft({ ...currentDraft, notes: event.target.value, dirty: true })} rows={2} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-sm text-foreground" /></label>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="block text-xs text-slate-400">Trạng thái<select value={currentDraft.status} onChange={(event) => setDraft({ ...currentDraft, status: event.target.value as ProjectTask['status'], dirty: true })} disabled={task.completed} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-sm text-foreground"><option value="todo">Cần làm</option><option value="doing">Đang làm</option><option value="blocked">Bị chặn</option>{task.completed && <option value="done">Hoàn thành</option>}</select></label>
          <label className="block text-xs text-slate-400">Ưu tiên<select value={currentDraft.priority} onChange={(event) => setDraft({ ...currentDraft, priority: event.target.value as ProjectTask['priority'], dirty: true })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-sm text-foreground"><option value="low">Thấp</option><option value="medium">Vừa</option><option value="high">Cao</option></select></label>
          <label className="block text-xs text-slate-400">Hạn chót<input type="date" value={currentDraft.dueDate} onChange={(event) => setDraft({ ...currentDraft, dueDate: event.target.value, dirty: true })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-sm text-foreground" /></label>
        </div>
        <label className="block text-xs text-slate-400">Stack<select value={currentDraft.stackId} onChange={(event) => setDraft({ ...currentDraft, stackId: event.target.value, dirty: true })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-sm text-foreground">{data.stacks.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select></label>
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
            return editingSubtaskId === subtask.id && manager ? <form key={subtask.id} onSubmit={(event) => { event.preventDefault(); void mutate(() => accountProjectRepository.updateSubtask(subtask.id, subtask.version, { title: subtaskTitleDraft.trim(), assignee_member_id: subtaskAssigneeDraft || null })).then((saved) => { if (saved) setEditingSubtaskId(null); }); }} className="grid gap-2 rounded-lg bg-slate-950 p-2 sm:grid-cols-[1fr_auto_auto]">
              <input value={subtaskTitleDraft} onChange={(event) => setSubtaskTitleDraft(event.target.value)} required maxLength={240} aria-label="Sửa tên phần việc nhỏ" className="min-h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-foreground" />
              <select value={subtaskAssigneeDraft} onChange={(event) => setSubtaskAssigneeDraft(event.target.value)} aria-label="Sửa người phụ trách phần việc nhỏ" className="min-h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-foreground"><option value="">Theo việc lớn</option>{data.members.filter((member) => member.active).map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}</select>
              <div className="flex gap-2"><button type="submit" disabled={busy} className="rounded-lg bg-indigo-600 px-2 text-xs text-white disabled:opacity-50">Lưu</button><button type="button" onClick={() => setEditingSubtaskId(null)} className="text-xs text-slate-400">Hủy</button></div>
            </form> : <div key={subtask.id} className="flex items-center gap-2 rounded-lg bg-slate-950 p-2">
              <button type="button" aria-label={subtask.completed ? 'Mở lại phần việc nhỏ' : 'Hoàn thành phần việc nhỏ'}
                disabled={!allowed || busy} title={allowed ? '' : 'Chỉ người phụ trách được đánh dấu'}
                onClick={() => void mutate(() => accountProjectRepository.updateSubtask(subtask.id, subtask.version, { completed: !subtask.completed }))}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border disabled:opacity-50 ${subtask.completed ? 'border-emerald-400 bg-emerald-500 text-white' : 'border-slate-600'}`}>{subtask.completed && <Check className="h-4 w-4" />}</button>
              <span className={`min-w-0 flex-1 text-xs ${subtask.completed ? 'text-slate-500 line-through' : 'text-slate-200'}`}>{subtask.title}</span>
              <span className="max-w-28 truncate text-[11px] text-slate-400">{memberName(data.members, subtask.assignee_member_id)}</span>
              {manager && <><button type="button" onClick={() => { setEditingSubtaskId(subtask.id); setSubtaskTitleDraft(subtask.title); setSubtaskAssigneeDraft(subtask.assignee_member_id ?? ''); }} aria-label={`Sửa ${subtask.title}`} className="text-slate-400 hover:text-indigo-300"><Pencil className="h-3.5 w-3.5" /></button><button type="button" disabled={busy} onClick={() => { if (window.confirm(`Xóa phần việc “${subtask.title}”?`)) void mutate(() => accountProjectRepository.deleteSubtask(subtask.id, subtask.version)); }} aria-label={`Xóa ${subtask.title}`} className="text-slate-400 hover:text-red-300 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button></>}
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
      <div>
        <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-300"><Link2 className="h-4 w-4 text-sky-400" />Link tài liệu đính kèm</p>
        <div className="mt-2 space-y-2">{links.map((link) => <div key={link.id} className="flex items-center gap-2 rounded-lg bg-slate-950 p-2 text-xs">
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 flex-1 items-center gap-2 text-sky-300 hover:underline"><ExternalLink className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{link.label}</span></a>
          {manager && <button type="button" disabled={busy} aria-label={`Gỡ link ${link.label}`} onClick={() => void mutate(() => accountProjectRepository.deleteTaskLink(link.id, link.version))} className="rounded p-1 text-slate-400 hover:text-red-300 disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>}
        </div>)}</div>
        {manager && <form onSubmit={(event) => void addLink(event)} className="mt-3 grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <input value={newLinkLabel} onChange={(event) => setNewLinkLabel(event.target.value)} maxLength={160} placeholder="Tên link" aria-label="Tên link" className="min-h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-foreground" />
          <input value={newLinkUrl} onChange={(event) => setNewLinkUrl(event.target.value)} required type="url" placeholder="https://..." aria-label="Địa chỉ link" className="min-h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-foreground" />
          <button type="submit" disabled={busy} className="min-h-10 rounded-lg bg-slate-700 px-3 text-xs font-semibold text-white disabled:opacity-50">Đính kèm</button>
        </form>}
      </div>
      {manager && <button type="button" disabled={busy} onClick={() => {
        if (window.confirm(`Xóa việc “${task.title}” và mọi phần việc nhỏ?`)) {
          void mutate(() => accountProjectRepository.deleteTask(task.id, task.version));
        }
      }} className="text-xs text-red-300 disabled:opacity-50">Xóa việc này</button>}
        </div>
      </div>
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
  const [newStackDescription, setNewStackDescription] = useState('');
  const [newStackColor, setNewStackColor] = useState<string>(STACK_PALETTE[0]);
  const [newStackSequential, setNewStackSequential] = useState(false);
  const [newStackPriority, setNewStackPriority] = useState<ProjectStack['priority']>('medium');
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
    catch { /* Keep the choice for this session when storage is unavailable. */ }
  }, [leftSidebarOpen, rightSidebarOpen]);

  const refresh = useCallback(async () => {
    const next = await accountProjectRepository.loadProject(projectId);
    setData(next);
  }, [projectId]);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => { window.removeEventListener('online', updateOnline); window.removeEventListener('offline', updateOnline); };
  }, []);

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

  useEffect(() => {
    if (!selectedTaskId || !data) return;
    const timer = setTimeout(() => document.getElementById(`task-${selectedTaskId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    return () => clearTimeout(timer);
  }, [selectedTaskId, data]);

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
    const success = await mutate(() => accountProjectRepository.addStack({
      projectId, title: newStack.trim(), description: newStackDescription.trim(),
      color: newStackColor, sequentialLock: newStackSequential, priority: newStackPriority,
    }));
    if (success) {
      setNewStack(''); setNewStackDescription(''); setNewStackSequential(false);
      setNewStackPriority('medium'); setShowAddStack(false);
    }
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    const success = await mutate(() => accountProjectRepository.invite(projectId, inviteEmail));
    if (success) setInviteEmail('');
  }

  async function openTaskFromNotice(taskId: string) {
    const task = data?.tasks.find((entry) => entry.id === taskId);
    if (!task) { setError('Việc này đã bị xóa hoặc bạn không còn quyền xem.'); return; }
    setFilter('all');
    setSearchQuery('');
    const stack = data?.stacks.find((entry) => entry.id === task.stack_id);
    if (stack?.collapsed) await mutate(() => accountProjectRepository.updateStack(stack.id, stack.version, { collapsed: false }));
    setSelectedTaskId(taskId);
  }

  if (!data) return <main className="mx-auto max-w-5xl p-6 text-slate-300">
    <button type="button" onClick={onBack} className="mb-5 inline-flex items-center gap-2 text-sm"><ArrowLeft className="h-4 w-4" />Dự án</button>
    {error ? <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-red-200">{error}</p> : <p>Đang tải dự án...</p>}
  </main>;

  const stacks = sortProjectStacks(data.stacks, stackSort);
  const manualStacks = sortProjectStacks(data.stacks, 'position');
  const mineIds = new Set(data.assignees.filter((entry) => entry.member_id === actor?.id).map((entry) => entry.task_id));
  const mySubtaskIds = new Set(data.subtasks.filter((entry) => entry.assignee_member_id === actor?.id).map((entry) => entry.task_id));
  const mineCount = data.tasks.filter((task) => !task.completed && (mineIds.has(task.id) || mySubtaskIds.has(task.id))).length;
  const completedCount = data.tasks.filter((task) => task.completed).length;
  const progress = data.tasks.length ? Math.round(completedCount / data.tasks.length * 100) : 0;
  const query = searchQuery.trim().toLocaleLowerCase('vi');
  const visibleTasks = (stackId: string) => data.tasks.filter((task) => {
    if (task.stack_id !== stackId) return false;
    if (memberFilterId && !data.assignees.some((entry) => entry.task_id === task.id && entry.member_id === memberFilterId)
      && !data.subtasks.some((entry) => entry.task_id === task.id && entry.assignee_member_id === memberFilterId)) return false;
    if (filter === 'mine' && !(mineIds.has(task.id) || mySubtaskIds.has(task.id))) return false;
    if (filter === 'incomplete' && task.completed) return false;
    if (filter === 'doing' && task.status !== 'doing') return false;
    if (filter === 'blocked' && task.status !== 'blocked') return false;
    if (filter === 'done' && !task.completed) return false;
    if (query && !`${task.title} ${task.notes} ${data.subtasks.filter((subtask) => subtask.task_id === task.id).map((subtask) => subtask.title).join(' ')}`.toLocaleLowerCase('vi').includes(query)) return false;
    return true;
  }).sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const gridColumns = leftSidebarOpen
    ? rightSidebarOpen
      ? 'lg:grid-cols-[19rem_minmax(0,1fr)] xl:grid-cols-[19rem_minmax(0,1fr)_20rem]'
      : 'lg:grid-cols-[19rem_minmax(0,1fr)] xl:grid-cols-[19rem_minmax(0,1fr)_3.5rem]'
    : rightSidebarOpen
      ? 'lg:grid-cols-[3.5rem_minmax(0,1fr)] xl:grid-cols-[3.5rem_minmax(0,1fr)_20rem]'
      : 'lg:grid-cols-[3.5rem_minmax(0,1fr)] xl:grid-cols-[3.5rem_minmax(0,1fr)_3.5rem]';
  return <main className={`min-h-dvh bg-slate-950 text-slate-100 lg:grid ${gridColumns}`}>
    <aside className={`hidden border-r border-slate-800 bg-slate-950/80 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:overflow-y-auto ${leftSidebarOpen ? 'p-5' : 'items-center p-2'}`}>
      <div className={`flex items-start ${leftSidebarOpen ? 'justify-between gap-2' : 'flex-col items-center gap-3'}`}>
        <button type="button" onClick={onBack} aria-label="Về danh sách dự án" className={`flex min-w-0 items-center gap-2.5 text-left ${leftSidebarOpen ? 'flex-1' : ''}`}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 shadow-lg shadow-indigo-500/20"><Layers className="h-5 w-5 text-white" /></span>{leftSidebarOpen && <span className="min-w-0"><span className="block truncate text-[10px] font-semibold uppercase tracking-wider text-indigo-300">{data.project.code}</span><span className="mt-0.5 block truncate text-sm font-bold text-foreground">{data.project.name}</span></span>}</button>
        <button type="button" onClick={() => setLeftSidebarOpen((value) => !value)} aria-label={leftSidebarOpen ? 'Ẩn thanh bên trái' : 'Mở thanh bên trái'} title={leftSidebarOpen ? 'Ẩn thanh bên trái' : 'Mở thanh bên trái'} className="rounded-lg border border-slate-800 p-2 text-slate-400 hover:bg-slate-900 hover:text-foreground">{leftSidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}</button>
      </div>
      {leftSidebarOpen && <>
      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-4" aria-label="Tiến độ toàn dự án">
        <p className="text-xs text-slate-400">Tiến độ toàn dự án</p><div className="mt-1 flex items-end justify-between"><strong className="text-2xl text-white">{progress}%</strong><span className="text-xs text-slate-400">{completedCount}/{data.tasks.length} việc</span></div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-950"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400" style={{ width: `${progress}%` }} /></div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px]"><div className="rounded-lg bg-slate-950 p-2"><span className="block font-bold text-emerald-400">{completedCount}</span>Đã xong</div><div className="rounded-lg bg-slate-950 p-2"><span className="block font-bold text-sky-400">{data.tasks.filter((task) => task.status === 'doing').length}</span>Đang làm</div><div className="rounded-lg bg-slate-950 p-2"><span className="block font-bold text-rose-400">{data.tasks.filter((task) => task.status === 'blocked').length}</span>Đang kẹt</div></div>
      </section>
      <p className="mt-7 text-xs font-semibold uppercase tracking-wider text-slate-400">Các tầng Stack ({stacks.length})</p>
      <nav className="mt-2 space-y-1">{stacks.map((stack) => <button key={stack.id} type="button" onClick={() => document.getElementById(`stack-${stack.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="flex w-full items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-left text-xs text-slate-200 hover:border-indigo-500"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: stack.color }} /><span className="min-w-0 flex-1 truncate">{stack.title}</span><span className="text-slate-500">{data.tasks.filter((task) => task.stack_id === stack.id).length}</span></button>)}</nav>
      <p className="mt-7 text-xs font-semibold uppercase tracking-wider text-slate-400">Thành viên ({data.members.filter((member) => member.active).length}/20)</p>
      <div className="mt-2 space-y-2">{data.members.filter((member) => member.active).map((member) => <button type="button" key={member.id} aria-pressed={memberFilterId === member.id} onClick={() => setMemberFilterId((current) => current === member.id ? null : member.id)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${memberFilterId === member.id ? 'bg-indigo-500/20 text-indigo-100' : 'text-slate-300 hover:bg-slate-900'}`}><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-[10px] font-bold text-white">{member.display_name.slice(0, 2).toUpperCase()}</span><span className="min-w-0 flex-1 truncate">{member.display_name}{member.user_id === identity.id ? ' (Bạn)' : ''}</span><span className="text-slate-500">{data.assignees.filter((entry) => entry.member_id === member.id && data.tasks.some((task) => task.id === entry.task_id && !task.completed)).length}</span></button>)}</div>
      <div className="mt-auto space-y-2 border-t border-slate-800 pt-4"><button type="button" onClick={onSettings} className="flex w-full items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800"><Settings2 className="h-4 w-4 text-indigo-300" />Cài đặt</button><button type="button" onClick={onBack} className="flex items-center gap-2 text-xs text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" />Tất cả dự án</button></div>
      </>}
    </aside>
    <div className="min-w-0 w-full px-4 py-5 pb-24 sm:px-6 lg:pb-8 xl:px-8">
    <header className="sticky top-0 z-30 -mx-4 -mt-5 border-b border-slate-800 bg-slate-950/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 xl:-mx-8 xl:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <div className={`min-w-0 items-center gap-2.5 ${leftSidebarOpen ? 'flex lg:hidden' : 'flex'}`}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 shadow-lg shadow-indigo-500/20"><Layers className="h-4.5 w-4.5 text-white" /></span>
          <div className="min-w-0"><div className="flex items-center gap-1.5"><h1 className="max-w-28 truncate text-sm font-bold text-foreground sm:max-w-56">{data.project.name}</h1><span className="rounded-md bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-300">{progress}%</span></div><p className="truncate text-[11px] text-slate-400">Mã: {data.project.code}</p></div>
        </div>
        <label className="relative hidden min-w-40 max-w-xl flex-1 lg:block"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" /><span className="sr-only">Tìm kiếm đầu việc hoặc ghi chú</span><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Tìm kiếm đầu việc hoặc ghi chú..." className="h-10 w-full rounded-xl border border-slate-800 bg-slate-900 pl-9 pr-3 text-sm text-foreground focus:border-indigo-500 focus:outline-none" /></label>
      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        {actor && <AccountNoticeBell projectId={projectId} memberId={identity.id} notices={data.notices} onRead={(id) => void mutate(() => accountProjectRepository.markNoticeRead(id))} onOpenTask={(id) => void openTaskFromNotice(id)} />}
        <button type="button" onClick={() => { setProjectName(data.project.name); setProjectDescription(data.project.description); setShowTeam((value) => !value); }} aria-label="Thành viên và lời mời" className="hidden h-10 items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-2.5 text-xs font-semibold text-slate-200 lg:inline-flex xl:px-3"><Users className="h-4 w-4 text-indigo-300" /><span className="hidden xl:inline">Mời nhóm ({data.members.filter((member) => member.active).length}/20)</span></button>
        <button type="button" onClick={onSettings} aria-label="Cài đặt" className="hidden h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-indigo-300 lg:flex"><Settings2 className="h-4 w-4" /></button>
        {actor && <button type="button" onClick={() => setShowAddStack((value) => !value)} className="inline-flex h-10 items-center gap-1 rounded-xl bg-indigo-600 px-2.5 text-xs font-semibold text-white sm:px-3"><Plus className="h-4 w-4" /><span className="hidden sm:inline">Thêm Stack mới</span><span className="sm:hidden">Stack</span></button>}
        <button type="button" onClick={onSettings} aria-label="Cài đặt tài khoản và ứng dụng" title="Cài đặt" className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-[11px] font-bold text-white lg:hidden">{identity.name.slice(0, 2).toUpperCase()}</button>
      </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-900 lg:hidden"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400" style={{ width: `${progress}%` }} /></div>
    </header>
    {data.project.accessRole === 'global_admin' && <p className="mt-4 rounded-xl border border-indigo-500/40 bg-indigo-500/10 p-3 text-sm text-indigo-100">Chế độ theo dõi của admin. Bạn không ở danh sách thành viên và không thể tạo hoặc đánh dấu việc.</p>}
    {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
    {!online && <p role="status" className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">Đang mất kết nối. Chưa thể lưu thay đổi vào dữ liệu nhóm; hãy kết nối Internet trước khi chỉnh sửa.</p>}

    {showTeam && <section className="mt-5 rounded-2xl border border-slate-700 bg-slate-900 p-4">
      <h2 className="font-semibold text-foreground">Thành viên dự án</h2>
      <p className="mt-1 text-xs text-slate-400">{data.members.filter((member) => member.active).length} / 20 người · Admin toàn cục không nằm trong danh sách này.</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">{data.members.map((member) =>
        <li key={member.id} className="rounded-lg bg-slate-950 p-3 text-sm text-foreground">
          <button type="button" onClick={() => { setMemberFilterId(member.id); setShowTeam(false); }} className="text-left">{member.display_name}<span className="ml-2 text-xs text-slate-400">{!member.active ? 'Tạm ngưng' : member.access_role === 'owner' ? 'Chủ dự án' : member.job_title || 'Thành viên'}</span></button>
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

    {actor && showAddStack && <form onSubmit={(event) => void addStack(event)} className="mt-5 space-y-4 rounded-2xl border border-indigo-500/40 bg-slate-900 p-4 shadow-xl sm:p-5">
      <div className="flex items-center justify-between"><h2 className="text-sm font-bold text-foreground">Tạo Stack / Giai đoạn mới</h2><button type="button" onClick={() => setShowAddStack(false)} aria-label="Đóng tạo Stack" className="text-slate-400 hover:text-foreground"><X className="h-4 w-4" /></button></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input required autoFocus maxLength={160} value={newStack} onChange={(event) => setNewStack(event.target.value)} placeholder="VD: Stack 5 — Phát hành & Marketing" aria-label="Tên Stack" className="min-h-11 min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3.5 text-sm text-foreground focus:border-indigo-500 focus:outline-none" />
        <input value={newStackDescription} onChange={(event) => setNewStackDescription(event.target.value)} placeholder="Mô tả ngắn mục tiêu của Stack này (tùy chọn)" aria-label="Mô tả Stack" className="min-h-11 min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3.5 text-sm text-foreground focus:border-indigo-500 focus:outline-none" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={newStackSequential} onChange={(event) => setNewStackSequential(event.target.checked)} className="accent-indigo-500" />Khóa thứ tự tuần tự (xong bước trên mới mở bước dưới)</label>
          <fieldset className="flex items-center gap-2" aria-label="Màu Stack"><legend className="sr-only">Màu Stack</legend>{STACK_PALETTE.map((color) => <button key={color} type="button" aria-label={`Chọn màu ${color}`} aria-pressed={newStackColor === color} onClick={() => setNewStackColor(color)} className={`h-5 w-5 rounded-full ${newStackColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900' : ''}`} style={{ backgroundColor: color }} />)}</fieldset>
          <label className="flex items-center gap-2 text-xs text-slate-300">Mức độ ưu tiên<select value={newStackPriority} onChange={(event) => setNewStackPriority(event.target.value as ProjectStack['priority'])} className="min-h-9 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-foreground"><option value="low">Thấp</option><option value="medium">Trung bình</option><option value="high">Cao</option></select></label>
        </div>
        <div className="flex items-center gap-2"><button type="button" onClick={() => setShowAddStack(false)} className="rounded-xl px-3 py-2 text-xs text-slate-400 hover:text-foreground">Hủy</button><button type="submit" disabled={busy} className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Tạo Stack</button></div>
      </div>
    </form>}

    <section className="mt-6 space-y-3" aria-label="Tìm và lọc công việc">
      {memberFilterId && <button type="button" onClick={() => setMemberFilterId(null)} className="rounded-lg border border-indigo-500/50 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-200">Đang lọc: {memberName(data.members, memberFilterId)} · Bỏ lọc</button>}
      <label className="relative block max-w-md lg:hidden"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><span className="sr-only">Tìm kiếm đầu việc hoặc ghi chú</span><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Tìm kiếm đầu việc hoặc ghi chú..." className="min-h-11 w-full rounded-xl border border-slate-700 bg-slate-900 pl-9 pr-3 text-sm text-foreground" /></label>
      <div className="flex items-center gap-2 overflow-x-auto pb-1"><Filter className="h-4 w-4 shrink-0 text-slate-400" />{([
        ['all', 'Tất cả'], ['mine', `Việc của tôi (${mineCount})`], ['incomplete', 'Chưa xong'],
        ['doing', 'Đang làm'], ['blocked', 'Đang kẹt'], ['done', 'Hoàn thành'],
      ] as [TaskFilter, string][]).map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)} className={`shrink-0 rounded-xl border px-3 py-1.5 text-xs font-medium ${filter === value ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-slate-700 bg-slate-900 text-slate-300'}`}>{label}</button>)}</div>
      <label className="flex w-fit items-center gap-2 text-xs text-slate-400">Sắp xếp Stack<select value={stackSort} onChange={(event) => setStackSort(event.target.value as StackSort)} className="min-h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs text-foreground"><option value="position">Thứ tự thủ công</option><option value="priority_high">Ưu tiên cao trước</option><option value="priority_low">Ưu tiên thấp trước</option></select></label>
    </section>

    <div className="mt-6 space-y-4">
      {stacks.map((stack) => <section key={stack.id} id={`stack-${stack.id}`} className="scroll-mt-4 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/80 p-4 shadow-lg shadow-black/20" style={{ borderTopColor: stack.color, borderTopWidth: 3 }}>
        <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" onClick={() => void mutate(() => accountProjectRepository.updateStack(stack.id, stack.version, { collapsed: !stack.collapsed }))} className="flex min-w-0 items-center gap-2 text-left text-foreground">{stack.collapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}<span><span className="block font-bold">{stack.title}</span><span className="mt-1 block text-xs text-slate-400">{stack.description || `${data.tasks.filter((task) => task.stack_id === stack.id).length} việc`}</span></span></button><div className="flex flex-wrap items-center gap-2">
          {actor ? <select aria-label={`Mức độ ưu tiên của ${stack.title}`} value={stack.priority} disabled={busy} onChange={(event) => void mutate(() => accountProjectRepository.updateStack(stack.id, stack.version, { priority: event.target.value as ProjectStack['priority'] }))} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"><option value="low">Ưu tiên thấp</option><option value="medium">Ưu tiên trung bình</option><option value="high">Ưu tiên cao</option></select> : <span className="rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300">Ưu tiên {STACK_PRIORITY_LABELS[stack.priority].toLowerCase()}</span>}
          {actor && <button type="button" disabled={busy} onClick={() => void mutate(() => accountProjectRepository.updateStack(stack.id, stack.version, { sequential_lock: !stack.sequential_lock }))} title={stack.sequential_lock ? 'Tắt thứ tự tuần tự' : 'Bật thứ tự tuần tự'} className="flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-xs text-slate-300 disabled:opacity-50">{stack.sequential_lock ? <Lock className="h-3.5 w-3.5 text-amber-400" /> : <Unlock className="h-3.5 w-3.5" />}{stack.sequential_lock ? 'Tuần tự' : 'Tự do'}</button>}
          {actor && stackSort === 'position' && <div className="flex rounded-lg border border-slate-700"><button type="button" disabled={busy || manualStacks[0]?.id === stack.id} aria-label={`Đưa ${stack.title} lên trên`} onClick={() => void mutate(() => accountProjectRepository.moveStack(stack.id, stack.version, 'up'))} className="p-1 text-slate-300 disabled:opacity-30"><ChevronUp className="h-4 w-4" /></button><button type="button" disabled={busy || manualStacks.at(-1)?.id === stack.id} aria-label={`Đưa ${stack.title} xuống dưới`} onClick={() => void mutate(() => accountProjectRepository.moveStack(stack.id, stack.version, 'down'))} className="p-1 text-slate-300 disabled:opacity-30"><ChevronDown className="h-4 w-4" /></button></div>}
          {actor?.access_role === 'owner' && <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Xóa giai đoạn “${stack.title}” và tất cả việc bên trong?`)) void mutate(() => accountProjectRepository.deleteStack(stack.id, stack.version)); }} className="text-xs text-red-300 disabled:opacity-50">Xóa</button>}
        </div></div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-900"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${data.tasks.some((task) => task.stack_id === stack.id) ? Math.round(data.tasks.filter((task) => task.stack_id === stack.id && task.completed).length / data.tasks.filter((task) => task.stack_id === stack.id).length * 100) : 0}%` }} /></div>
        {!stack.collapsed && <><div className="mt-4 space-y-3">{visibleTasks(stack.id).map((task) => <TaskCard key={task.id} task={task} stack={stack} data={data} actor={actor} busy={busy} mutate={mutate} selectedTaskId={selectedTaskId} onClearSelectedTask={() => setSelectedTaskId(null)} />)}</div>
        {visibleTasks(stack.id).length === 0 && data.tasks.some((task) => task.stack_id === stack.id) && <p className="mt-3 text-xs text-slate-400">Không có việc phù hợp bộ lọc.</p>}
        {actor && <CreateTaskForm stack={stack} members={data.members} actor={actor} busy={busy} onCreate={(title, assigneeIds) => mutate(() => accountProjectRepository.addTask({ projectId, stackId: stack.id, title, assigneeIds }))} />}</>}
      </section>)}
      {stacks.length === 0 && <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-400">Chưa có giai đoạn nào. {actor ? 'Hãy thêm giai đoạn đầu tiên.' : 'Chủ dự án sẽ thêm công việc sau.'}</div>}
    </div>
    </div>
    <aside className={`hidden border-l border-slate-800 xl:sticky xl:top-0 xl:block xl:h-dvh xl:overflow-y-auto ${rightSidebarOpen ? 'p-5' : 'p-2'}`}>
      <button type="button" onClick={() => setRightSidebarOpen((value) => !value)} aria-label={rightSidebarOpen ? 'Ẩn thanh nhật ký bên phải' : 'Mở thanh nhật ký bên phải'} title={rightSidebarOpen ? 'Ẩn thanh nhật ký bên phải' : 'Mở thanh nhật ký bên phải'} className={`mb-4 rounded-lg border border-slate-800 p-2 text-slate-400 hover:bg-slate-900 hover:text-foreground ${rightSidebarOpen ? '' : 'mx-auto block'}`}>{rightSidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}</button>
      {rightSidebarOpen && <AccountActivityPanel activities={data.activities} />}
    </aside>
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-slate-800 bg-slate-950/95 px-2 pb-2 pt-2 backdrop-blur lg:hidden" aria-label="Điều hướng dự án">
      <button type="button" onClick={() => { setFilter('all'); setShowTeam(false); }} className={`flex flex-col items-center gap-1 text-[11px] ${filter === 'all' && !showTeam ? 'text-indigo-300' : 'text-slate-400'}`}><CheckSquare2 className="h-5 w-5" />Checklist</button>
      <button type="button" onClick={() => { setFilter('mine'); setShowTeam(false); }} className={`flex flex-col items-center gap-1 text-[11px] ${filter === 'mine' && !showTeam ? 'text-indigo-300' : 'text-slate-400'}`}><UserCheck className="h-5 w-5" />Của tôi ({mineCount})</button>
      <button type="button" onClick={() => setShowTeam(true)} className={`flex flex-col items-center gap-1 text-[11px] ${showTeam ? 'text-indigo-300' : 'text-slate-400'}`}><Users className="h-5 w-5" />Nhóm</button>
    </nav>
  </main>;
}
