import React, { useState } from 'react';
import { Check, ListChecks, Plus, X } from 'lucide-react';
import { canCompleteSubtask } from '../../core/domain/taskCompletionPolicy';
import { generateId } from '../../domain/stackDomain';
import type { ChecklistItem, Member, SubtaskItem } from '../../types/models';

export interface DrawerSubtasksSectionProps {
  item: ChecklistItem;
  subtasks: SubtaskItem[];
  members: Member[];
  currentMember?: Member | null;
  togglingSubtaskId: string | null;
  onAddSubtask: (next: SubtaskItem[]) => void;
  onToggleSubtask: (subtaskId: string) => void;
  onChangeSubtaskAssignee: (subtaskId: string, nextAssigneeId: string) => void;
  onRemoveSubtask: (subtaskId: string) => void;
}

export const DrawerSubtasksSection: React.FC<DrawerSubtasksSectionProps> = ({
  item,
  subtasks,
  members,
  currentMember,
  togglingSubtaskId,
  onAddSubtask,
  onToggleSubtask,
  onChangeSubtaskAssignee,
  onRemoveSubtask,
}) => {
  const [newSubtask, setNewSubtask] = useState('');
  const [newSubtaskAssigneeId, setNewSubtaskAssigneeId] = useState<string>('');
  const memberMap = new Map(members.map((m) => [m.id, m]));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtask.trim()) return;
    const next: SubtaskItem[] = [
      ...subtasks,
      {
        id: generateId(),
        title: newSubtask.trim(),
        completed: false,
        assigneeId: newSubtaskAssigneeId || null,
        completedById: null,
        completedByName: null,
      },
    ];
    setNewSubtask('');
    setNewSubtaskAssigneeId('');
    onAddSubtask(next);
  };

  return (
    <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200">
          <ListChecks className="w-4 h-4 text-indigo-400" />
          Chia phần việc nhỏ trong mục này ({subtasks.filter((s) => s.completed).length}/{subtasks.length})
        </span>
      </div>
      <p className="text-[11px] text-slate-400">
        Phần việc có người phụ trách riêng chỉ người đó được tick. Phần việc chưa giao do người phụ trách task lớn tick.
      </p>

      {subtasks.length > 0 && (
        <ul className="space-y-2">
          {subtasks.map((sub) => {
            const subAssignee = sub.assigneeId ? memberMap.get(sub.assigneeId) : undefined;
            const canToggle = Boolean(currentMember && canCompleteSubtask(item, sub, currentMember.id));
            return (
              <li
                key={sub.id}
                className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-slate-900/90 border border-slate-800/90 group"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <button
                    type="button"
                    disabled={!canToggle || togglingSubtaskId !== null}
                    onClick={() => onToggleSubtask(sub.id)}
                    aria-label={`${sub.completed ? 'Mở lại' : 'Đánh dấu xong'} bước nhỏ ${sub.title}`}
                    title={!canToggle ? 'Chỉ người phụ trách được tick phần việc này' : undefined}
                    className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                      sub.completed
                        ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                        : 'bg-slate-950 border-slate-600 hover:border-indigo-400'
                    }`}
                  >
                    {sub.completed && <Check className="w-3 h-3 stroke-[3]" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <span className={`block text-xs break-words ${sub.completed ? 'line-through text-slate-500' : 'text-slate-100'}`}>
                      {sub.title}
                    </span>
                    {sub.completed && sub.completedByName && (
                      <span className="text-[10px] text-emerald-400/90">✓ {sub.completedByName} đã làm xong</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-7 sm:ml-0">
                  <div className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-lg bg-slate-950 border border-slate-800">
                    {subAssignee ? (
                      <span
                        className="w-4 h-4 rounded text-[9px] font-bold text-on-accent flex items-center justify-center shrink-0"
                        style={{ backgroundColor: subAssignee.color }}
                      >
                        {subAssignee.avatar}
                      </span>
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-slate-600 shrink-0" />
                    )}
                    <select
                      value={sub.assigneeId ?? ''}
                      onChange={(e) => onChangeSubtaskAssignee(sub.id, e.target.value)}
                      aria-label={`Chọn người làm phần việc nhỏ ${sub.title}`}
                      className="bg-transparent text-[11px] font-medium text-slate-200 focus:outline-none cursor-pointer"
                    >
                      <option value="" className="bg-slate-900 text-slate-300">Ai làm?</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id} className="bg-slate-900 text-foreground">{m.name}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveSubtask(sub.id)}
                    title="Xóa bước nhỏ này"
                    className="text-slate-500 hover:text-rose-400 p-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
        <input
          type="text"
          value={newSubtask}
          onChange={(e) => setNewSubtask(e.target.value)}
          placeholder="Nhập bước nhỏ..."
          className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-foreground focus:outline-none focus:border-indigo-500"
        />
        <div className="flex items-center gap-2">
          <select
            value={newSubtaskAssigneeId}
            onChange={(e) => setNewSubtaskAssigneeId(e.target.value)}
            aria-label="Giao bước nhỏ cho ai"
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="">Giao cho ai? (tuỳ chọn)</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name} ({m.role})</option>
            ))}
          </select>
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-xs font-semibold text-on-accent inline-flex items-center gap-1 cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Thêm
          </button>
        </div>
      </form>
    </div>
  );
};
