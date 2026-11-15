import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, Save, Trash2, Users, X } from 'lucide-react';
import { canCompleteSubtask, canCompleteTask } from '../core/domain/taskCompletionPolicy';
import { priorityLabelVi, statusLabelVi } from '../domain/stackDomain';
import type { ChecklistItem, Member, StackGroup, SubtaskItem, TaskLink, TaskPriority, TaskStatus } from '../types/models';
import { DrawerLinksSection } from './drawer/DrawerLinksSection';
import { DrawerSubtasksSection } from './drawer/DrawerSubtasksSection';

type TaskDraftPatch = Partial<
  Pick<ChecklistItem, 'title' | 'notes' | 'status' | 'priority' | 'assigneeId' | 'assigneeIds' | 'dueDate' | 'subtasks' | 'links' | 'stackId'>
>;

export interface TaskDetailDrawerProps {
  item: ChecklistItem | null;
  stacks: StackGroup[];
  members: Member[];
  currentMember?: Member | null;
  onClose: () => void;
  onSaveItem: (itemId: string, patch: TaskDraftPatch, expectedVersion?: number) => Promise<number | void>;
  onToggleSubtask: (itemId: string, subtaskId: string) => Promise<SubtaskItem[]>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onMoveItem: (itemId: string, direction: 'up' | 'down') => Promise<void>;
}

