import React, { useEffect, useState } from 'react';
import { accountAuthService, type AccountIdentity } from '../infrastructure/auth/accountAuthService';
import {
  projectCatalogRepository,
  type ProjectSummary,
} from '../infrastructure/projects/projectCatalogRepository';

type LoginStep = 'email' | 'code';

export function AccountPreview() {
  const [identity, setIdentity] = useState<AccountIdentity | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [step, setStep] = useState<LoginStep>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = accountAuthService.subscribe((next) => {
      if (active) setIdentity(next);
    });
    void accountAuthService.currentIdentity()
      .then((next) => { if (active) setIdentity(next); })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!identity) return;
    let active = true;
    void projectCatalogRepository.listMyProjects()
      .then((next) => { if (active) setProjects(next); })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => { active = false; };
  }, [identity]);

  async function sendCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await accountAuthService.sendEmailCode(email);
      setStep('code');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setIdentity(await accountAuthService.verifyEmailCode(email, code));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setError(null);
    try {
      await accountAuthService.signOut();
      setIdentity(null);
      setProjects([]);
      setStep('email');
      setCode('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-5 py-12 text-slate-900 dark:text-slate-100">
      <div>
        <h1 className="text-3xl font-semibold">Tài khoản StackFlow</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Bản thử nghiệm xác thực và danh sách dự án. Chỉ dùng trên môi trường staging sau khi chạy migration tài khoản.
        </p>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-100 p-3 text-red-800">{error}</p>}
      {identity ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <p>Đã đăng nhập: <strong>{identity.email}</strong></p>
            <button type="button" disabled={busy} onClick={() => void signOut()} className="rounded-lg border px-4 py-2">
              Đăng xuất
            </button>
          </div>
          <h2 className="text-xl font-medium">Dự án có quyền truy cập</h2>
          {projects.length === 0 && <p>Chưa có dự án nào được gắn với tài khoản này.</p>}
          <ul className="space-y-3">
            {projects.map((project) => (
              <li key={project.id} className="rounded-xl border p-4">
                <h3 className="font-semibold">{project.name}</h3>
                <p className="text-sm">{project.code} · {project.role === 'global_admin' ? 'Admin toàn cục' : project.role === 'owner' ? 'Chủ dự án' : 'Thành viên'}</p>
                {project.description && <p className="mt-1 text-sm">{project.description}</p>}
              </li>
            ))}
          </ul>
        </section>
      ) : step === 'email' ? (
        <form onSubmit={(event) => void sendCode(event)} className="space-y-4">
          <label className="block">Email
            <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border p-3 text-slate-900" />
          </label>
          <button type="submit" disabled={busy} className="rounded-lg bg-indigo-600 px-5 py-3 text-white">Gửi mã đăng nhập</button>
        </form>
      ) : (
        <form onSubmit={(event) => void verifyCode(event)} className="space-y-4">
          <p>Nhập mã đã gửi đến {email}.</p>
          <label className="block">Mã 6 chữ số
            <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value)} className="mt-1 w-full rounded-lg border p-3 text-slate-900" />
          </label>
          <button type="submit" disabled={busy} className="rounded-lg bg-indigo-600 px-5 py-3 text-white">Đăng nhập</button>
          <button type="button" onClick={() => setStep('email')} className="ml-3 rounded-lg border px-4 py-3">Đổi email</button>
        </form>
      )}
    </main>
  );
}
