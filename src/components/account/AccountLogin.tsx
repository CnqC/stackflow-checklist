import { useState } from 'react';
import { Layers, LogIn } from 'lucide-react';
import { accountAuthService } from '../../infrastructure/auth/accountAuthService';

export function AccountLogin({ error }: { error: string | null }) {
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setLocalError(null);
    try {
      await accountAuthService.signInWithGoogle();
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return <main className="min-h-dvh flex items-center justify-center p-5">
    <section className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900/85 p-7 shadow-2xl">
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-lg shadow-indigo-500/20">
        <Layers className="h-6 w-6" />
      </div>
      <h1 className="mt-5 text-3xl font-bold text-foreground">StackFlow</h1>
      <p className="mt-2 text-sm text-slate-300">
        Đăng nhập một lần để xem những dự án bạn tham gia và nhận đúng việc được giao.
      </p>
      {(error || localError) && <p role="alert" className="mt-5 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error || localError}</p>}
      <button type="button" onClick={() => void signIn()} disabled={busy}
        className="mt-7 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
        <LogIn className="h-5 w-5" />{busy ? 'Đang mở Google...' : 'Tiếp tục với Google'}
      </button>
      <p className="mt-4 text-center text-xs text-slate-400">
        Dùng đúng email Google mà chủ dự án đã mời.
      </p>
    </section>
  </main>;
}
