import { useEffect, useState } from 'react';
import { Check, Cloud, Copy, Download, ExternalLink, Layers, Link2, Palette, ShieldCheck, Smartphone } from 'lucide-react';
import {
  buildAndroidChromeIntentUrl,
  isEmbeddedChatWebView,
  translateAccountError,
} from '../../core/domain/projectShareLinks';
import { accountAuthService } from '../../infrastructure/auth/accountAuthService';
import {
  capturePendingJoinCodeFromUrl,
  markPendingJoinAutoConfirm,
} from '../../infrastructure/projects/accountTeamInviteRepository';
import {
  copyTextResilient,
  getRuntimePublicAppUrl,
  openExternalUrl,
} from '../../infrastructure/projects/shareChannelLauncher';
import { pwaInstallManager } from '../../infrastructure/pwa/pwaInstallManager';
import { LoginDecorShowcase } from './LoginDecorShowcase';

interface Props {
  error: string | null;
  onSettings?: () => void;
}

function GoogleMark() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12s4.3 9.5 9.5 9.5c5.5 0 9.1-3.8 9.1-9.2 0-.6-.1-1.1-.2-1.6H12z" />
      <path fill="#34A853" d="M3.6 7.4l3.2 2.3c.9-2.2 3-3.8 5.2-3.8 1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.5 12 2.5 8.3 2.5 5.1 4.6 3.6 7.4z" />
      <path fill="#FBBC05" d="M12 21.5c2.5 0 4.7-.8 6.3-2.3l-2.9-2.4c-.8.6-1.9 1.1-3.4 1.1-3.8 0-5.2-2.5-5.5-3.7l-3.2 2.5c1.5 2.9 4.7 4.8 8.7 4.8z" />
      <path fill="#4285F4" d="M21.1 12.3c0-.6-.1-1.1-.2-1.6H12v3.9h5.5c-.3 1.3-1.1 2.4-2.1 3.1l2.9 2.4c1.7-1.6 2.8-4 2.8-7.8z" />
    </svg>
  );
}

