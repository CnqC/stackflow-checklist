import { useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { updateService } from '../infrastructure/updates/updateService';

function useUpdateState() {
  const [state, setState] = useState(() => updateService.getState());
  useEffect(() => updateService.subscribe(() => setState(updateService.getState())), []);
  return state;
}

function UpdateAction({ compact = false }: { compact?: boolean }) {
  const state = useUpdateState();
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState(false);
  if (state.status !== 'available' || !state.latest) return null;
  const className = `inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-on-accent font-semibold cursor-pointer ${compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-sm'}`;
  if (updateService.getPlatform() === 'android') {
    return <a href={state.latest.downloadUrl} target="_blank" rel="noopener noreferrer" className={className}>
      <Download className="w-4 h-4" />Tải APK mới
    </a>;
  }
  return <span className="inline-flex flex-col gap-1">
    <button type="button" disabled={applying} onClick={() => {
      setApplying(true);
      setApplyError(false);
      void updateService.applyWebUpdate().then((applied) => setApplyError(!applied))
        .catch(() => setApplyError(true)).finally(() => setApplying(false));
    }} className={`${className} disabled:opacity-60`}><RefreshCw className="w-4 h-4" />{applying ? 'Đang cập nhật...' : 'Cập nhật ngay'}</button>
    {applyError && <span className="text-[11px] text-amber-300">Chưa thể tải bản mới. Hãy đóng và mở lại ứng dụng.</span>}
  </span>;
}

export function UpdateSettings() {
  const state = useUpdateState();
  const android = updateService.getPlatform() === 'android';
  return <section className="space-y-3 border-b border-slate-800 pb-5">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-bold text-foreground">Cập nhật phiên bản</h3>
        <p className="text-xs text-slate-400 mt-1">Đang dùng: StackFlow {updateService.getCurrentVersion()} · {android ? 'Android APK' : 'Web / ứng dụng cài từ trình duyệt'}</p>
      </div>
      <button type="button" onClick={() => void updateService.check(true)} disabled={state.status === 'checking'}
        className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 px-2.5 py-2 text-xs text-slate-200 cursor-pointer disabled:opacity-50">
        <RefreshCw className={`w-3.5 h-3.5 ${state.status === 'checking' ? 'animate-spin' : ''}`} />Kiểm tra
      </button>
    </div>
    {state.status === 'checking' && <p className="text-xs text-slate-400">Đang kiểm tra bản mới...</p>}
    {state.status === 'error' && <p role="status" className="text-xs text-amber-300">{state.error}</p>}
    {state.status === 'current' && <p role="status" className="text-xs text-emerald-300">Bạn đang dùng phiên bản mới nhất.</p>}
    {state.status === 'available' && state.latest && <div className="rounded-xl border border-indigo-500/40 bg-indigo-500/10 p-3 space-y-2">
      <p className="text-sm font-bold text-foreground">Đã có StackFlow {state.latest.version}</p>
      {state.latest.changes.length > 0 && <ul className="list-disc pl-5 space-y-1 text-xs text-slate-300">{state.latest.changes.map((change, index) => <li key={index}>{change}</li>)}</ul>}
      <UpdateAction />
      {android && <p className="text-[11px] text-slate-400">Sau khi tải, mở file APK và xác nhận cài đè. Android chỉ chấp nhận bản được ký cùng khóa với bản đang cài.</p>}
    </div>}
  </section>;
}

export function UpdateBanner() {
  const state = useUpdateState();
  if (state.status !== 'available' || !state.latest) return null;
  return <aside role="status" className="fixed z-[80] left-3 right-3 bottom-20 lg:left-auto lg:right-5 lg:bottom-5 lg:w-96 rounded-2xl border border-indigo-500/50 bg-slate-900 shadow-2xl p-3 flex items-center justify-between gap-3">
    <div className="min-w-0"><p className="text-xs font-bold text-foreground">Có bản mới · StackFlow {state.latest.version}</p><p className="text-[11px] text-slate-400 mt-0.5">{updateService.getPlatform() === 'android' ? 'Tải APK và cài đè để cập nhật' : 'Tải lại ứng dụng để dùng bản mới'}</p></div>
    <UpdateAction compact />
  </aside>;
}
