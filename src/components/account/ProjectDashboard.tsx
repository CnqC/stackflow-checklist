import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { FolderPlus, LogOut, Settings2, Users } from 'lucide-react';
import type { AccountProject } from '../../core/domain/accountProject';
import type { AccountIdentity } from '../../infrastructure/auth/accountAuthService';
import {
  accountProjectRepository,
  type ProjectInvitation,
} from '../../infrastructure/projects/accountProjectRepository';

interface Props {
  identity: AccountIdentity;
  onOpen: (projectId: string) => void;
  onSignOut: () => void;
  onSettings: () => void;
}

export function ProjectDashboard({ identity, onOpen, onSignOut, onSettings }: Props) {
  const [projects, setProjects] = useState<AccountProject[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const refresh = useCallback(async () => {
    const [nextProjects, nextInvitations, admin] = await Promise.all([
      accountProjectRepository.listProjects(),
      accountProjectRepository.listInvitations(),
      accountProjectRepository.isGlobalAdmin(),
    ]);
    setProjects(nextProjects);
    setInvitations(nextInvitations);
    setIsAdmin(admin);
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
      accountProjectRepository.listProjects(),
      accountProjectRepository.listInvitations(),
      accountProjectRepository.isGlobalAdmin(),
    ]).then(([nextProjects, nextInvitations, admin]) => {
      if (!active) return;
      setProjects(nextProjects);
      setInvitations(nextInvitations);
      setIsAdmin(admin);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function createProject(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const projectId = await accountProjectRepository.createProject({
        code, name, description: '',
        ...(isAdmin ? { ownerEmail } : {}),
      });
      setName('');
      setCode('');
      setOwnerEmail('');
      setShowCreate(false);
      await refresh();
      onOpen(projectId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function accept(invitationId: string) {
    setBusy(true);
    setError(null);
    try {
      const projectId = await accountProjectRepository.accept(invitationId);
      await refresh();
      onOpen(projectId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return <main className="mx-auto min-h-dvh max-w-5xl px-4 py-6 sm:px-7 sm:py-9">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.18em] text-indigo-300">StackFlow</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">Dự án của bạn</h1>
        <p className="mt-1 text-sm text-slate-400">{identity.name} · {identity.email}</p>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onSettings} aria-label="Cài đặt" className="rounded-xl border border-slate-700 p-3 text-slate-200 hover:bg-slate-800"><Settings2 className="h-5 w-5" /></button>
        <button type="button" onClick={onSignOut} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"><LogOut className="h-4 w-4" />Đăng xuất</button>
      </div>
    </header>

    {isAdmin && <div className="mt-6 rounded-xl border border-indigo-500/40 bg-indigo-500/10 p-4 text-sm text-indigo-100">
      Bạn đang xem với quyền admin toàn cục. Bạn có thể theo dõi mọi dự án và quản lý thông tin, nhưng không tham gia hoặc đánh dấu công việc.
    </div>}
    {error && <p role="alert" className="mt-5 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}

    {invitations.length > 0 && <section className="mt-7">
      <h2 className="mb-3 text-lg font-semibold text-foreground">Lời mời dành cho bạn</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {invitations.map((invite) => <div key={invite.id} className="rounded-2xl border border-indigo-500/40 bg-indigo-500/10 p-4">
          <p className="font-semibold text-foreground">{invite.projectName}</p>
          <p className="mt-1 text-xs text-slate-300">{invite.projectCode}</p>
          <button type="button" disabled={busy} onClick={() => void accept(invite.id)} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Tham gia dự án</button>
        </div>)}
      </div>
    </section>}

    <section className="mt-7">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-foreground">{isAdmin ? 'Tất cả dự án' : 'Dự án tôi tham gia'}</h2>
        <button type="button" onClick={() => setShowCreate((value) => !value)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-500"><FolderPlus className="h-4 w-4" />Tạo dự án</button>
      </div>

      {showCreate && <form onSubmit={(event) => void createProject(event)} className="mb-5 grid gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-4 sm:grid-cols-2">
        <label className="text-sm text-slate-300">Tên dự án<input required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-foreground" /></label>
        <label className="text-sm text-slate-300">Mã ngắn<input required minLength={2} maxLength={32} value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="TEAM-2026" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-foreground" /></label>
        {isAdmin && <label className="text-sm text-slate-300 sm:col-span-2">Email Google của chủ dự án<input type="email" required value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-foreground" /></label>}
        <div className="sm:col-span-2"><button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-indigo-600 px-5 font-semibold text-white disabled:opacity-50">{busy ? 'Đang tạo...' : 'Tạo dự án'}</button></div>
      </form>}

      {loading ? <p className="text-sm text-slate-400">Đang tải dự án...</p> : projects.length === 0 ?
        <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-slate-400"><Users className="mx-auto mb-3 h-8 w-8" />Chưa có dự án. Hãy tạo hoặc nhờ chủ dự án mời email {identity.email}.</div> :
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => <button type="button" key={project.id} onClick={() => onOpen(project.id)} className="min-h-32 rounded-2xl border border-slate-700 bg-slate-900 p-5 text-left hover:border-indigo-400 hover:bg-slate-800">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">{project.code}</p>
            <h3 className="mt-2 text-lg font-semibold text-foreground">{project.name}</h3>
            <p className="mt-2 text-xs text-slate-400">{project.accessRole === 'global_admin' ? 'Theo dõi · Admin' : project.accessRole === 'owner' ? 'Chủ dự án' : 'Thành viên'}</p>
          </button>)}
        </div>}
    </section>
  </main>;
}
