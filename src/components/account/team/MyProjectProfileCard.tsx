import { useState, type FormEvent } from 'react';
import { Check, Palette } from 'lucide-react';
import type { ProjectMember } from '../../../core/domain/accountProject';
import { MEMBER_PALETTE } from '../../../core/domain/stackDomain';

interface Props {
  me: ProjectMember;
  busy: boolean;
  onSave: (input: { displayName: string; jobTitle: string; avatarColor: string }) => Promise<void>;
}

export function MyProjectProfileCard({ me, busy, onSave }: Props) {
  const [myName, setMyName] = useState(me.display_name);
  const [myRole, setMyRole] = useState(me.job_title);
  const [myColor, setMyColor] = useState(me.avatar_color || MEMBER_PALETTE[0]!);
  const [savedProfile, setSavedProfile] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await onSave({ displayName: myName, jobTitle: myRole, avatarColor: myColor });
    setSavedProfile(true);
    setTimeout(() => setSavedProfile(false), 2000);
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-foreground">Hồ sơ của bạn trong dự án này</span>
        {savedProfile && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
            <Check className="h-3.5 w-3.5" /> Đã lưu
          </span>
        )}
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <input
          required
          maxLength={80}
          value={myName}
          onChange={(e) => setMyName(e.target.value)}
          placeholder="Tên hiển thị của bạn"
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-foreground focus:border-indigo-500 focus:outline-none"
        />
        <input
          maxLength={80}
          value={myRole}
          onChange={(e) => setMyRole(e.target.value)}
          placeholder="Vai trò (VD: Tech Lead, Backend, Design...)"
          className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-foreground focus:border-indigo-500 focus:outline-none"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Palette className="mr-1 h-3.5 w-3.5 text-indigo-400" />
          {MEMBER_PALETTE.map((hex) => (
            <button
              key={hex}
              type="button"
              onClick={() => setMyColor(hex)}
              aria-label={`Màu avatar ${hex}`}
              style={{ backgroundColor: hex }}
              className={`h-6 w-6 rounded-md transition cursor-pointer ${
                myColor === hex ? 'scale-110 ring-2 ring-white' : 'opacity-70 hover:opacity-100'
              }`}
            />
          ))}
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50 cursor-pointer"
        >
          Lưu hồ sơ
        </button>
      </div>
    </form>
  );
}
