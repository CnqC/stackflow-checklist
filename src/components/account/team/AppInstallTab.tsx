import { useEffect, useState } from 'react';
import { CheckCircle2, Download, Laptop, Smartphone } from 'lucide-react';
import { pwaInstallManager } from '../../../infrastructure/pwa/pwaInstallManager';

export function AppInstallTab() {
  const [canPrompt, setCanPrompt] = useState(() => pwaInstallManager.canPromptInstall());
  const [standalone] = useState(() => pwaInstallManager.isStandalone());
  const [installNotice, setInstallNotice] = useState<string | null>(null);

  useEffect(() => {
    pwaInstallManager.start();
    return pwaInstallManager.subscribe(() => {
      setCanPrompt(pwaInstallManager.canPromptInstall());
    });
  }, []);

  async function triggerDesktopPwa() {
    const outcome = await pwaInstallManager.promptInstall();
    if (outcome === 'accepted') {
      setInstallNotice('Đã cài đặt StackFlow thành ứng dụng riêng trên máy của bạn!');
    } else if (outcome === 'unavailable') {
      setInstallNotice(
        'Trình duyệt hiện tại chưa bật nút cài tự động — hãy bấm biểu tượng Cài đặt ứng dụng ở góc phải thanh địa chỉ Chrome/Edge.',
      );
    }
  }

  return (
    <div className="space-y-4">
      {standalone && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3.5 text-xs font-semibold text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Bạn đang sử dụng StackFlow ở chế độ Ứng dụng độc lập!
        </div>
      )}

      {installNotice && (
        <div className="rounded-xl border border-indigo-500/40 bg-indigo-500/10 p-3 text-xs text-indigo-200">
          {installNotice}
        </div>
      )}

      {/* Desktop Windows / Mac PWA */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400">
              <Laptop className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                Máy tính Windows &amp; Mac (App Desktop PWA)
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Mở cửa sổ riêng trên thanh Taskbar/Dock, ghim gọn nhẹ không tốn dung lượng và nhận
                chuông thông báo ngay khi có việc mới.
              </p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void triggerDesktopPwa()}
          className="mt-3.5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 cursor-pointer"
        >
          <Download className="h-4 w-4" />
          {canPrompt
            ? 'Cài đặt StackFlow lên Máy tính ngay (1 chạm)'
            : 'Cài qua biểu tượng ⊕ trên thanh địa chỉ Edge / Chrome'}
        </button>
      </div>

      {/* Android APK */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
            <Smartphone className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-foreground">Điện thoại Android (Bản cài .APK)</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Bản cài gốc hỗ trợ đăng nhập Google mượt mà và đẩy thông báo trực tiếp lên thanh
              trạng thái điện thoại kể cả khi thu nhỏ ứng dụng.
            </p>
          </div>
        </div>
        <a
          href={pwaInstallManager.getApkDownloadUrl()}
          download="StackFlow-Checklist.apk"
          className="mt-3.5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/25"
        >
          <Download className="h-4 w-4" />
          Tải xuống StackFlow-Checklist.apk
        </a>
      </div>

      {/* iOS Safari */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-300">
        <p className="font-bold text-foreground">iPhone / iPad (Safari)</p>
        <p className="mt-1 text-slate-400">
          Mở đường link dự án bằng trình duyệt <strong>Safari</strong> → bấm nút{' '}
          <strong>Chia sẻ (Share)</strong> ở cạnh dưới → chọn{' '}
          <strong>Thêm vào Màn hình chính (Add to Home Screen)</strong>.
        </p>
      </div>
    </div>
  );
}
