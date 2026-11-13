import { useEffect, useState } from 'react';
import { Bell, Cloud, Download, Palette, X } from 'lucide-react';
import { AppearanceSettings } from './AppearanceSettings';
import { DeviceNotificationSettings } from './DeviceNotificationSettings';
import { NotificationSettings } from './NotificationSettings';
import { UpdateSettings } from './UpdateSettings';
import type { SyncMode, WorkspaceSnapshot } from '../types/models';

type SettingsTab = 'appearance' | 'notifications' | 'application';

interface Props {
  open: boolean;
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

export function AppSettingsModal({ open, onClose, snapshot, memberId, syncMode, onOpenCloud, onOpenInstall }: Props) {
  const [tab, setTab] = useState<SettingsTab>('appearance');
  const activeTab = tab === 'notifications' && (!snapshot || !memberId) ? 'appearance' : tab;
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return <div className="fixed inset-0 z-[90] bg-black/65 backdrop-blur-sm p-3 sm:p-6 flex items-center justify-center" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label="Cài đặt" className="w-full max-w-2xl max-h-[90dvh] flex flex-col rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl overflow-hidden">
      <div className="px-4 sm:px-5 py-4 flex items-center justify-between border-b border-slate-800">
        <div><h2 className="text-base font-bold text-foreground">Cài đặt</h2><p className="text-xs text-slate-400">Tùy chỉnh trải nghiệm trên thiết bị này</p></div>
        <button type="button" aria-label="Đóng cài đặt" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:text-foreground hover:bg-slate-800 cursor-pointer"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex border-b border-slate-800 px-3 sm:px-5 overflow-x-auto" role="tablist" aria-label="Mục cài đặt">
        {TABS.filter(({ id }) => id !== 'notifications' || (snapshot && memberId)).map(({ id, label, Icon }) => <button key={id} type="button" role="tab" aria-selected={activeTab === id} onClick={() => setTab(id)}
          className={`inline-flex items-center gap-1.5 px-3 py-3 text-xs font-semibold border-b-2 whitespace-nowrap cursor-pointer ${activeTab === id ? 'text-indigo-300 border-indigo-500' : 'text-slate-400 border-transparent hover:text-foreground'}`}>
          <Icon className="w-4 h-4" />{label}
        </button>)}
      </div>
      <div className="overflow-y-auto p-4 sm:p-5">
        {activeTab === 'appearance' && <AppearanceSettings />}
        {activeTab === 'notifications' && snapshot && memberId && <div className="space-y-6"><DeviceNotificationSettings snapshot={snapshot} memberId={memberId} syncMode={syncMode} /><div className="border-t border-slate-800 pt-5"><NotificationSettings workspaceId={snapshot.workspace.id} memberId={memberId} /></div></div>}
        {activeTab === 'application' && <div className="space-y-3">
          <h3 className="text-sm font-bold text-foreground">Ứng dụng và đồng bộ</h3>
          <UpdateSettings />
          {snapshot && memberId && <><button type="button" onClick={onOpenCloud} className="w-full flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 p-3 text-left cursor-pointer"><Cloud className="w-5 h-5 text-indigo-400" /><span><span className="block text-xs font-semibold text-foreground">Đồng bộ dữ liệu</span><span className="block text-[11px] text-slate-400">Chế độ hiện tại: {syncMode === 'supabase' ? 'Supabase Cloud' : syncMode === 'relay' ? 'Internet E2EE' : 'Local'}</span></span></button>
          <button type="button" onClick={onOpenInstall} className="w-full flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 p-3 text-left cursor-pointer"><Download className="w-5 h-5 text-indigo-400" /><span><span className="block text-xs font-semibold text-foreground">Cài đặt ứng dụng</span><span className="block text-[11px] text-slate-400">Xem cách cài trên Windows và thiết bị khác</span></span></button></>}
        </div>}
      </div>
    </div>
  </div>;
}
