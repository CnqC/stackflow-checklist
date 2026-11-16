import React, { useEffect, useId, useRef, useState } from 'react';
import { Bell, BellRing, CheckCheck, SlidersHorizontal, Sparkles, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import { resolveNoticeStackTitle } from '../core/domain/noticePresentation';
import { notificationPreferencesStore } from '../infrastructure/notifications/notificationPreferencesStore';
import { notificationService } from '../infrastructure/notifications/notificationService';
import { notificationSoundService } from '../infrastructure/notifications/notificationSoundService';
import type { AppNotice, WorkspaceSnapshot } from '../types/models';

export interface NotificationBellProps {
  snapshot: WorkspaceSnapshot;
  memberId: string;
  memberName?: string;
  onOpenTask: (taskId: string) => void;
  onOpenSettings?: () => void;
  compact?: boolean;
}

function formatRelativeTimeVi(isoDate: string): string {
  const time = new Date(isoDate).getTime();
  if (Number.isNaN(time)) return 'Vừa xong';
  const diffSec = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (diffSec < 45) return 'Vừa xong';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} giờ trước`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} ngày trước`;
  return new Date(isoDate).toLocaleDateString('vi-VN');
}

function getNoticeBadgeStyle(notice: AppNotice): { label: string; className: string } {
  if (notice.kind === 'subtask_assigned') {
    return { label: 'Phần việc nhỏ', className: 'bg-sky-500/15 text-sky-300 border-sky-500/30' };
  }
  if (notice.kind === 'task_assigned') {
    return { label: 'Việc nhóm giao bạn', className: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' };
  }
  const act = notice.activityAction ?? '';
  if (act === 'check' || act.startsWith('create_')) {
    return { label: notice.activityBadge || 'Mới thêm', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
  }
  if (act.startsWith('delete_')) {
    return { label: notice.activityBadge || 'Đã xóa', className: 'bg-rose-500/15 text-rose-300 border-rose-500/30' };
  }
  if (act === 'join_member') {
    return { label: notice.activityBadge || 'Thành viên mới', className: 'bg-violet-500/15 text-violet-300 border-violet-500/30' };
  }
  return { label: notice.activityBadge || 'Cập nhật dự án', className: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  snapshot, memberId, memberName, onOpenTask, onOpenSettings, compact = false,
}) => {
  const workspaceId = snapshot.workspace.id;
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState<AppNotice[]>(() => notificationService.getNotices(workspaceId, memberId));
  const [soundEnabled, setSoundEnabled] = useState(() => notificationPreferencesStore.get(workspaceId, memberId).soundEnabled);
  const [permState, setPermState] = useState(() => notificationService.getPermissionState());
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const syncState = () => {
      setNotices(notificationService.getNotices(workspaceId, memberId));
      setPermState(notificationService.getPermissionState());
    };
    syncState();
    return notificationService.subscribeNotices(syncState);
  }, [workspaceId, memberId]);

  useEffect(() => {
    const syncPrefs = () => setSoundEnabled(notificationPreferencesStore.get(workspaceId, memberId).soundEnabled);
    syncPrefs();
    return notificationPreferencesStore.subscribe(syncPrefs);
  }, [workspaceId, memberId]);

  useEffect(() => notificationService.subscribeNoticeOpens(() => setOpen(false)), []);

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const unreadNotices = notices.filter((notice) => !notice.read);
  const readNotices = notices.filter((notice) => notice.read);
  const unreadCount = unreadNotices.length;
  const displayedNotices = [...unreadNotices, ...readNotices];

  const handleClickNotice = (notice: AppNotice) => {
    notificationService.markNoticeRead(notice.id, workspaceId, memberId);
    setOpen(false);
    if (notice.taskId) onOpenTask(notice.taskId);
  };

  const toggleQuickSound = () => {
    const next = !soundEnabled;
    notificationPreferencesStore.update(workspaceId, memberId, { soundEnabled: next });
    if (next) void notificationSoundService.preview(workspaceId, memberId);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={unreadCount > 0 ? `Thông báo việc mới (${unreadCount} chưa đọc)` : 'Mở hộp thông báo việc mới'}
        title="Xem thông báo công việc & hoạt động mới trong dự án"
        className={`relative inline-flex items-center gap-1.5 rounded-xl border transition cursor-pointer ${compact ? 'p-2' : 'px-3 py-2'} ${
          unreadCount > 0
            ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-200 hover:bg-indigo-600/30'
            : open ? 'bg-slate-800 border-slate-700 text-foreground' : 'bg-slate-900 hover:bg-slate-800 border-slate-700/80 text-slate-200'
        }`}
      >
        {unreadCount > 0 ? <BellRing className="w-4 h-4 text-amber-400" /> : <Bell className="w-4 h-4 text-indigo-400" />}
        {!compact && <span className="text-xs font-semibold hidden sm:inline">Thông báo</span>}
        {unreadCount > 0 && (
          <span className="min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-on-accent text-[10px] font-extrabold flex items-center justify-center shadow-sm shadow-rose-500/40">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div id={panelId} className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 z-50 max-h-[calc(100dvh-5rem)] flex flex-col rounded-2xl bg-slate-900 border border-slate-700/90 shadow-2xl shadow-black/60 overflow-hidden">
          <div className="px-4 py-3 bg-slate-950/90 border-b border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-bold text-foreground">Hộp báo việc của {memberName || 'bạn'}</span>
                  {unreadCount > 0 && (
                    <span className="shrink-0 whitespace-nowrap text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">{unreadCount} mới</span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">Báo ngay kèm âm thanh khi thêm Task, Stack hoặc giao việc</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {unreadCount > 0 && (
                  <button type="button" onClick={() => notificationService.markAllRead(workspaceId, memberId)} className="inline-flex shrink-0 whitespace-nowrap items-center gap-1 px-2 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 text-[11px] font-medium cursor-pointer" title="Đánh dấu đã đọc hết">
                    <CheckCheck className="w-3.5 h-3.5" /><span>Đã đọc hết</span>
                  </button>
                )}
                <button type="button" onClick={() => setOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-foreground hover:bg-slate-800 cursor-pointer" aria-label="Đóng hộp thông báo"><X className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5">
              <button type="button" onClick={toggleQuickSound} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold cursor-pointer ${soundEnabled ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-900 text-slate-400'}`}>
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                {soundEnabled ? 'Âm báo: Bật' : 'Âm báo: Tắt'}
              </button>
              <div className="flex items-center gap-1.5">
                {permState === 'default' && (
                  <button type="button" onClick={() => void notificationService.requestPermission().then(() => setPermState(notificationService.getPermissionState()))} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-500 cursor-pointer">
                    🔔 Bật thông báo nổi
                  </button>
                )}
                {onOpenSettings && (
                  <button type="button" onClick={() => { setOpen(false); onOpenSettings(); }} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800 cursor-pointer">
                    <SlidersHorizontal className="w-3 h-3 text-indigo-300" /> Đổi tiếng chuông
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/70">
            {notices.length === 0 ? (
              <div className="px-5 py-8 text-center space-y-2">
                <Sparkles className="w-6 h-6 text-indigo-400/70 mx-auto" />
                <div className="text-xs font-semibold text-slate-300">Chưa có thông báo mới nào</div>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto leading-relaxed">
                  Khi có Task mới, Stack mới, giao việc hoặc cập nhật tiến độ trong dự án, thông báo &amp; âm chuông sẽ báo ngay tại đây.
                </p>
              </div>
            ) : (
              displayedNotices.map((notice, index) => {
                const badge = getNoticeBadgeStyle(notice);
                const stackTitle = resolveNoticeStackTitle(notice, snapshot);
                return (
                  <React.Fragment key={notice.id}>
                    {(index === 0 || index === unreadCount) && (
                      <div className="px-4 py-1.5 bg-slate-950/70 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        {index === 0 && unreadCount > 0 ? `Chưa đọc (${unreadCount})` : `Đã đọc (${readNotices.length})`}
                      </div>
                    )}
                    <button type="button" onClick={() => handleClickNotice(notice)} className={`w-full text-left px-4 py-3 flex items-start gap-3 transition cursor-pointer ${notice.read ? 'bg-slate-900/40 hover:bg-slate-800/50 opacity-80' : 'bg-indigo-950/35 hover:bg-indigo-950/55'}`}>
                      <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${notice.read ? 'bg-slate-700' : 'bg-rose-500 ring-4 ring-rose-500/20'}`} />
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${badge.className}`}>{badge.label}</span>
                          <span className="text-[10px] text-slate-500 shrink-0">{formatRelativeTimeVi(notice.createdAt)}</span>
                        </div>
                        {stackTitle && <p className="text-[10px] font-medium text-slate-400 truncate">{stackTitle}</p>}
                        {notice.kind === 'project_activity' ? (
                          <p className="text-xs text-slate-100 font-medium leading-snug">
                            <strong className="text-foreground">{notice.actorName}</strong> {notice.activityDetail || 'vừa cập nhật'}:{' '}
                            <span className="text-emerald-200 font-semibold">{notice.subtaskTitle || notice.taskTitle}</span>
                          </p>
                        ) : notice.kind === 'subtask_assigned' ? (
                          <div className="space-y-0.5">
                            <p className="text-xs text-slate-100 font-medium leading-snug">
                              <strong className="text-foreground">{notice.actorName}</strong> vừa giao cho bạn:{' '}
                              <span className="text-sky-300 font-semibold">Phần việc nhỏ: {notice.subtaskTitle || notice.taskTitle}</span>
                            </p>
                            <p className="text-[11px] text-slate-400 truncate">Trong mục lớn: {notice.taskTitle}</p>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-100 font-medium leading-snug">
                            <strong className="text-foreground">{notice.actorName}</strong> vừa giao cho bạn:{' '}
                            <span className="text-indigo-200 font-semibold">{notice.taskTitle}</span>
                          </p>
                        )}
                      </div>
                    </button>
                  </React.Fragment>
                );
              })
            )}
          </div>

          {notices.length > 0 && (
            <div className="px-4 py-2 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">Tổng cộng {notices.length} thông báo</span>
              {readNotices.length > 0 && (
                <button type="button" onClick={() => notificationService.clearReadNotices(workspaceId, memberId)} className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-400 cursor-pointer">
                  <Trash2 className="w-3 h-3" /><span>Xóa đã đọc</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
