import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { AppearanceSettings } from '../AppearanceSettings';
import { NotificationSettings } from '../NotificationSettings';
import { UpdateBanner, UpdateSettings } from '../UpdateSettings';
import { accountAuthService, type AccountIdentity } from '../../infrastructure/auth/accountAuthService';
import { AccountLogin } from './AccountLogin';
import { ProjectDashboard } from './ProjectDashboard';
import { ProjectWorkspace } from './ProjectWorkspace';

export function AccountApp() {
  const [identity, setIdentity] = useState<AccountIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
        ? <ProjectWorkspace projectId={projectId} identity={identity} onBack={backToProjects} onSettings={() => setSettingsOpen(true)} />
        : <ProjectDashboard identity={identity} onOpen={openProject} onSignOut={() => void signOut()} onSettings={() => setSettingsOpen(true)} />
        : <AccountLogin error={error} />}

    {settingsOpen && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-3" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-label="Cài đặt" className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between"><div><h2 className="text-lg font-bold text-foreground">Cài đặt</h2><p className="text-xs text-slate-400">Giao diện và phiên bản ứng dụng</p></div><button type="button" aria-label="Đóng cài đặt" onClick={() => setSettingsOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800"><X className="h-5 w-5" /></button></div>
        <AppearanceSettings />
        {projectId && identity && <div className="mt-7 border-t border-slate-800 pt-5"><h3 className="mb-4 font-semibold text-foreground">Thông báo</h3><NotificationSettings workspaceId={projectId} memberId={identity.id} /></div>}
        <div className="mt-7 border-t border-slate-800 pt-5"><UpdateSettings /></div>
      </section>
    </div>}
    <UpdateBanner />
  </>;
}
