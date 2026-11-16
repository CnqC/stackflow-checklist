import { useEffect, useState } from 'react';
import { Bell, Cloud, Download, Palette, X } from 'lucide-react';
import { AppearanceSettings } from './AppearanceSettings';
import { DeviceNotificationSettings } from './DeviceNotificationSettings';
import { NotificationSettings } from './NotificationSettings';
import { UpdateSettings } from './UpdateSettings';
import { AppInstallTab } from './account/team/AppInstallTab';
import type { SyncMode, WorkspaceSnapshot } from '../types/models';

export type SettingsTab = 'appearance' | 'notifications' | 'application';

interface Props {
  open: boolean;
  initialTab?: SettingsTab;
  onClose: () => void;
  snapshot: WorkspaceSnapshot | null;
  memberId: string | null;
  syncMode: SyncMode;
  onOpenCloud: () => void;
  onOpenInstall: () => void;
}

const TABS = [
  { id: 'appearance', label: 'Giao diện', Icon: Palette },
  { id: 'notifications', label: 'Thông báo', Icon: Bell },
  { id: 'application', label: 'Ứng dụng', Icon: Download },
] as const;

export function AppSettingsModal({
  open,
  initialTab = 'appearance',
  onClose,
  snapshot,
  memberId,
  syncMode,
  onOpenCloud,
  onOpenInstall,
}: Props) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const effectiveWorkspaceId = snapshot?.workspace.id ?? 'global';
  const effectiveMemberId = memberId ?? 'default';

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Cài đặt"
        className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-4 sm:px-5">
          <div>
            <h2 className="text-base font-bold text-foreground">Cài đặt</h2>
            <p className="text-xs text-slate-400">Tùy chỉnh giao diện, chuông thông báo và cài đặt App</p>
          </div>
          <button
            type="button"
            aria-label="Đóng cài đặt"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-foreground cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex overflow-x-auto border-b border-slate-800 px-3 sm:px-5" role="tablist" aria-label="Mục cài đặt">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-3 text-xs font-semibold cursor-pointer ${
                tab === id
                  ? 'border-indigo-500 text-indigo-300'
                  : 'border-transparent text-slate-400 hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto p-4 sm:p-5">
          {tab === 'appearance' && <AppearanceSettings />}
          {tab === 'notifications' && (
            <div className="space-y-6">
              {snapshot && memberId ? (
                <>
                  <DeviceNotificationSettings snapshot={snapshot} memberId={memberId} syncMode={syncMode} />
                  <div className="border-t border-slate-800 pt-5">
                    <NotificationSettings workspaceId={effectiveWorkspaceId} memberId={effectiveMemberId} />
                  </div>
                </>
              ) : (
                <>
                  <p className="rounded-xl border border-indigo-500/35 bg-indigo-500/10 p-3 text-xs text-indigo-200">
                    Hãy mở một dự án bất kỳ để cấu hình riêng theo dự án &amp; bắn thử thông báo nổi. Bạn vẫn có thể nghe thử 10 tiếng chuông ngay bên dưới!
                  </p>
                  <NotificationSettings workspaceId={effectiveWorkspaceId} memberId={effectiveMemberId} />
                </>
              )}
            </div>
          )}
          {tab === 'application' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-foreground">Ứng dụng và đồng bộ</h3>
              <UpdateSettings />
              {snapshot && memberId && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenCloud();
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 p-3 text-left hover:bg-slate-800 cursor-pointer"
                >
                  <Cloud className="h-5 w-5 text-emerald-400" />
                  <span>
                    <span className="block text-xs font-semibold text-foreground">Quản lý Nhóm &amp; Đồng bộ Google Cloud</span>
                    <span className="block text-[11px] text-slate-400">
                      Chế độ hiện tại: {syncMode === 'supabase' ? 'Google Cloud Realtime' : syncMode === 'relay' ? 'Internet E2EE' : 'Thiết bị này'}
                    </span>
                  </span>
                </button>
              )}
              <div className="border-t border-slate-800 pt-3" onClick={() => onOpenInstall()}>
                <AppInstallTab />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
