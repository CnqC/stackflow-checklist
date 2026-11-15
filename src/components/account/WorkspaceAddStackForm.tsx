import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { ProjectStack } from '../../core/domain/accountProject';
import { STACK_PALETTE } from '../../core/domain/accountStack';

interface Props {
  busy: boolean;
  onClose: () => void;
  onCreate: (input: {
    title: string;
    description: string;
    color: string;
    sequentialLock: boolean;
    priority: ProjectStack['priority'];
  }) => Promise<boolean>;
}

export function WorkspaceAddStackForm({ busy, onClose, onCreate }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string>(STACK_PALETTE[0]);
  const [sequentialLock, setSequentialLock] = useState(false);
  const [priority, setPriority] = useState<ProjectStack['priority']>('medium');

  async function submit(event: FormEvent) {
    event.preventDefault();
    const ok = await onCreate({
      title: title.trim(),
      description: description.trim(),
      color,
      sequentialLock,
      priority,
    });
    if (ok) {
      setTitle('');
      setDescription('');
      setSequentialLock(false);
      setPriority('medium');
      onClose();
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="mt-5 space-y-4 rounded-2xl border border-indigo-500/40 bg-slate-900 p-4 shadow-xl sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-foreground">Tạo Stack / Giai đoạn mới</h2>
        <button type="button" onClick={onClose} aria-label="Đóng tạo Stack" className="text-slate-400 hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input required autoFocus maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Stack 5 — Phát hành & Marketing" aria-label="Tên Stack" className="min-h-11 min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3.5 text-sm text-foreground focus:border-indigo-500 focus:outline-none" />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Mô tả ngắn mục tiêu của Stack này (tùy chọn)" aria-label="Mô tả Stack" className="min-h-11 min-w-0 rounded-xl border border-slate-700 bg-slate-950 px-3.5 text-sm text-foreground focus:border-indigo-500 focus:outline-none" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={sequentialLock} onChange={(e) => setSequentialLock(e.target.checked)} className="accent-indigo-500" />
            Khóa thứ tự tuần tự (xong bước trên mới mở bước dưới)
          </label>
          <fieldset className="flex items-center gap-2" aria-label="Màu Stack">
            <legend className="sr-only">Màu Stack</legend>
            {STACK_PALETTE.map((c) => (
              <button key={c} type="button" aria-label={`Chọn màu ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} className={`h-5 w-5 rounded-full ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900' : ''}`} style={{ backgroundColor: c }} />
            ))}
          </fieldset>
          <label className="flex items-center gap-2 text-xs text-slate-300">
            Mức độ ưu tiên
            <select value={priority} onChange={(e) => setPriority(e.target.value as ProjectStack['priority'])} className="min-h-9 rounded-lg border border-slate-700 bg-slate-950 px-2 text-xs text-foreground">
              <option value="low">Thấp</option>
              <option value="medium">Trung bình</option>
              <option value="high">Cao</option>
            </select>
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-xs text-slate-400 hover:text-foreground">Hủy</button>
          <button type="submit" disabled={busy} className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Tạo Stack</button>
        </div>
      </div>
    </form>
  );
}