export function AccountLogin({ error, onSettings }: Props) {
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pendingJoinCode] = useState<string | null>(() => capturePendingJoinCodeFromUrl());
  const [canInstallPwa, setCanInstallPwa] = useState(() => pwaInstallManager.canPromptInstall());
  const [copiedBrowserLink, setCopiedBrowserLink] = useState(false);

  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const inEmbeddedChat = isEmbeddedChatWebView(userAgent);
  const isAndroid = /Android/i.test(userAgent);
  const publicBase = getRuntimePublicAppUrl();
  const fullTargetUrl = pendingJoinCode
    ? `${publicBase}?join=${encodeURIComponent(pendingJoinCode)}`
    : publicBase;
  const chromeIntentUrl = isAndroid ? buildAndroidChromeIntentUrl(fullTargetUrl) : null;

  useEffect(() => {
    pwaInstallManager.start();
    return pwaInstallManager.subscribe(() => {
      setCanInstallPwa(pwaInstallManager.canPromptInstall());
    });
  }, []);

  async function signIn() {
    setBusy(true);
    setLocalError(null);
    try {
      markPendingJoinAutoConfirm(pendingJoinCode);
      await accountAuthService.signInWithGoogle();
    } catch (cause) {
      setLocalError(translateAccountError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function copyExternalLink() {
    const ok = await copyTextResilient(fullTargetUrl);
    if (ok) {
      setCopiedBrowserLink(true);
      setTimeout(() => setCopiedBrowserLink(false), 2500);
    }
  }

  return (
    <main className="relative flex min-h-dvh flex-col justify-between overflow-hidden bg-slate-950 text-foreground">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-40 mx-auto h-96 max-w-3xl rounded-full bg-indigo-600/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 right-0 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl" />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-4 sm:gap-3 sm:px-8 sm:py-5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-lg shadow-indigo-500/25 sm:h-10 sm:w-10">
            <Layers className="h-5 w-5" />
          </div>
          <span className="text-base font-extrabold tracking-tight text-foreground sm:text-lg">StackFlow</span>
          <span className="shrink-0 rounded-full border border-indigo-500/30 bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-300 sm:px-2.5 sm:text-[11px]">
            Web &amp; App
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs text-slate-300 sm:inline-flex">
            <Cloud className="h-3.5 w-3.5 text-emerald-400" /> Đồng bộ: Google Cloud
          </span>
          {onSettings && (
            <button type="button" onClick={onSettings} className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/90 px-2.5 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:border-indigo-500/50 hover:bg-slate-800 sm:px-3.5 sm:text-xs cursor-pointer">
              <Palette className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
              <span>Giao diện &amp; Cài đặt</span>
            </button>
          )}
        </div>
      </header>

      <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-8 px-4 py-4 sm:px-8 sm:py-6 lg:grid-cols-[1.15fr_0.85fr] lg:gap-12">
        <div className="order-2 min-w-0 lg:order-1">
          <LoginDecorShowcase />
        </div>

        <section aria-label="Đăng nhập dự án bằng Google" className="order-1 min-w-0 w-full rounded-3xl border border-slate-800 bg-slate-900/90 p-5 shadow-2xl backdrop-blur sm:p-8 lg:order-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> Bảo mật tài khoản Google
            </span>
            <span className="text-[11px] text-slate-400">Tối đa 20 người/dự án</span>
          </div>

          <h1 className="mt-4 text-2xl font-bold text-foreground">Vào Dự Án Nhóm</h1>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400 sm:text-sm">
            Dùng tài khoản Google để mở các dự án bạn tham gia, tạo dự án mới hoặc nhận lời mời từ trưởng nhóm.
          </p>

          {pendingJoinCode && (
            <div className="mt-4 rounded-2xl border border-indigo-500/40 bg-indigo-500/15 p-3.5">
              <div className="flex items-center gap-2 text-xs font-bold text-indigo-200">
                <Link2 className="h-4 w-4 shrink-0 text-indigo-300" />
                Đã nhận mã mời nhóm: <span className="font-mono">{pendingJoinCode}</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-300">
                Bấm nút Google bên dưới — ngay khi đăng nhập xong bạn sẽ được đưa thẳng vào dự án này!
              </p>
            </div>
          )}

          {inEmbeddedChat && (
            <div className="mt-4 space-y-2 rounded-2xl border border-amber-500/45 bg-amber-500/10 p-3.5 text-xs text-amber-100">
              <p className="font-bold text-amber-200">Bạn đang mở từ trình duyệt thu nhỏ của Zalo / ứng dụng chat</p>
              <p className="text-[11px] leading-relaxed text-amber-100/90">
                Google yêu cầu đăng nhập trên trình duyệt chính (<strong>Chrome / Safari</strong>). Hãy bấm menu <strong>⋯</strong> góc trên chọn <strong>Mở bằng trình duyệt</strong>, hoặc dùng nút nhanh dưới đây:
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {chromeIntentUrl && (
                  <button type="button" onClick={() => openExternalUrl(chromeIntentUrl)} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 cursor-pointer">
                    <ExternalLink className="h-3.5 w-3.5" /> Mở ngay bằng Chrome
                  </button>
                )}
                <button type="button" onClick={() => void copyExternalLink()} className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-slate-950/70 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-slate-900 cursor-pointer">
                  {copiedBrowserLink ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedBrowserLink ? 'Đã chép Link mời!' : 'Sao chép Link sang Safari/Chrome'}
                </button>
              </div>
            </div>
          )}

          {(error || localError) && (
            <p role="alert" className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
              {error || localError}
            </p>
          )}

          <button type="button" onClick={() => void signIn()} disabled={busy} className="mt-6 flex min-h-12 w-full items-center justify-center gap-3 rounded-xl bg-indigo-600 px-4 text-sm font-bold text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-500 disabled:opacity-50 cursor-pointer">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white">
              <GoogleMark />
            </span>
            {busy ? 'Đang kết nối Google...' : pendingJoinCode ? 'Tiếp tục với Google & Vào dự án' : 'Tiếp tục với Google'}
          </button>

          <div className="mt-5 border-t border-slate-800 pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Cài ứng dụng lên máy của bạn
            </p>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <a href={pwaInstallManager.getApkDownloadUrl()} download="StackFlow-Checklist.apk" className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-indigo-500/50 hover:bg-slate-800">
                <Smartphone className="h-3.5 w-3.5 text-emerald-400" /> Tải Android APK
              </a>
              <button type="button" onClick={() => { if (canInstallPwa) void pwaInstallManager.promptInstall(); else onSettings?.(); }} className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-indigo-500/50 hover:bg-slate-800 cursor-pointer">
                <Download className="h-3.5 w-3.5 text-indigo-400" />
                {canInstallPwa ? 'Cài App Máy tính' : 'Hướng dẫn cài App'}
              </button>
            </div>
          </div>
        </section>
      </div>

      <footer className="relative z-10 px-4 py-4 text-center text-xs text-slate-500">
        Tối ưu cho nhóm tới 20 người • Đồng bộ Realtime trên cả Web, Desktop PWA &amp; Android APK
      </footer>
    </main>
  );
}
