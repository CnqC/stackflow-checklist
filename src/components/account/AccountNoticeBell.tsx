import { useEffect, useRef, useState } from 'react';
import { Bell, BellRing, CheckCheck } from 'lucide-react';
import type { ProjectNotice } from '../../core/domain/accountProject';
import { notificationSoundService } from '../../infrastructure/notifications/notificationSoundService';

interface Props {
  projectId: string;
  memberId: string;
  notices: ProjectNotice[];
  onRead: (id: string) => void;
  onOpenTask: (taskId: string) => void;
}

export function AccountNoticeBell({ projectId, memberId, notices, onRead, onOpenTask }: Props) {
  const [open, setOpen] = useState(false);
  const knownIds = useRef<Set<string> | null>(null);
  const knownProject = useRef(projectId);
  const originalTitle = useRef(typeof document === 'undefined' ? 'StackFlow' : document.title);
  const unread = notices.filter((notice) => !notice.read_at).length;

  useEffect(() => {
    if (knownProject.current !== projectId) {
      knownProject.current = projectId;
      knownIds.current = null;
    }
    const currentIds = new Set(notices.map((notice) => notice.id));
    if (knownIds.current) {
      for (const notice of notices) {
        if (knownIds.current.has(notice.id) || notice.read_at) continue;
        notificationSoundService.playForNotice(projectId, memberId);
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          const title = notice.kind === 'subtask_assigned' ? 'Bạn được giao phần việc mới' : 'Bạn được giao việc mới';
          try { new Notification(title, { body: `${notice.actor_name}: ${notice.subtask_title ?? notice.task_title}` }); }
          catch { /* Some mobile browsers require service-worker notifications. */ }
        }
      }
    }
    knownIds.current = currentIds;
  }, [notices, projectId, memberId]);

  useEffect(() => {
    if (unread) document.title = `(${unread}) StackFlow`;
    else document.title = originalTitle.current;
    return () => { document.title = originalTitle.current; };
  }, [unread]);

  return <div className="relative">
    <button type="button" onClick={() => setOpen((value) => !value)} aria-label={`Thông báo, ${unread} chưa đọc`} aria-expanded={open} className="relative rounded-xl border border-slate-700 p-3 text-slate-200">{unread ? <BellRing className="h-5 w-5 text-indigo-300" /> : <Bell className="h-5 w-5" />}{unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-indigo-600 px-1.5 text-[10px] font-bold text-white">{unread}</span>}</button>
    {open && <section className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-slate-700 bg-slate-950 p-3 shadow-2xl" aria-label="Thông báo giao việc">
      <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-foreground">Thông báo</h2>{unread > 0 && <button type="button" onClick={() => notices.filter((notice) => !notice.read_at).forEach((notice) => onRead(notice.id))} className="flex items-center gap-1 text-xs text-indigo-300"><CheckCheck className="h-4 w-4" />Đọc hết</button>}</div>
      {typeof Notification !== 'undefined' && Notification.permission === 'default' && <button type="button" onClick={() => void Notification.requestPermission()} className="mt-3 text-xs text-indigo-300 underline">Bật thông báo trên thiết bị</button>}
      <div className="mt-3 max-h-80 space-y-1 overflow-y-auto">{notices.length === 0 ? <p className="p-3 text-xs text-slate-400">Chưa có thông báo.</p> : [...notices].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 100).map((notice) =>
        <button type="button" key={notice.id} onClick={() => { if (!notice.read_at) onRead(notice.id); onOpenTask(notice.task_id); setOpen(false); }} className={`block w-full rounded-lg p-3 text-left text-xs ${notice.read_at ? 'text-slate-400' : 'bg-indigo-500/10 text-slate-200'}`}>
          <span className="block font-semibold">{notice.actor_name} giao {notice.kind === 'subtask_assigned' ? 'phần việc' : 'việc'} cho bạn</span>
          <span className="mt-1 block">{notice.subtask_title ?? notice.task_title}</span>
          <time dateTime={notice.created_at} className="mt-1 block text-[11px] text-slate-500">{new Date(notice.created_at).toLocaleString('vi-VN')}</time>
        </button>)}</div>
    </section>}
  </div>;
}
