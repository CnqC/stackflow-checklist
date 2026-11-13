import { useEffect, useState } from 'react';
import { Play, Volume2, VolumeX } from 'lucide-react';
import {
  NOTIFICATION_SOUNDS,
  type NotificationSoundId,
} from '../core/domain/notificationPreferences';
import { notificationPreferencesStore } from '../infrastructure/notifications/notificationPreferencesStore';
import { notificationSoundService } from '../infrastructure/notifications/notificationSoundService';

interface Props {
  workspaceId: string;
  memberId: string;
}

export function NotificationSettings({ workspaceId, memberId }: Props) {
  const [preferences, setPreferences] = useState(() => notificationPreferencesStore.get(workspaceId, memberId));
  const [previewBlocked, setPreviewBlocked] = useState(false);

  useEffect(() => {
    const refresh = () => setPreferences(notificationPreferencesStore.get(workspaceId, memberId));
    refresh();
    return notificationPreferencesStore.subscribe(refresh);
  }, [workspaceId, memberId]);

  const update = (patch: Partial<typeof preferences>) => {
    setPreferences(notificationPreferencesStore.update(workspaceId, memberId, patch));
  };

  const preview = async (soundId: NotificationSoundId) => {
    if (!preferences.soundEnabled || preferences.soundVolume === 0) return;
    setPreviewBlocked(!(await notificationSoundService.preview(workspaceId, memberId, soundId)));
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-5 text-slate-200">
      <section className="space-y-2">
        <h3 className="text-xs font-bold text-white">Âm báo trong ứng dụng</h3>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-3 cursor-pointer">
          <span className="flex items-center gap-2 text-xs font-medium">
            {preferences.soundEnabled ? <Volume2 className="w-4 h-4 text-indigo-300" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
            Phát âm khi có việc mới: {preferences.soundEnabled ? 'Bật' : 'Tắt'}
          </span>
          <input type="checkbox" checked={preferences.soundEnabled}
            onChange={(event) => {
              setPreviewBlocked(false);
              update({ soundEnabled: event.target.checked });
            }}
            className="h-4 w-4 accent-indigo-500" />
        </label>
        <p className="text-[11px] leading-relaxed text-slate-400">
          Chỉ phát khi trang hoặc ứng dụng Windows đang hiển thị. Tắt ở đây sẽ dừng cả âm đang phát; thông báo nổi trên thiết bị có công tắc riêng phía trên.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-bold text-white">Chọn âm báo</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {NOTIFICATION_SOUNDS.map((sound, index) => (
            <div key={sound.id} className={`flex items-center gap-1 rounded-xl border px-2 py-1.5 ${preferences.soundId === sound.id ? 'border-indigo-500/70 bg-indigo-500/15' : 'border-slate-700 bg-slate-800/60'}`}>
              <label className="min-w-0 flex-1 flex items-center gap-2 cursor-pointer text-xs">
                <input type="radio" name={`sound-${workspaceId}-${memberId}`} value={sound.id}
                  checked={preferences.soundId === sound.id}
                  onChange={() => update({ soundId: sound.id })}
                  className="h-4 w-4 shrink-0 accent-indigo-500" />
                <span className="truncate">{index + 1}. {sound.name}</span>
              </label>
              <button type="button" onClick={() => void preview(sound.id)}
                disabled={!preferences.soundEnabled || preferences.soundVolume === 0}
                aria-label={`Nghe thử âm ${sound.name}`} title="Nghe thử"
                className="p-1.5 rounded-lg text-indigo-300 hover:bg-indigo-500/20 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                <Play className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        {!preferences.soundEnabled && <p className="text-[11px] text-slate-400">Bật âm báo để nghe thử. Bạn vẫn có thể chọn sẵn âm và âm lượng.</p>}
        {previewBlocked && <p className="text-[11px] text-amber-300">Trình duyệt đang chặn âm. Hãy kiểm tra âm lượng và quyền phát âm của trang.</p>}
        <label className="block text-xs font-medium text-slate-300" htmlFor={`notification-volume-${workspaceId}-${memberId}`}>
          Âm lượng: {Math.round(preferences.soundVolume * 100)}%
        </label>
        <input id={`notification-volume-${workspaceId}-${memberId}`} type="range" min="0" max="100" step="5"
          value={Math.round(preferences.soundVolume * 100)}
          onChange={(event) => update({ soundVolume: Number(event.target.value) / 100 })}
          className="w-full accent-indigo-500" />
      </section>

      <section className="space-y-2 border-t border-slate-800 pt-4">
        <h3 className="text-xs font-bold text-white">Hiển thị thông báo</h3>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-3 cursor-pointer">
          <span className="text-xs font-medium">Hiện số việc mới trên tab trình duyệt</span>
          <input type="checkbox" checked={preferences.tabBadgeEnabled}
            onChange={(event) => update({ tabBadgeEnabled: event.target.checked })}
            className="h-4 w-4 accent-indigo-500" />
        </label>
        <p className="text-[11px] leading-relaxed text-slate-400">
          Nút “Báo trên thiết bị” phía trên điều khiển thông báo nổi. Kiểu thanh thông báo và âm khi đóng trang do trình duyệt hoặc điện thoại quản lý. Hộp chuông luôn giữ các việc mới.
        </p>
      </section>
    </div>
  );
}
