import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ExternalLink,
  Link2,
  ListChecks,
  Plus,
  Save,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { generateId } from '../domain/stackDomain';
import { priorityLabelVi, statusLabelVi } from '../services/syncService';
import type {
  ChecklistItem,
  Member,
  StackGroup,
  SubtaskItem,
  TaskLink,
  TaskPriority,
  TaskStatus,
} from '../types/models';

interface TaskDetailDrawerProps {
  item: ChecklistItem | null;
  stacks: StackGroup[];
  members: Member[];
  currentMember?: Member | null;
  onClose: () => void;
  onSaveItem: (
    itemId: string,
    patch: Partial<
      Pick<
        ChecklistItem,
        | 'title'
        | 'notes'
        | 'status'
        | 'priority'
        | 'assigneeId'
        | 'assigneeIds'
        | 'dueDate'
        | 'subtasks'
        | 'links'
        | 'stackId'
      >
    >,
  ) => Promise<void>;
  onDeleteItem: (itemId: string) => Promise<void>;
  onMoveItem: (itemId: string, direction: 'up' | 'down') => Promise<void>;
}

export const TaskDetailDrawer: React.FC<TaskDetailDrawerProps> = ({
  item,
  stacks,
  members,
  currentMember,
  onClose,
  onSaveItem,
  onDeleteItem,
  onMoveItem,
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

  const [newSubtask, setNewSubtask] = useState('');
  const [newSubtaskAssigneeId, setNewSubtaskAssigneeId] = useState<string>('');
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [saving, setSaving] = useState(false);

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
    setNewSubtask('');
    setNewSubtaskAssigneeId('');
    // Only reset draft fields when switching to a different task ID so auto-saving
    // subtasks/links/assignees never overwrites unsaved title or notes edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeItemId]);

  if (!item) return null;

  const memberMap = new Map(members.map((m) => [m.id, m]));

  const handleToggleAssigneePill = (memberId: string) => {
    const next = assigneeIds.includes(memberId)
      ? assigneeIds.filter((id) => id !== memberId)
      : [...assigneeIds, memberId];
    setAssigneeIds(next);
    void onSaveItem(item.id, {
      assigneeIds: next,
      assigneeId: next[0] ?? null,
    });
  };

  const handleClearAssignees = () => {
    setAssigneeIds([]);
    void onSaveItem(item.id, {
      assigneeIds: [],
      assigneeId: null,
    });
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSaveItem(item.id, {
        title: title.trim(),
        notes,
        status,
        priority,
        assigneeIds,
        assigneeId: assigneeIds[0] ?? null,
        stackId,
        dueDate: dueDate || null,
        subtasks,
        links,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleAddSubtask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtask.trim()) return;
    const next: SubtaskItem[] = [
      ...subtasks,
      {
        id: generateId(),
        title: newSubtask.trim(),
        completed: false,
        assigneeId: newSubtaskAssigneeId || null,
        completedByName: null,
      },
    ];
    setSubtasks(next);
    setNewSubtask('');
    setNewSubtaskAssigneeId('');
    void onSaveItem(item.id, { subtasks: next });
  };

  const handleToggleSubtask = (subId: string) => {
    const next = subtasks.map((s) => {
      if (s.id !== subId) return s;
      const nextCompleted = !s.completed;
      return {
        ...s,
        completed: nextCompleted,
        completedByName: nextCompleted ? (currentMember?.name ?? s.completedByName ?? null) : null,
      };
    });
    setSubtasks(next);
    void onSaveItem(item.id, { subtasks: next });
  };

  const handleChangeSubtaskAssignee = (subId: string, nextAssigneeId: string) => {
    const next = subtasks.map((s) =>
      s.id === subId ? { ...s, assigneeId: nextAssigneeId || null } : s,
    );
    setSubtasks(next);
    void onSaveItem(item.id, { subtasks: next });
  };

  const handleRemoveSubtask = (subId: string) => {
    const next = subtasks.filter((s) => s.id !== subId);
    setSubtasks(next);
    void onSaveItem(item.id, { subtasks: next });
  };

  const handleAddLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLinkUrl.trim()) return;
    const rawUrl = newLinkUrl.trim();
    const normalizedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    const next: TaskLink[] = [
      ...links,
      {
        id: generateId(),
        label: newLinkLabel.trim() || normalizedUrl,
        url: normalizedUrl,
      },
    ];
    setLinks(next);
    setNewLinkLabel('');
    setNewLinkUrl('');
    void onSaveItem(item.id, { links: next });
  };

  const handleRemoveLink = (linkId: string) => {
    const next = links.filter((l) => l.id !== linkId);
    setLinks(next);
    void onSaveItem(item.id, { links: next });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-slate-900 border-l border-slate-800 h-dvh flex flex-col justify-between safe-top safe-bottom shadow-2xl">
        {/* Drawer Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
              Chi tiết đầu việc
            </span>
            <div className="flex items-center bg-slate-950 rounded-lg border border-slate-800 ml-2">
              <button
                type="button"
                onClick={() => void onMoveItem(item.id, 'up')}
                title="Đưa lên trên trong Stack"
                className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void onMoveItem(item.id, 'down')}
                title="Đưa xuống dưới trong Stack"
                className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800/80 text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Tên công việc
            </label>
            <textarea
              rows={2}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-sm font-medium text-white focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Multi-Assignee Visual Avatar Pills */}
          <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <Users className="w-4 h-4 text-indigo-400" />
                <span>
                  Người cùng làm ({assigneeIds.length > 0 ? `${assigneeIds.length} người` : 'Chưa giao'})
                </span>
              </label>
              {assigneeIds.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAssignees}
                  className="text-[11px] text-slate-400 hover:text-rose-300 cursor-pointer"
                >
                  Bỏ chọn hết
                </button>
              )}
            </div>

            <p className="text-[11px] text-slate-400">
              Bấm vào tên thành viên để chọn 1 hoặc nhiều người cùng phụ trách đầu việc này:
            </p>

            <div className="flex flex-wrap gap-2">
              {members.map((m) => {
                const selected = assigneeIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleToggleAssigneePill(m.id)}
                    aria-pressed={selected}
                    className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer ${
                      selected
                        ? 'bg-indigo-600/25 border-indigo-400 text-white shadow-sm shadow-indigo-500/20'
                        : 'bg-slate-900/90 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                    }`}
                  >
                    <span
                      className="w-5 h-5 rounded-md text-[10px] font-bold text-white flex items-center justify-center shrink-0"
                      style={{ backgroundColor: m.color }}
                    >
                      {m.avatar}
                    </span>
                    <span>{m.name}</span>
                    {selected && (
                      <span className="w-4 h-4 rounded-full bg-indigo-500 text-white flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Grid Controls: Status, Priority, Stack, Deadline */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Trạng thái
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                {(['todo', 'doing', 'blocked', 'done'] as TaskStatus[]).map((st) => (
                  <option key={st} value={st}>
                    {statusLabelVi(st)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Mức ưu tiên
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                {(['high', 'medium', 'low'] as TaskPriority[]).map((pr) => (
                  <option key={pr} value={pr}>
                    {priorityLabelVi(pr)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Thuộc Stack / Giai đoạn
              </label>
              <select
                value={stackId}
                onChange={(e) => setStackId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                {stacks.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">
                Hạn chót (Deadline)
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-xs sm:text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Ghi chú chi tiết / Lý do kẹt (nếu có)
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ghi chú hướng dẫn, thông số kỹ thuật hoặc vấn đề cần đồng đội hỗ trợ..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-xs sm:text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Assigned Subtasks ("Chia phần việc nhỏ trong mục này") */}
          <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <ListChecks className="w-4 h-4 text-indigo-400" />
                Chia phần việc nhỏ trong mục này ({subtasks.filter((s) => s.completed).length}/
                {subtasks.length})
              </span>
            </div>

            {subtasks.length > 0 && (
              <ul className="space-y-2">
                {subtasks.map((sub) => {
                  const subAssignee = sub.assigneeId ? memberMap.get(sub.assigneeId) : undefined;
                  return (
                    <li
                      key={sub.id}
                      className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-slate-900/90 border border-slate-800/90 group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => handleToggleSubtask(sub.id)}
                          aria-label={`Đánh dấu xong bước nhỏ ${sub.title}`}
                          className={`w-5 h-5 rounded-md flex items-center justify-center border shrink-0 cursor-pointer ${
                            sub.completed
                              ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                              : 'bg-slate-950 border-slate-600 hover:border-indigo-400'
                          }`}
                        >
                          {sub.completed && <Check className="w-3 h-3 stroke-[3]" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <span
                            className={`block text-xs break-words ${
                              sub.completed ? 'line-through text-slate-500' : 'text-slate-100'
                            }`}
                          >
                            {sub.title}
                          </span>
                          {sub.completed && sub.completedByName && (
                            <span className="text-[10px] text-emerald-400/90">
                              ✓ {sub.completedByName} đã làm xong
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Compact Member Picker / Badge for each Subtask */}
                      <div className="flex items-center gap-1.5 shrink-0 ml-7 sm:ml-0">
                        <div className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-lg bg-slate-950 border border-slate-800">
                          {subAssignee ? (
                            <span
                              className="w-4 h-4 rounded text-[9px] font-bold text-white flex items-center justify-center shrink-0"
                              style={{ backgroundColor: subAssignee.color }}
                            >
                              {subAssignee.avatar}
                            </span>
                          ) : (
                            <span className="w-2 h-2 rounded-full bg-slate-600 shrink-0" />
                          )}
                          <select
                            value={sub.assigneeId ?? ''}
                            onChange={(e) => handleChangeSubtaskAssignee(sub.id, e.target.value)}
                            aria-label={`Chọn người làm phần việc nhỏ ${sub.title}`}
                            className="bg-transparent text-[11px] font-medium text-slate-200 focus:outline-none cursor-pointer"
                          >
                            <option value="" className="bg-slate-900 text-slate-300">
                              Ai làm?
                            </option>
                            {members.map((m) => (
                              <option key={m.id} value={m.id} className="bg-slate-900 text-white">
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveSubtask(sub.id)}
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

            <form
              onSubmit={handleAddSubtask}
              className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1"
            >
              <input
                type="text"
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                placeholder="Nhập bước nhỏ..."
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
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
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.role})
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 text-xs font-semibold text-white inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Thêm
                </button>
              </div>
            </form>
          </div>

          {/* Links Attachment */}
          <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3.5 space-y-2.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200">
              <Link2 className="w-4 h-4 text-sky-400" />
              Link tài liệu đính kèm (GitHub / Figma / Drive)
            </span>

            {links.length > 0 && (
              <ul className="space-y-1.5">
                {links.map((lnk) => (
                  <li
                    key={lnk.id}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800"
                  >
                    <a
                      href={lnk.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:underline truncate"
                    >
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{lnk.label}</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => handleRemoveLink(lnk.id)}
                      className="text-slate-500 hover:text-rose-400 p-0.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={handleAddLink} className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1">
              <input
                type="text"
                value={newLinkLabel}
                onChange={(e) => setNewLinkLabel(e.target.value)}
                placeholder="Tên link (VD: Thiết kế)"
                className="sm:col-span-2 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
              <div className="sm:col-span-3 flex gap-1.5">
                <input
                  type="text"
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                  placeholder="https://..."
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 cursor-pointer shrink-0"
                >
                  Đính kèm
                </button>
              </div>
            </form>
          </div>

          {item.updatedByName && (
            <p className="text-[11px] text-slate-500">
              Cập nhật gần nhất bởi <strong className="text-slate-300">{item.updatedByName}</strong>
            </p>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Xóa đầu việc "${item.title}"?`)) {
                void onDeleteItem(item.id).then(onClose);
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Xóa mục
          </button>

          <button
            type="button"
            disabled={saving || !title.trim()}
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </button>
        </div>
      </div>
    </div>
  );
};
