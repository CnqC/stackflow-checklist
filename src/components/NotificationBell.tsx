import React, { useEffect, useRef, useState } from 'react';
import { Bell, BellRing, Check, CheckCheck, Sparkles, Trash2, X } from 'lucide-react';
import {
  notificationService,
  type NotificationPermissionState,
} from '../infrastructure/notifications/notificationService';
import type { AppNotice } from '../types/models';

export interface NotificationBellProps {
  workspaceId: string;
  memberId: string;
  memberName?: string;
  onOpenTask: (taskId: string) => void;
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

export const NotificationBell: React.FC<NotificationBellProps> = ({
  workspaceId,
  memberId,
  memberName,
  onOpenTask,
  compact = false,
}) => {
  const [open, setOpen] = useState(false);
  const [notices, setNotices] = useState<AppNotice[]>(() =>
    notificationService.getNotices(workspaceId, memberId),
  );
  const [permission, setPermission] = useState<NotificationPermissionState>(() =>
    notificationService.getPermissionState(),
  );
  const [requestingPerm, setRequestingPerm] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const syncState = () => {
      setNotices(notificationService.getNotices(workspaceId, memberId));
      setPermission(notificationService.getPermissionState());
    };
    syncState();
    const unsub = notificationService.subscribeNotices(() => {
      syncState();
    });
    return unsub;
  }, [workspaceId, memberId]);

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const unreadCount = notices.filter((n) => !n.read).length;

  const handleEnableNotifications = async () => {
    if (requestingPerm) return;
    setRequestingPerm(true);
    try {
      await notificationService.requestPermission();
      setPermission(notificationService.getPermissionState());
    } finally {
      setRequestingPerm(false);
    }
  };

  const handleClickNotice = (notice: AppNotice) => {
    notificationService.markNoticeRead(notice.id, workspaceId, memberId);
    setOpen(false);
    onOpenTask(notice.taskId);
  };

  const handleMarkAllRead = () => {
    notificationService.markAllRead(workspaceId, memberId);
  };

  const handleClearNotices = () => {
    notificationService.clearNotices(workspaceId, memberId);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={
          unreadCount > 0
            ? `Thông báo việc mới (${unreadCount} chưa đọc)`
            : 'Mở hộp thông báo việc mới'
        }
        title="Xem thông báo việc mới được giao cho bạn"
        className={`relative inline-flex items-center gap-1.5 rounded-xl border transition cursor-pointer ${
          compact ? 'p-2' : 'px-3 py-2'
        } ${
          unreadCount > 0
            ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-200 hover:bg-indigo-600/30'
            : open
              ? 'bg-slate-800 border-slate-700 text-white'
              : 'bg-slate-900 hover:bg-slate-800 border-slate-700/80 text-slate-200'
        }`}
      >
        {unreadCount > 0 ? (
          <BellRing className="w-4 h-4 text-amber-400 animate-pulse" />
        ) : (
          <Bell className="w-4 h-4 text-indigo-400" />
        )}
        {!compact && (
          <span className="text-xs font-semibold hidden sm:inline">Thông báo</span>
        )}
        {unreadCount > 0 && (
          <span className="min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-extrabold flex items-center justify-center shadow-sm shadow-rose-500/40">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 z-50 rounded-2xl bg-slate-900 border border-slate-700/90 shadow-2xl shadow-black/60 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white">
                  Hộp báo việc của {memberName || 'bạn'}
                </span>
                {unreadCount > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    {unreadCount} mới
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Bấm vào dòng thông báo để mở thẳng đầu việc đó
              </p>
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 text-[11px] font-medium cursor-pointer"
                  title="Đánh dấu đã đọc hết"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Đánh dấu đã đọc hết</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                aria-label="Đóng hộp thông báo"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 1-Tap OS / Browser Notification Permission Banner */}
          <div className="px-4 py-2.5 bg-slate-900/95 border-b border-slate-800/80">
            {permission === 'granted' ? (
              <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-3 py-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-medium">✓ Đã bật báo chuông khi có việc mới</span>
              </div>
            ) : permission === 'denied' ? (
              <div className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2 leading-relaxed">
                Bạn đang tắt quyền thông báo trên trình duyệt / điện thoại. Hãy bật lại trong Cài đặt để nghe chuông khi đồng đội giao việc nhé!
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void handleEnableNotifications()}
                disabled={requestingPerm}
                className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 disabled:opacity-60 text-xs font-semibold text-white shadow-md shadow-indigo-600/20 flex items-center justify-center gap-1.5 cursor-pointer transition"
              >
                <span>
                  {requestingPerm
                    ? 'Đang bật chuông báo...'
                    : '🔔 Bật báo chuông trên điện thoại / trình duyệt'}
                </span>
              </button>
            )}
          </div>

          {/* Notice List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/70">
            {notices.length === 0 ? (
              <div className="px-5 py-8 text-center space-y-2">
                <Sparkles className="w-6 h-6 text-indigo-400/70 mx-auto" />
                <div className="text-xs font-semibold text-slate-300">
                  Chưa có thông báo giao việc mới nào
                </div>
                <p className="text-[11px] text-slate-500 max-w-xs mx-auto leading-relaxed">
                  Khi đồng đội thêm tên bạn vào một đầu việc hoặc giao phần việc nhỏ cho bạn, thông báo sẽ hiện ngay tại đây.
                </p>
              </div>
            ) : (
              notices.map((notice) => {
                const isSubtask = notice.kind === 'subtask_assigned';
                return (
                  <button
                    key={notice.id}
                    type="button"
                    onClick={() => handleClickNotice(notice)}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 transition cursor-pointer ${
                      notice.read
                        ? 'bg-slate-900/40 hover:bg-slate-800/50 opacity-80'
                        : 'bg-indigo-950/35 hover:bg-indigo-950/55'
                    }`}
                  >
                    <span
                      className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${
                        notice.read ? 'bg-slate-700' : 'bg-rose-500 ring-4 ring-rose-500/20'
                      }`}
                    />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                            isSubtask
                              ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                              : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                          }`}
                        >
                          {isSubtask ? 'Phần việc nhỏ' : 'Việc nhóm giao bạn'}
                        </span>
                        <span className="text-[10px] text-slate-500 shrink-0">
                          {formatRelativeTimeVi(notice.createdAt)}
                        </span>
                      </div>

                      {isSubtask ? (
                        <div className="space-y-0.5">
                          <p className="text-xs text-slate-100 font-medium leading-snug">
                            <strong className="text-white">{notice.actorName}</strong> vừa giao cho bạn:{' '}
                            <span className="text-sky-300 font-semibold">
                              Phần việc nhỏ: {notice.subtaskTitle || notice.taskTitle}
                            </span>
                          </p>
                          <p className="text-[11px] text-slate-400 truncate">
                            Trong mục lớn: {notice.taskTitle}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-100 font-medium leading-snug">
                          <strong className="text-white">{notice.actorName}</strong> vừa giao cho bạn:{' '}
                          <span className="text-indigo-200 font-semibold">{notice.taskTitle}</span>
                        </p>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          {notices.length > 0 && (
            <div className="px-4 py-2 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Tổng cộng {notices.length} thông báo
              </span>
              <button
                type="button"
                onClick={handleClearNotices}
                className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-rose-400 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Xóa lịch sử</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