export const TaskDetailDrawer: React.FC<TaskDetailDrawerProps> = ({
  item, stacks, members, currentMember, onClose, onSaveItem, onToggleSubtask, onDeleteItem, onMoveItem,
}) => {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [stackId, setStackId] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [subtasks, setSubtasks] = useState<SubtaskItem[]>([]);
  const [links, setLinks] = useState<TaskLink[]>([]);
  const [saving, setSaving] = useState(false);
  const [togglingSubtaskId, setTogglingSubtaskId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveStateRef = useRef<{
    itemId: string | null;
    version: number | undefined;
    queue: Promise<unknown>;
    failed: boolean;
  }>({ itemId: null, version: undefined, queue: Promise.resolve(), failed: false });

  const activeItemId = item?.id ?? null;

  useEffect(() => {
    if (!item) return;
    setTitle(item.title);
    setNotes(item.notes);
    setStatus(item.status);
    setPriority(item.priority);
    const normalizedAssignees =
      Array.isArray(item.assigneeIds) && item.assigneeIds.length > 0
        ? item.assigneeIds
        : item.assigneeId
          ? [item.assigneeId]
          : [];
    setAssigneeIds(normalizedAssignees);
    setStackId(item.stackId);
    setDueDate(item.dueDate ?? '');
    setSubtasks(item.subtasks);
    setLinks(item.links);
    saveStateRef.current = { itemId: item.id, version: item.version, queue: Promise.resolve(), failed: false };
    setSaveError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItemId]);

  if (!item) return null;
  const canToggleTaskCompletion = Boolean(currentMember && canCompleteTask(item, currentMember.id));

  const enqueueWrite = <T,>(write: (saveState: typeof saveStateRef.current) => Promise<T>): Promise<T> => {
    const itemId = item.id;
    const saveState = saveStateRef.current;
    const operation = saveState.queue
      .then(async () => {
        if (saveState.failed || saveState.itemId !== itemId) {
          throw new Error('Lần lưu trước chưa thành công. Hãy đóng và mở lại đầu việc trước khi sửa tiếp.');
        }
        const result = await write(saveState);
        if (saveStateRef.current === saveState) setSaveError(null);
        return result;
      })
      .catch((error: unknown) => {
        if (saveStateRef.current === saveState) {
          saveState.failed = true;
          setSaveError(error instanceof Error ? error.message : 'Không thể lưu thay đổi.');
        }
        throw error;
      });
    saveState.queue = operation;
    return operation;
  };

  const saveDraftPatch = (patch: Parameters<typeof onSaveItem>[1]): Promise<void> =>
    enqueueWrite(async (saveState) => {
      const updatedVersion = await onSaveItem(item.id, patch, saveState.version);
      if (typeof updatedVersion === 'number') saveState.version = updatedVersion;
    });

  const handleToggleAssigneePill = (memberId: string) => {
    const next = assigneeIds.includes(memberId)
      ? assigneeIds.filter((id) => id !== memberId)
      : [...assigneeIds, memberId];
    setAssigneeIds(next);
    void saveDraftPatch({ assigneeIds: next, assigneeId: next[0] ?? null }).catch(() => undefined);
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveDraftPatch({
        title: title.trim(),
        notes,
        status,
        priority,
        assigneeIds,
        assigneeId: assigneeIds[0] ?? null,
        stackId,
        dueDate: dueDate || null,
      });
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Không thể lưu thay đổi.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSubtask = async (subId: string) => {
    const target = subtasks.find((sub) => sub.id === subId);
    if (togglingSubtaskId || !target || !currentMember || !canCompleteSubtask(item, target, currentMember.id)) return;
    setSaveError(null);
    setTogglingSubtaskId(subId);
    try {
      const updated = await enqueueWrite(() => onToggleSubtask(item.id, subId));
      const toggled = updated.find((subtask) => subtask.id === subId);
      if (toggled) setSubtasks((current) => current.map((subtask) => (subtask.id === subId ? toggled : subtask)));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Không thể cập nhật phần việc nhỏ.');
    } finally {
      setTogglingSubtaskId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-slate-900 border-l border-slate-800 h-dvh flex flex-col justify-between safe-top safe-bottom shadow-2xl">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">Chi tiết đầu việc</span>
            <div className="flex items-center bg-slate-950 rounded-lg border border-slate-800 ml-2">
              <button type="button" onClick={() => void onMoveItem(item.id, 'up')} title="Đưa lên trên trong Stack" className="p-1.5 text-slate-400 hover:text-foreground cursor-pointer"><ArrowUp className="w-3.5 h-3.5" /></button>
              <button type="button" onClick={() => void onMoveItem(item.id, 'down')} title="Đưa xuống dưới trong Stack" className="p-1.5 text-slate-400 hover:text-foreground cursor-pointer"><ArrowDown className="w-3.5 h-3.5" /></button>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg bg-slate-800/80 text-slate-300 hover:text-foreground cursor-pointer"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Tên công việc</label>
            <textarea rows={2} value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-sm font-medium text-foreground focus:outline-none focus:border-indigo-500 resize-none" />
          </div>

          <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200"><Users className="w-4 h-4 text-indigo-400" /><span>Người cùng làm ({assigneeIds.length > 0 ? `${assigneeIds.length} người` : 'Chưa giao'})</span></label>
              {assigneeIds.length > 0 && <button type="button" onClick={() => { setAssigneeIds([]); void saveDraftPatch({ assigneeIds: [], assigneeId: null }).catch(() => undefined); }} className="text-[11px] text-slate-400 hover:text-rose-300 cursor-pointer">Bỏ chọn hết</button>}
            </div>
            <p className="text-[11px] text-slate-400">Bấm vào tên thành viên để chọn 1 hoặc nhiều người cùng phụ trách đầu việc này:</p>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => {
                const selected = assigneeIds.includes(m.id);
                return (
                  <button key={m.id} type="button" onClick={() => handleToggleAssigneePill(m.id)} aria-pressed={selected} className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer ${selected ? 'bg-indigo-600/25 border-indigo-400 text-foreground shadow-sm shadow-indigo-500/20' : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-foreground'}`}>
                    <span className="w-5 h-5 rounded-md text-[10px] font-bold text-on-accent flex items-center justify-center shrink-0" style={{ backgroundColor: m.color }}>{m.avatar}</span>
                    <span>{m.name}</span>
                    {selected && <span className="w-4 h-4 rounded-full bg-indigo-500 text-on-accent flex items-center justify-center"><Check className="w-2.5 h-2.5 stroke-[3]" /></span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Trạng thái</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} disabled={item.completed && !canToggleTaskCompletion} className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-xs sm:text-sm text-foreground focus:outline-none focus:border-indigo-500">
                {(['todo', 'doing', 'blocked', 'done'] as TaskStatus[]).map((st) => <option key={st} value={st} disabled={st === 'done' && !canToggleTaskCompletion}>{statusLabelVi(st)}</option>)}
              </select>
              {!canToggleTaskCompletion && <p className="mt-1 text-[11px] text-slate-500">Chỉ người được giao task này có thể đánh dấu hoàn thành hoặc mở lại.</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Mức ưu tiên</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-xs sm:text-sm text-foreground focus:outline-none focus:border-indigo-500">
                {(['high', 'medium', 'low'] as TaskPriority[]).map((pr) => <option key={pr} value={pr}>{priorityLabelVi(pr)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Thuộc Stack / Giai đoạn</label>
              <select value={stackId} onChange={(e) => setStackId(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-xs sm:text-sm text-foreground focus:outline-none focus:border-indigo-500">
                {stacks.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Hạn chót (Deadline)</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-xs sm:text-sm text-foreground focus:outline-none focus:border-indigo-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Ghi chú chi tiết / Lý do kẹt (nếu có)</label>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ghi chú hướng dẫn, thông số kỹ thuật hoặc vấn đề cần đồng đội hỗ trợ..." className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-indigo-500" />
          </div>

          <DrawerSubtasksSection item={item} subtasks={subtasks} members={members} currentMember={currentMember} togglingSubtaskId={togglingSubtaskId} onAddSubtask={(next) => { setSubtasks(next); void saveDraftPatch({ subtasks: next }).catch(() => undefined); }} onToggleSubtask={(subId) => void handleToggleSubtask(subId)} onChangeSubtaskAssignee={(subId, nextAssigneeId) => { const next = subtasks.map((s) => (s.id === subId ? { ...s, assigneeId: nextAssigneeId || null } : s)); setSubtasks(next); void saveDraftPatch({ subtasks: next }).catch(() => undefined); }} onRemoveSubtask={(subId) => { const next = subtasks.filter((s) => s.id !== subId); setSubtasks(next); void saveDraftPatch({ subtasks: next }).catch(() => undefined); }} />
          <DrawerLinksSection links={links} onAddLink={(next) => { setLinks(next); void saveDraftPatch({ links: next }).catch(() => undefined); }} onRemoveLink={(linkId) => { const next = links.filter((l) => l.id !== linkId); setLinks(next); void saveDraftPatch({ links: next }).catch(() => undefined); }} />

          {item.updatedByName && <p className="text-[11px] text-slate-500">Cập nhật gần nhất bởi <strong className="text-slate-300">{item.updatedByName}</strong></p>}
        </div>

        {saveError && <p role="alert" className="px-5 py-2 text-xs text-rose-300">{saveError}</p>}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3">
          <button type="button" onClick={() => { if (window.confirm(`Xóa đầu việc "${item.title}"?`)) void onDeleteItem(item.id).then(onClose); }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 cursor-pointer"><Trash2 className="w-3.5 h-3.5" />Xóa mục</button>
          <button type="button" disabled={saving || !title.trim()} onClick={handleSave} className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs sm:text-sm font-semibold text-on-accent shadow-lg shadow-indigo-600/25 cursor-pointer"><Save className="w-4 h-4" />{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
        </div>
      </div>
    </div>
  );
};
