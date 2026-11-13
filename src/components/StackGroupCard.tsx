import React, { useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  ListChecks,
  Lock,
  Plus,
  Trash2,
  Unlock,
} from 'lucide-react';
import { calculateProgress, isItemLockedBySequence } from '../domain/stackDomain';
import { canCompleteTask } from '../core/domain/taskCompletionPolicy';
import { statusLabelVi } from '../services/syncService';
import type { ChecklistItem, Member, StackGroup } from '../types/models';

interface StackGroupCardProps {
  stack: StackGroup;
  stackIndex: number;
  totalStacks: number;
  allStackItems: ChecklistItem[];
  visibleItems: ChecklistItem[];
  members: Member[];
  currentMember: Member;
  onToggleItem: (item: ChecklistItem) => void;
  onSelectItem: (item: ChecklistItem) => void;
  onQuickAddItem: (
    stackId: string,
    title: string,
    assigneeId: string | null,
    assigneeIds?: string[],
  ) => Promise<void>;
  onUpdateStack: (
    stackId: string,
    patch: Partial<Pick<StackGroup, 'title' | 'description' | 'sequentialLock' | 'collapsed'>>,
  ) => void;
  onMoveStack: (stackId: string, direction: 'up' | 'down') => void;
  onDeleteStack: (stackId: string) => void;
  onNotifyBlockedSequence: (blockingTitle: string) => void;
}

