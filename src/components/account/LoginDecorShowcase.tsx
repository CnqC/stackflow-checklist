import { BellRing, CheckCircle2, Lock, Share2, Sparkles } from 'lucide-react';

const SAMPLE_AVATARS = [
  { initials: 'CQ', color: '#6366f1', online: true },
  { initials: 'MI', color: '#10b981', online: true },
  { initials: 'LI', color: '#ec4899', online: true },
  { initials: 'HU', color: '#0ea5e9', online: false },
];

export function LoginDecorShowcase() {
  return (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-1.5 text-xs font-semibold text-indigo-300">
        <Sparkles className="h-3.5 w-3.5" />
        Phiên bản Hợp nhất Google Cloud · Web · Desktop PWA · Android APK
      </div>

      <h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-4xl">
        Checklist Dự Án Nhóm{' '}
        <span className="bg-gradient-to-r from-indigo-400 via-sky-400 to-emerald-400 bg-clip-text text-transparent">
          Chuẩn Từng Tầng Stack
        </span>
      </h2>

      <p className="max-w-xl text-sm leading-relaxed text-slate-400 sm:text-base">
        Không cần nhớ mã PIN phòng. Đăng nhập 1 chạm bằng tài khoản Google, mời đồng đội qua Link
        Zalo hoặc Gmail và theo dõi tiến độ trực tiếp trên mọi thiết bị.
      </p>

      {/* Live V2 Stack Card Preview matching 13_v2_desktop_board_avatar_group_1920x1080.png */}
      <div
        aria-hidden="true"
        className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xl"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-indigo-500" />
            <span className="truncate text-xs font-bold text-foreground sm:text-sm">
              Stack 1 — Chốt Thiết Kế & Ra Mắt Bản Chính Thức
            </span>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
            <Lock className="h-3 w-3" />
            Tuần tự
          </span>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-950">
            <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400" />
          </div>
          <span className="font-mono text-[11px] text-slate-400">3/4 (75%)</span>
        </div>

        <div className="mt-3.5 space-y-2">
          <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-800/80 bg-slate-950/70 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <span className="truncate text-xs text-slate-400 line-through">
                Đồng bộ đăng nhập Google & bảo mật phân quyền thành viên
              </span>
            </div>
            <span className="shrink-0 rounded-md bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-bold text-indigo-300">
              CQ
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-xl border border-indigo-500/30 bg-slate-950 px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-3.5 w-3.5 shrink-0 rounded border border-indigo-400 bg-indigo-500/10" />
              <span className="truncate text-xs font-medium text-foreground">
                Gửi Link mời nhanh Zalo & bắn thông báo chuông đa thiết bị
              </span>
            </div>
            <div className="flex shrink-0 -space-x-1.5">
              {SAMPLE_AVATARS.map((member) => (
                <span
                  key={member.initials}
                  style={{ backgroundColor: member.color }}
                  className="relative flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-white ring-2 ring-slate-950"
                >
                  {member.initials}
                  {member.online && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 ring-1 ring-slate-950" />
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 pt-1 text-xs">
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-800/90 bg-slate-900/60 p-3 text-slate-300">
          <Share2 className="h-4 w-4 shrink-0 text-indigo-400" />
          <span>Mời nhóm qua Link Zalo / Email</span>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-800/90 bg-slate-900/60 p-3 text-slate-300">
          <BellRing className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>Chuông nhắc việc Web & App</span>
        </div>
      </div>
    </div>
  );
}
