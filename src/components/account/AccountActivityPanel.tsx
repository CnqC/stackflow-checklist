import { Activity } from 'lucide-react';
import type { ProjectActivity } from '../../core/domain/accountProject';

const labels: Record<string, string> = {
  create_task: 'tạo việc', update_task: 'sửa việc', delete_task: 'xóa việc',
  check: 'hoàn thành', uncheck: 'mở lại',
  create_stack: 'tạo Stack', update_stack: 'sửa Stack', delete_stack: 'xóa Stack',
  create_subtask: 'tạo phần việc nhỏ', update_subtask: 'sửa phần việc nhỏ',
  delete_subtask: 'xóa phần việc nhỏ',
};

export function AccountActivityPanel({ activities }: { activities: ProjectActivity[] }) {
  return <section className="rounded-2xl border border-slate-700 bg-slate-900/80 p-4" aria-label="Nhật ký hoạt động">
    <h2 className="flex items-center gap-2 font-semibold text-foreground"><Activity className="h-4 w-4 text-indigo-300" />Nhật ký hoạt động</h2>
    {activities.length === 0 ? <p className="mt-4 text-sm text-slate-400">Chưa có hoạt động.</p>
      : <ol className="mt-4 space-y-3">{[...activities].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100).map((item) =>
        <li key={item.id} className="border-l-2 border-indigo-500/50 pl-3 text-xs text-slate-300">
          <p><span className="font-semibold text-foreground">{item.actor_name}</span> {labels[item.action_type] ?? item.action_type} <span className="font-medium text-indigo-200">{item.target_title}</span></p>
          {item.detail && <p className="mt-1 text-slate-400">{item.detail}</p>}
          <time dateTime={item.created_at} className="mt-1 block text-slate-500">{new Date(item.created_at).toLocaleString('vi-VN')}</time>
        </li>)}</ol>}
  </section>;
}
