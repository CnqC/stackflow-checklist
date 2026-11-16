import { useCallback, useEffect, useState } from 'react';
import { AppSettingsModal, type SettingsTab } from '../AppSettingsModal';
import { UpdateBanner } from '../UpdateSettings';
import { translateAccountError } from '../../core/domain/projectShareLinks';
import { accountAuthService, type AccountIdentity } from '../../infrastructure/auth/accountAuthService';
import { capturePendingJoinCodeFromUrl } from '../../infrastructure/projects/accountTeamInviteRepository';
import { pwaInstallManager } from '../../infrastructure/pwa/pwaInstallManager';
import type { WorkspaceSnapshot } from '../../types/models';
import { AccountLogin } from './AccountLogin';
import { ProjectDashboard } from './ProjectDashboard';
import { ProjectWorkspace } from './ProjectWorkspace';

export function AccountApp() {
  const [identity, setIdentity] = useState<AccountIdentity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('appearance');
  const [activeSnapshot, setActiveSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [activeMemberId, setActiveMemberId] = useState<string | null>(null);

  useEffect(() => {
    capturePendingJoinCodeFromUrl();
    pwaInstallManager.start();
    const syncJoinNavigation = () => {
      if (capturePendingJoinCodeFromUrl()) {
        setProjectId(null);
      }
    };
    window.addEventListener('popstate', syncJoinNavigation);
    window.addEventListener('hashchange', syncJoinNavigation);

    let active = true;
    let unsubscribe: () => void = () => undefined;
    let stopNative: () => void = () => undefined;
    try {
      unsubscribe = accountAuthService.subscribe((next) => {
        if (active) setIdentity(next);
      });
      void accountAuthService
        .currentIdentity()
        .then((next) => {
          if (active) setIdentity(next);
        })
        .catch((cause: unknown) => {
          if (active) setError(translateAccountError(cause));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      void accountAuthService
        .listenNativeRedirect((cause) => {
          if (active) setError(translateAccountError(cause));
        })
        .then((stop) => {
          if (active) stopNative = stop;
          else stop();
        })
        .catch((cause: unknown) => {
          if (active) setError(translateAccountError(cause));
        });
    } catch (cause) {
      queueMicrotask(() => {
        if (!active) return;
        setError(translateAccountError(cause));
        setLoading(false);
      });
    }
    return () => {
      active = false;
      window.removeEventListener('popstate', syncJoinNavigation);
      window.removeEventListener('hashchange', syncJoinNavigation);
      unsubscribe();
      stopNative();
    };
  }, []);

  const handleSnapshotChange = useCallback(
    (snapshot: WorkspaceSnapshot | null, memberId: string | null) => {
      setActiveSnapshot(snapshot);
      setActiveMemberId(memberId);
    },
    [],
  );

  async function signOut() {
    try {
      await accountAuthService.signOut();
      setProjectId(null);
      setActiveSnapshot(null);
      setActiveMemberId(null);
      setIdentity(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <>
      {loading ? (
        <main className="flex min-h-dvh items-center justify-center bg-slate-950 text-sm text-slate-300">
          Đang khởi động StackFlow...
        </main>
      ) : identity ? (
        projectId ? (
          <ProjectWorkspace
            projectId={projectId}
            identity={identity}
            onBack={() => setProjectId(null)}
            onSignOut={() => void signOut()}
            onSettings={(tab = 'appearance') => {
              setSettingsTab(tab);
              setSettingsOpen(true);
            }}
            onSnapshotChange={handleSnapshotChange}
          />
        ) : (
          <ProjectDashboard
            identity={identity}
            onOpen={(id) => setProjectId(id)}
            onSignOut={() => void signOut()}
            onSettings={() => {
              setSettingsTab('appearance');
              setSettingsOpen(true);
            }}
          />
        )
      ) : (
        <AccountLogin
          error={error}
          onSettings={() => {
            setSettingsTab('appearance');
            setSettingsOpen(true);
          }}
        />
      )}

      <AppSettingsModal
        open={settingsOpen}
        initialTab={settingsTab}
        onClose={() => setSettingsOpen(false)}
        snapshot={activeSnapshot}
        memberId={activeMemberId}
        syncMode="supabase"
        onOpenCloud={() => undefined}
        onOpenInstall={() => undefined}
      />
      <UpdateBanner />
    </>
  );
}