export const StackGroupCard: React.FC<StackGroupCardProps> = ({
  stack,
  stackIndex,
  totalStacks,
  allStackItems,
  visibleItems,
  members,
  currentMember,
  onToggleItem,
  onSelectItem,
  onQuickAddItem,
  onUpdateStack,
  onMoveStack,
  onDeleteStack,
  onNotifyBlockedSequence,
}) => {
  const [newTitle, setNewTitle] = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState<string>('');
  const [adding, setAdding] = useState(false);

  const stats = calculateProgress(allStackItems);
  const memberMap = new Map(members.map((m) => [m.id, m]));

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || adding) return;
    setAdding(true);
    try {
      const nextAssigneeIds = newAssigneeId ? [newAssigneeId] : [];
      await onQuickAddItem(
        stack.id,
        newTitle.trim(),
        newAssigneeId || null,
        nextAssigneeIds,
      );
      setNewTitle('');
    } finally {
      setAdding(false);
    }
  };

  return (
    <section className="rounded-2xl bg-slate-900/80 border border-slate-800/90 shadow-lg shadow-black/20 overflow-hidden transition">
      {/* Top Color Accent */}
      <div className="h-1 w-full" style={{ backgroundColor: stack.color }} />

      {/* Stack Header */}
      <div className="p-4 sm:px-5 sm:py-4 flex flex-col gap-3 border-b border-slate-800/70">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => onUpdateStack(stack.id, { collapsed: !stack.collapsed })}
            className="flex items-start gap-2.5 text-left group cursor-pointer min-w-0 flex-1"
          >
            <span className="mt-0.5 p-1 rounded-lg bg-slate-800/80 text-slate-400 group-hover:text-foreground transition">
              {stack.collapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-foreground leading-snug">
                  {stack.title}
                </h3>
                {stats.percentage === 100 && stats.total > 0 && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                    Hoàn tất Stack
                  </span>
                )}
              </div>
              {stack.description && (
                <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{stack.description}</p>
              )}
            </div>
          </button>

          {/* Right Stack Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              title={
                stack.sequentialLock
                  ? 'Đang bật khóa tuần tự: Phải hoàn thành mục trên mới tick được mục dưới'
                  : 'Nhấn để bật khóa thứ tự tuần tự cho Stack này'
              }
              onClick={() => onUpdateStack(stack.id, { sequentialLock: !stack.sequentialLock })}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer ${
                stack.sequentialLock
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                  : 'bg-slate-800/70 text-slate-400 border-slate-700/70 hover:text-slate-200'
              }`}
            >
              {stack.sequentialLock ? (
                <>
                  <Lock className="w-3 h-3" />
                  <span className="hidden sm:inline">Tuần tự</span>
                </>
              ) : (
                <>
                  <Unlock className="w-3 h-3" />
                  <span className="hidden sm:inline">Tự do</span>
                </>
              )}
            </button>

            <div className="hidden sm:flex items-center bg-slate-950/60 rounded-lg border border-slate-800">
              <button
                type="button"
                disabled={stackIndex === 0}
                onClick={() => onMoveStack(stack.id, 'up')}
                title="Đưa Stack lên trên"
                className="p-1 text-slate-400 hover:text-foreground disabled:opacity-30 cursor-pointer"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={stackIndex === totalStacks - 1}
                onClick={() => onMoveStack(stack.id, 'down')}
                title="Đưa Stack xuống dưới"
                className="p-1 text-slate-400 hover:text-foreground disabled:opacity-30 cursor-pointer"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Xóa "${stack.title}" và toàn bộ các mục bên trong?`)) {
                  onDeleteStack(stack.id);
                }
              }}
              title="Xóa Stack"
              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Stack Progress Bar */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-slate-950 overflow-hidden border border-slate-800/80">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${stats.percentage}%`,
                backgroundColor: stats.percentage === 100 ? '#10b981' : stack.color,
              }}
            />
          </div>
          <span className="text-xs font-semibold tabular-nums text-slate-300 shrink-0">
            {stats.completed}/{stats.total} ({stats.percentage}%)
          </span>
        </div>
      </div>

      {/* Checklist Items Body */}
      {!stack.collapsed && (
        <div>
          {visibleItems.length === 0 ? (
            <div className="px-5 py-6 text-center text-xs text-slate-500">
              {allStackItems.length === 0
                ? 'Chưa có đầu việc nào trong Stack này. Thêm nhanh ở khung bên dưới!'
                : 'Không có đầu việc nào khớp bộ lọc hiện tại.'}
            </div>
          ) : (
            <ul className="divide-y divide-slate-800/60">
              {visibleItems.map((item) => {
                const orderIdx = allStackItems.findIndex((x) => x.id === item.id);
                const seqCheck = isItemLockedBySequence(stack, item, allStackItems);
                const isSeqLocked = seqCheck.locked && !item.completed;

                const rawAssigneeIds =
                  Array.isArray(item.assigneeIds) && item.assigneeIds.length > 0
                    ? item.assigneeIds
                    : item.assigneeId
                      ? [item.assigneeId]
                      : [];
                const assignees = rawAssigneeIds
                  .map((id) => memberMap.get(id))
                  .filter((m): m is Member => Boolean(m));
                const visibleAvatars = assignees.slice(0, 3);
                const extraAssigneeCount = Math.max(0, assignees.length - visibleAvatars.length);
                const isCurrentMemberAssigned = assignees.some((a) => a.id === currentMember.id);
                const canToggleCompletion = canCompleteTask(item, currentMember.id);
                const hasMySubtask = item.subtasks.some(
                  (s) => s.assigneeId === currentMember.id && !s.completed,
                );

                const doneSubtasks = item.subtasks.filter((s) => s.completed).length;

                return (
                  <li
                    key={item.id}
                    className={`group px-4 sm:px-5 py-3 flex items-start gap-3 transition ${
                      item.completed
                        ? 'bg-slate-950/30'
                        : isSeqLocked
                          ? 'bg-slate-950/50 opacity-75'
                          : 'hover:bg-slate-800/40'
                    }`}
                  >
                    {/* Checkbox / Sequence Lock Button */}
                    <button
                      type="button"
                      disabled={!canToggleCompletion}
                      onClick={() => {
                        if (isSeqLocked && seqCheck.blockingItemTitle) {
                          onNotifyBlockedSequence(seqCheck.blockingItemTitle);
                          return;
                        }
                        onToggleItem(item);
                      }}
                      aria-label={`${item.completed ? 'Mở lại' : 'Đánh dấu hoàn thành'} ${item.title}`}
                      title={!canToggleCompletion ? 'Chỉ người được giao việc mới có thể tick' : undefined}
                      className={`mt-0.5 w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                        item.completed
                          ? 'bg-emerald-500 border-emerald-400 text-slate-950 shadow-sm shadow-emerald-500/30'
                          : isSeqLocked
                            ? 'bg-slate-900 border-amber-500/40 text-amber-400/80'
                            : 'bg-slate-950 border-slate-600 hover:border-indigo-400 text-transparent'
                      }`}
                    >
                      {item.completed ? (
                        <Check className="w-4 h-4 stroke-[3]" />
                      ) : isSeqLocked ? (
                        <Lock className="w-3 h-3" />
                      ) : null}
                    </button>

                    {/* Content (Click to open Drawer) */}
                    <div
                      onClick={() => onSelectItem(item)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') onSelectItem(item);
                      }}
                      className="flex-1 min-w-0 cursor-pointer"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        {stack.sequentialLock && orderIdx >= 0 && (
                          <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                            #{orderIdx + 1}
                          </span>
                        )}
                        <span
                          className={`text-sm font-medium leading-snug break-words ${
                            item.completed ? 'line-through text-slate-500' : 'text-slate-100'
                          }`}
                        >
                          {item.title}
                        </span>
                      </div>

                      {item.notes && !item.completed && (
                        <p className="text-xs text-slate-400 mt-1 line-clamp-1">{item.notes}</p>
                      )}

                      {/* Meta Badges */}
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        {/* Status Pill (when not done) */}
                        {!item.completed && item.status !== 'todo' && (
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border ${
                              item.status === 'doing'
                                ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                                : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                            }`}
                          >
                            {item.status === 'blocked' && <AlertTriangle className="w-3 h-3" />}
                            {statusLabelVi(item.status)}
                          </span>
                        )}

                        {/* Priority */}
                        {!item.completed && item.priority === 'high' && (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            Ưu tiên cao
                          </span>
                        )}

                        {/* Subtask count */}
                        {item.subtasks.length > 0 && (
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md ${
                              hasMySubtask
                                ? 'bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 font-medium'
                                : 'text-slate-400 bg-slate-800/80'
                            }`}
                          >
                            <ListChecks className="w-3 h-3 text-indigo-400" />
                            {doneSubtasks}/{item.subtasks.length}
                            {hasMySubtask && <span className="hidden sm:inline">• Có phần của bạn</span>}
                          </span>
                        )}

                        {/* Links count */}
                        {item.links.length > 0 && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-sky-300 bg-sky-500/10 px-2 py-0.5 rounded-md">
                            <ExternalLink className="w-3 h-3" />
                            {item.links.length} link
                          </span>
                        )}

                        {/* Due date */}
                        {item.dueDate && !item.completed && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                            <Calendar className="w-3 h-3" />
                            {item.dueDate}
                          </span>
                        )}

                        {/* Completed Attribution */}
                        {item.completed && item.completedByName && (
                          <span className="text-[11px] text-emerald-400/90">
                            ✓ {item.completedByName} đã hoàn thành
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Assignee Pill / Overlapping Avatar Group */}
                    <button
                      type="button"
                      onClick={() => onSelectItem(item)}
                      className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-950/70 border border-slate-800 hover:border-slate-700 transition cursor-pointer"
                      title={
                        assignees.length > 0
                          ? `Người cùng làm: ${assignees.map((a) => a.name).join(', ')}`
                          : 'Bấm để chọn người cùng làm'
                      }
                    >
                      {assignees.length === 1 ? (
                        <>
                          <span
                            className="w-5 h-5 rounded-md text-[10px] font-bold text-on-accent flex items-center justify-center"
                            style={{ backgroundColor: assignees[0].color }}
                          >
                            {assignees[0].avatar}
                          </span>
                          <span
                            className={`text-xs hidden sm:inline ${
                              isCurrentMemberAssigned
                                ? 'text-indigo-300 font-semibold'
                                : 'text-slate-300'
                            }`}
                          >
                            {assignees[0].name}
                          </span>
                        </>
                      ) : assignees.length > 1 ? (
                        <>
                          <div className="flex items-center -space-x-1.5">
                            {visibleAvatars.map((member) => (
                              <span
                                key={member.id}
                                className="w-5 h-5 rounded-full text-[9px] font-bold text-on-accent flex items-center justify-center ring-2 ring-slate-950"
                                style={{ backgroundColor: member.color }}
                              >
                                {member.avatar}
                              </span>
                            ))}
                            {extraAssigneeCount > 0 && (
                              <span className="w-5 h-5 rounded-full bg-slate-800 text-[9px] font-bold text-slate-200 flex items-center justify-center ring-2 ring-slate-950">
                                +{extraAssigneeCount}
                              </span>
                            )}
                          </div>
                          <span
                            className={`text-xs hidden sm:inline ${
                              isCurrentMemberAssigned
                                ? 'text-indigo-300 font-semibold'
                                : 'text-slate-300'
                            }`}
                          >
                            {assignees[0].name.split(' ').pop()} +{assignees.length - 1}
                          </span>
                        </>
                      ) : (
                        <span className="text-[11px] text-slate-500 px-1">Chưa giao</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Quick Add Item Bar */}
          <form
            onSubmit={handleAdd}
            className="p-3 sm:px-5 bg-slate-950/50 border-t border-slate-800/70 flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
          >
            <div className="flex items-center gap-2 flex-1">
              <Plus className="w-4 h-4 text-indigo-400 shrink-0 ml-1" />
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Thêm mục mới vào Stack này... (Nhấn Enter)"
                className="w-full bg-transparent text-xs sm:text-sm text-foreground placeholder:text-slate-500 focus:outline-none py-1.5"
              />
            </div>

            <div className="flex items-center gap-2 justify-end">
              <select
                value={newAssigneeId}
                onChange={(e) => setNewAssigneeId(e.target.value)}
                aria-label="Chọn người phụ trách"
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700/80 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value="">Giao cho: Tuỳ chọn</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.role})
                  </option>
                ))}
              </select>

              <button
                type="submit"
                disabled={!newTitle.trim() || adding}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-semibold text-on-accent transition cursor-pointer shrink-0"
              >
                Thêm
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
};
