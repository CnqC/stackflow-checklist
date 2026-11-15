import { useState, type FormEvent } from 'react';
import { Check, Copy, Link2, Mail, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import type { AccountProject, PendingEmailInvitation, ProjectJoinLinkInfo } from '../../../core/domain/accountProject';
import { buildZaloInviteMessage } from '../../../core/domain/accountSchemas';
import { pwaInstallManager } from '../../../infrastructure/pwa/pwaInstallManager';

interface Props {
  project: AccountProject;
  canManageProject: boolean;
  busy: boolean;
  joinLink: ProjectJoinLinkInfo | null;
  pendingInvites: PendingEmailInvitation[];
  onInviteEmail: (email: string, jobTitle: string) => Promise<void>;
  onRevokeInvite: (invitationId: string) => Promise<void>;
  onConfigureJoinLink: (patch: {
    enabled: boolean;
    regenerate?: boolean;
    defaultJobTitle?: string;
    expiresInDays?: number;
  }) => Promise<void>;
}

export function InviteChannelsTab({
  project,
  canManageProject,
  busy,
  joinLink,
  pendingInvites,
  onInviteEmail,
  onRevokeInvite,
  onConfigureJoinLink,
}: Props) {
  const [email, setEmail] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [defaultRole, setDefaultRole] = useState(joinLink?.defaultJobTitle ?? '');
  const [copiedKind, setCopiedKind] = useState<'zalo' | 'link' | null>(null);

  if (!canManageProject) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-center text-xs text-slate-300">
        <ShieldAlert className="mx-auto mb-2 h-7 w-7 text-indigo-400" />
        <p className="font-bold text-foreground">Chỉ Chủ dự án mới tạo hoặc thu hồi lời mời</p>
        <p className="mt-1 text-slate-400">Hãy nhờ Chủ dự án gửi Link mời nhóm hoặc mời trực tiếp qua Gmail của đồng đội mới.</p>
      </div>
    );
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://stackflow.app';
  const shareBundle = joinLink
    ? buildZaloInviteMessage({
        projectName: project.name,
        projectCode: project.code,
        joinCode: joinLink.joinCode,
        webOrigin: origin,
        apkDownloadUrl: pwaInstallManager.getApkDownloadUrl(),
      })
    : null;

  async function copyText(text: string, kind: 'zalo' | 'link') {
    await navigator.clipboard?.writeText(text);
    setCopiedKind(kind);
    setTimeout(() => setCopiedKind(null), 2200);
  }

  async function handleEmailSubmit(event: FormEvent) {
    event.preventDefault();
    await onInviteEmail(email, jobTitle);
    setEmail('');
    setJobTitle('');
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-indigo-500/35 bg-slate-900/90 p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
            <Link2 className="h-4 w-4" />
            Kênh 1 — Link &amp; Mã mời nhanh (Zalo / Discord / Messenger)
          </div>
          {joinLink && (
            <button type="button" disabled={busy} onClick={() => void onConfigureJoinLink({ enabled: !joinLink.enabled })} className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold cursor-pointer ${joinLink.enabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
              {joinLink.enabled ? '● Đang bật — Bấm để tắt' : '○ Đang tắt — Bấm để bật'}
            </button>
          )}
        </div>

        {joinLink && shareBundle ? (
          <>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] text-slate-400">Mã tham gia nhanh: </span>
                  <strong className="font-mono text-sm text-emerald-300">{joinLink.joinCode}</strong>
                  <span className="ml-2 text-[11px] text-slate-500">(Đã dùng {joinLink.useCount} lượt)</span>
                </div>
                <button type="button" disabled={busy} onClick={() => void onConfigureJoinLink({ enabled: true, regenerate: true })} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-slate-800 cursor-pointer">
                  <RefreshCw className="h-3 w-3" /> Đổi mã mới
                </button>
              </div>
              <p className="mt-1.5 truncate font-mono text-[11px] text-indigo-200">{shareBundle.joinUrl}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!joinLink.enabled} onClick={() => void copyText(shareBundle.message, 'zalo')} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-500 disabled:opacity-40 cursor-pointer">
                {copiedKind === 'zalo' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copiedKind === 'zalo' ? 'Đã chép trọn bộ Tin nhắn mời Zalo!' : 'Sao chép Tin nhắn + Link mời Zalo'}
              </button>
              <button type="button" disabled={!joinLink.enabled} onClick={() => void copyText(shareBundle.joinUrl, 'link')} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40 cursor-pointer">
                {copiedKind === 'link' ? 'Đã chép Link!' : 'Chép mỗi Link'}
              </button>
            </div>

            <div className="grid gap-2 pt-1 sm:grid-cols-[1fr_auto_auto]">
              <input maxLength={80} value={defaultRole} onChange={(e) => setDefaultRole(e.target.value)} placeholder="Vai trò mặc định khi vào bằng Link (VD: Thành viên)" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-foreground" />
              <select aria-label="Thời hạn đường dẫn mời" defaultValue="0" onChange={(e) => void onConfigureJoinLink({ enabled: joinLink.enabled, defaultJobTitle: defaultRole, expiresInDays: Number(e.target.value) })} className="rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-slate-200">
                <option value="0">Không giới hạn ngày</option>
                <option value="7">Hết hạn sau 7 ngày</option>
                <option value="30">Hết hạn sau 30 ngày</option>
              </select>
              <button type="button" disabled={busy} onClick={() => void onConfigureJoinLink({ enabled: joinLink.enabled, defaultJobTitle: defaultRole })} className="rounded-xl border border-indigo-500/40 px-3 py-2 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/10 cursor-pointer">
                Lưu cấu hình
              </button>
            </div>
          </>
        ) : (
          <p className="text-xs text-slate-400">Đang chuẩn bị đường dẫn mời nhóm...</p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-foreground">
          <Mail className="h-4 w-4 text-sky-400" />
          Kênh 2 — Mời đích danh qua Gmail / Tài khoản Google
        </div>
        <form onSubmit={(e) => void handleEmailSubmit(e)} className="grid gap-2 sm:grid-cols-[1.2fr_0.8fr_auto]">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="dongdoi@gmail.com" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-foreground focus:border-indigo-500 focus:outline-none" />
          <input maxLength={80} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Vai trò gợi ý (VD: QA, UI/UX)" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-foreground focus:border-indigo-500 focus:outline-none" />
          <button type="submit" disabled={busy} className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50 cursor-pointer">
            Gửi lời mời
          </button>
        </form>

        {pendingInvites.length > 0 && (
          <div className="space-y-1.5 border-t border-slate-800 pt-3">
            <p className="text-[11px] font-semibold text-slate-400">Đang chờ xác nhận ({pendingInvites.length})</p>
            {pendingInvites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{inv.invitedEmail}</p>
                  {inv.invitedJobTitle && <p className="truncate text-[11px] text-slate-400">Vai trò: {inv.invitedJobTitle}</p>}
                </div>
                <button type="button" disabled={busy} onClick={() => void onRevokeInvite(inv.id)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rose-500/30 px-2.5 py-1 text-[11px] text-rose-300 hover:bg-rose-500/10 cursor-pointer">
                  <Trash2 className="h-3 w-3" /> Thu hồi
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
