import { useEffect } from 'react';
import { BellRing, ExternalLink, X } from 'lucide-react';
import type { AppNotice } from '../types/models';

interface Props {
  notice: AppNotice | null;
  onDismiss: () => void;
  onOpenTask: (taskId: string, noticeId: string) => void;
}

export function LiveNoticeToast({ notice, onDismiss, onOpenTask }: Props) {
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => {
      onDismiss();
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [notice, onDismiss]);

  if (!notice) return null;

  const headline =
    notice.kind === 'subtask_assigned'
      ? `${notice.actorName} vừa giao phần việc nhỏ cho bạn`
      : notice.kind === 'task_assigned'
        ? `${notice.actorName} vừa giao việc mới cho bạn`
        : `${notice.actorName} ${notice.activityDetail || 'vừa cập nhật dự án'}`;

  const targetLabel = notice.subtaskTitle?.trim() || notice.taskTitle;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-18 right-3 z-[80] flex w-[calc(100vw-1.5rem)] max-w-sm items-start gap-3 rounded-2xl border border-indigo-500/50 bg-slate-900/95 p-3.5 shadow-2xl shadow-black/70 backdrop-blur sm:bottom-auto sm:right-5 sm:top-18"
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 text-amber-300 ring-1 ring-indigo-500/40">
        <BellRing className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold leading-snug text-foreground">{headline}</p>
        <p className="mt-0.5 truncate text-xs font-medium text-indigo-200">“{targetLabel}”</p>
        {notice.taskId && (
          <button
            type="button"
            onClick={() => {
              onOpenTask(notice.taskId, notice.id);
              onDismiss();
            }}
            className="mt-2 inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-500 cursor-pointer"
          >
            <ExternalLink className="h-3 w-3" /> Xem đầu việc
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Đóng thông báo nhanh"
        className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-foreground cursor-pointer"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
