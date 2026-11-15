import React, { useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, Lock, Plus, Trash2, Unlock } from 'lucide-react';
import { calculateProgress } from '../domain/stackDomain';
import type { ChecklistItem, Member, StackGroup } from '../types/models';
import { StackItemRow } from './stack/StackItemRow';

export interface StackGroupCardProps {
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
  allowManualMove?: boolean;
  canDeleteStack?: boolean;
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
  allowManualMove = true,
  canDeleteStack = true,
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
      await onQuickAddItem(stack.id, newTitle.trim(), newAssigneeId || null, nextAssigneeIds);
      setNewTitle('');
    } finally {
      setAdding(false);
    }
  };

  return (
    <section className="rounded-2xl bg-slate-900/80 border border-slate-800/90 shadow-lg shadow-black/20 overflow-hidden transition">
      <div className="h-1 w-full" style={{ backgroundColor: stack.color }} />

      <div className="p-4 sm:px-5 sm:py-4 flex flex-col gap-3 border-b border-slate-800/70">
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            onClick={() => onUpdateStack(stack.id, { collapsed: !stack.collapsed })}
            className="flex items-start gap-2.5 text-left group cursor-pointer min-w-0 flex-1"
          >
            <span className="mt-0.5 p-1 rounded-lg bg-slate-800/80 text-slate-400 group-hover:text-foreground transition">
              {stack.collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-foreground leading-snug">{stack.title}</h3>
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

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              title={stack.sequentialLock ? 'Đang bật khóa tuần tự: Phải hoàn thành mục trên mới tick được mục dưới' : 'Nhấn để bật khóa thứ tự tuần tự cho Stack này'}
              onClick={() => onUpdateStack(stack.id, { sequentialLock: !stack.sequentialLock })}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer ${stack.sequentialLock ? 'bg-amber-500/15 text-amber-300 border-amber-500/35' : 'bg-slate-800/70 text-slate-400 border-slate-700/70 hover:text-slate-200'}`}
            >
              {stack.sequentialLock ? <><Lock className="w-3 h-3" /><span className="hidden sm:inline">Tuần tự</span></> : <><Unlock className="w-3 h-3" /><span className="hidden sm:inline">Tự do</span></>}
            </button>

            {allowManualMove && (
              <div className="hidden sm:flex items-center bg-slate-950/60 rounded-lg border border-slate-800">
                <button type="button" disabled={stackIndex === 0} onClick={() => onMoveStack(stack.id, 'up')} title="Đưa Stack lên trên" className="p-1 text-slate-400 hover:text-foreground disabled:opacity-30 cursor-pointer"><ChevronUp className="w-3.5 h-3.5" /></button>
                <button type="button" disabled={stackIndex === totalStacks - 1} onClick={() => onMoveStack(stack.id, 'down')} title="Đưa Stack xuống dưới" className="p-1 text-slate-400 hover:text-foreground disabled:opacity-30 cursor-pointer"><ChevronDown className="w-3.5 h-3.5" /></button>
              </div>
            )}

            {canDeleteStack && (
              <button type="button" onClick={() => { if (window.confirm(`Xóa "${stack.title}" và toàn bộ các mục bên trong?`)) onDeleteStack(stack.id); }} title="Xóa Stack" className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
            )}
          </div>
        </div>

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
              {visibleItems.map((item) => (
                <StackItemRow
                  key={item.id}
                  item={item}
                  stack={stack}
                  allStackItems={allStackItems}
                  memberMap={memberMap}
                  currentMember={currentMember}
                  onToggleItem={onToggleItem}
                  onSelectItem={onSelectItem}
                  onNotifyBlockedSequence={onNotifyBlockedSequence}
                />
              ))}
            </ul>
          )}

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
