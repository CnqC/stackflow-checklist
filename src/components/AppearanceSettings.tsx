import { useEffect, useState } from 'react';
import { Clock3, Monitor, Moon, Palette, Sun } from 'lucide-react';
import { THEMES, type AppearanceMode } from '../core/domain/appearance';
import { appearanceService } from '../infrastructure/appearance/appearanceService';

const MODES = [
  { id: 'light', label: 'Sáng', description: 'Luôn dùng giao diện sáng', Icon: Sun },
  { id: 'dark', label: 'Tối', description: 'Luôn dùng giao diện tối', Icon: Moon },
  { id: 'system', label: 'Theo thiết bị', description: 'Đổi theo Windows hoặc điện thoại', Icon: Monitor },
  { id: 'schedule', label: 'Theo giờ', description: 'Sáng ban ngày, tối ban đêm', Icon: Clock3 },
  { id: 'custom', label: 'Theme màu', description: 'Chọn một bộ màu có sẵn', Icon: Palette },
] as const satisfies ReadonlyArray<{ id: AppearanceMode; label: string; description: string; Icon: typeof Sun }>;

export function AppearanceSettings() {
  const [preferences, setPreferences] = useState(() => appearanceService.get());
  const [resolvedTheme, setResolvedTheme] = useState(() => appearanceService.getResolvedTheme());

  useEffect(() => appearanceService.subscribe(() => {
    setPreferences(appearanceService.get());
    setResolvedTheme(appearanceService.getResolvedTheme());
  }), []);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-bold text-foreground">Chế độ giao diện</h3>
        <p className="text-xs text-slate-400 mt-1">Đang hiển thị: {resolvedTheme.name}. Lựa chọn này áp dụng cho toàn ứng dụng trên thiết bị này.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {MODES.map(({ id, label, description, Icon }) => (
          <button key={id} type="button" aria-pressed={preferences.mode === id}
            onClick={() => appearanceService.update({ mode: id })}
            className={`text-left rounded-xl border p-3 flex items-start gap-2.5 cursor-pointer transition ${
              preferences.mode === id
                ? 'border-indigo-500 bg-indigo-500/15'
                : 'border-slate-700 bg-slate-900 hover:bg-slate-800'
            }`}>
            <Icon className="w-4 h-4 mt-0.5 shrink-0 text-indigo-400" />
            <span><span className="block text-xs font-semibold text-foreground">{label}</span>
              <span className="block text-[11px] text-slate-400 mt-0.5">{description}</span></span>
          </button>
        ))}
      </div>

      {preferences.mode === 'schedule' && (
        <div className="rounded-xl border border-slate-700 bg-slate-900 p-3 space-y-2">
          <p className="text-xs text-slate-300">Dùng giờ địa phương của thiết bị. Ứng dụng tự đổi khi đến giờ đã chọn.</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-slate-300">Bắt đầu sáng
              <input type="time" value={preferences.dayStart}
                onChange={(event) => appearanceService.update({ dayStart: event.target.value })}
                className="mt-1 block w-full rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 text-foreground" />
            </label>
            <label className="text-xs text-slate-300">Bắt đầu tối
              <input type="time" value={preferences.nightStart}
                onChange={(event) => appearanceService.update({ nightStart: event.target.value })}
                className="mt-1 block w-full rounded-lg bg-slate-950 border border-slate-700 px-2 py-1.5 text-foreground" />
            </label>
          </div>
        </div>
      )}

      {preferences.mode === 'custom' && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-foreground">Bộ màu mẫu</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {THEMES.filter((theme) => theme.id !== 'light' && theme.id !== 'dark').map((theme) => (
              <button key={theme.id} type="button" aria-pressed={preferences.customThemeId === theme.id}
                onClick={() => appearanceService.update({ customThemeId: theme.id })}
                className={`rounded-xl border p-2 text-left cursor-pointer transition ${
                  preferences.customThemeId === theme.id ? 'border-indigo-500' : 'border-slate-700 hover:border-slate-500'
                }`}>
                <span className="block h-10 rounded-lg border overflow-hidden" style={{ backgroundColor: theme.background, borderColor: theme.border }}>
                  <span className="flex items-center gap-1 h-full px-2">
                    <span className="w-3 h-6 rounded" style={{ backgroundColor: theme.surface }} />
                    <span className="h-2 flex-1 rounded" style={{ backgroundColor: theme.raised }} />
                    <span className="w-8 h-4 rounded" style={{ backgroundColor: theme.accent }} />
                    <span className="w-3 h-4 rounded" style={{ backgroundColor: theme.secondary }} />
                  </span>
                </span>
                <span className="block text-xs font-semibold text-foreground mt-1.5">{theme.name} <span className="font-normal text-slate-400">· {theme.tone === 'light' ? 'Sáng' : 'Tối'}</span></span>
                <span className="block text-[11px] text-slate-400">{theme.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
