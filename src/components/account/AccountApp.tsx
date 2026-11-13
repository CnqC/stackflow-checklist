import { useEffect, useState } from 'react';
import { Bell, Palette, RefreshCw, X } from 'lucide-react';
import { AppearanceSettings } from '../AppearanceSettings';
import { NotificationSettings } from '../NotificationSettings';
import { UpdateBanner, UpdateSettings } from '../UpdateSettings';
import { accountAuthService, type AccountIdentity } from '../../infrastructure/auth/accountAuthService';
import { AccountLogin } from './AccountLogin';
import { ProjectDashboard } from './ProjectDashboard';
import { ProjectWorkspace } from './ProjectWorkspace';

type SettingsPanel = 'appearance' | 'notifications' | 'updates';

export function AccountApp() {
  const [identity, setIdentity] = useState<AccountIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState<SettingsPanel>('appearance');

  useEffect(() => {
    let active = true;
    let unsubscribe: () => void = () => undefined;
    let stopNative: () => void = () => undefined;
    try {
      unsubscribe = accountAuthService.subscribe((next) => {
        if (active) setIdentity(next);
      });
      void accountAuthService.currentIdentity()
        .then((next) => { if (active) setIdentity(next); })
        .catch((cause: unknown) => {
          if (active) setError(cause instanceof Error ? cause.message : String(cause));
        })
        .finally(() => { if (active) setLoading(false); });
      void accountAuthService.listenNativeRedirect((cause) => {
        if (active) setError(cause.message);
      }).then((stop) => {
        if (active) stopNative = stop;
        else stop();
      }).catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      });
    } catch (cause) {
      queueMicrotask(() => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setLoading(false);
      });
    }
    return () => { active = false; unsubscribe(); stopNative(); };
  }, []);

  function openProject(id: string) {
    setProjectId(id);
  }

  function backToProjects() {
    setProjectId(null);
  }

  async function signOut() {
    try {
      await accountAuthService.signOut();
      backToProjects();
      setIdentity(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return <>
    {loading ? <main className="flex min-h-dvh items-center justify-center text-slate-300">Đang mở StackFlow...</main>
      : identity ? projectId
        ? <ProjectWorkspace projectId={projectId} identity={identity} onBack={backToProjects} onSettings={() => { setSettingsPanel('appearance'); setSettingsOpen(true); }} />
        : <ProjectDashboard identity={identity} onOpen={openProject} onSignOut={() => void signOut()} onSettings={() => { setSettingsPanel('appearance'); setSettingsOpen(true); }} />
        : <AccountLogin error={error} />}

    {settingsOpen && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-3" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-label="Cài đặt" className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4"><div><h2 className="text-lg font-bold text-foreground">Cài đặt</h2><p className="text-xs text-slate-400">Chọn mục bạn muốn thay đổi</p></div><button type="button" aria-label="Đóng cài đặt" onClick={() => setSettingsOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800"><X className="h-5 w-5" /></button></div>
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav role="tablist" className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-800 p-3 sm:w-48 sm:flex-col sm:border-b-0 sm:border-r" aria-label="Các mục cài đặt">
            {([
              ['appearance', 'Giao diện', Palette],
              ['notifications', 'Thông báo', Bell],
              ['updates', 'Cập nhật', RefreshCw],
            ] as const).map(([panel, label, Icon]) => <button type="button" role="tab" key={panel} aria-selected={settingsPanel === panel} aria-controls="account-settings-panel" onClick={() => setSettingsPanel(panel)} className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium sm:w-full ${settingsPanel === panel ? 'bg-indigo-500/20 text-indigo-200' : 'text-slate-400 hover:bg-slate-900 hover:text-foreground'}`}><Icon className="h-4 w-4" />{label}</button>)}
          </nav>
          <div role="tabpanel" id="account-settings-panel" className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
            {settingsPanel === 'appearance' && <section aria-label="Cài đặt giao diện"><h3 className="mb-4 text-base font-semibold text-foreground">Giao diện</h3><AppearanceSettings /></section>}
            {settingsPanel === 'notifications' && <section aria-label="Cài đặt thông báo"><h3 className="mb-4 text-base font-semibold text-foreground">Thông báo</h3>{projectId && identity ? <NotificationSettings workspaceId={projectId} memberId={identity.id} /> : <p className="text-sm text-slate-400">Mở một dự án để chỉnh thông báo của dự án đó.</p>}</section>}
            {settingsPanel === 'updates' && <section aria-label="Kiểm tra cập nhật"><h3 className="mb-4 text-base font-semibold text-foreground">Cập nhật ứng dụng</h3><UpdateSettings /></section>}
          </div>
        </div>
      </section>
    </div>}
    <UpdateBanner />
  </>;
}
