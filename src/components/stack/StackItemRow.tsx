import React from 'react';
import { AlertTriangle, Calendar, Check, ExternalLink, ListChecks, Lock } from 'lucide-react';
import { canCompleteTask } from '../../core/domain/taskCompletionPolicy';
import { isItemLockedBySequence, statusLabelVi } from '../../domain/stackDomain';
import type { ChecklistItem, Member, StackGroup } from '../../types/models';

export interface StackItemRowProps {
  item: ChecklistItem;
  stack: StackGroup;
  allStackItems: ChecklistItem[];
  memberMap: Map<string, Member>;
  currentMember: Member;
  onToggleItem: (item: ChecklistItem) => void;
  onSelectItem: (item: ChecklistItem) => void;
  onNotifyBlockedSequence: (blockingTitle: string) => void;
}

export const StackItemRow: React.FC<StackItemRowProps> = ({
  item,
  stack,
  allStackItems,
  memberMap,
  currentMember,
  onToggleItem,
  onSelectItem,
  onNotifyBlockedSequence,
}) => {
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
      id={`task-${item.id}`}
      className={`group scroll-mt-24 px-4 sm:px-5 py-3 flex items-start gap-3 transition ${
        item.completed
          ? 'bg-slate-950/30'
          : isSeqLocked
            ? 'bg-slate-950/50 opacity-75'
            : 'hover:bg-slate-800/40'
      }`}
    >
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

        <div className="flex flex-wrap items-center gap-2 mt-2">
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
          {!item.completed && item.priority === 'high' && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30">
              Ưu tiên cao
            </span>
          )}
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
          {item.links.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] text-sky-300 bg-sky-500/10 px-2 py-0.5 rounded-md">
              <ExternalLink className="w-3 h-3" />
              {item.links.length} link
            </span>
          )}
          {item.dueDate && !item.completed && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
              <Calendar className="w-3 h-3" />
              {item.dueDate}
            </span>
          )}
          {item.completed && item.completedByName && (
            <span className="text-[11px] text-emerald-400/90">
              ✓ {item.completedByName} đã hoàn thành
            </span>
          )}
        </div>
      </div>

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
              style={{ backgroundColor: assignees[0]!.color }}
            >
              {assignees[0]!.avatar}
            </span>
            <span className={`text-xs hidden sm:inline ${isCurrentMemberAssigned ? 'text-indigo-300 font-semibold' : 'text-slate-300'}`}>
              {assignees[0]!.name}
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
            <span className={`text-xs hidden sm:inline ${isCurrentMemberAssigned ? 'text-indigo-300 font-semibold' : 'text-slate-300'}`}>
              {assignees[0]!.name.split(' ').pop()} +{assignees.length - 1}
            </span>
          </>
        ) : (
          <span className="text-[11px] text-slate-500 px-1">Chưa giao</span>
        )}
      </button>
    </li>
  );
};
