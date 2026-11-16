import { useEffect, useState } from 'react';
import { Check, Copy, Link2, Mail, MessageCircle, RefreshCw, Send, Share2, ShieldAlert } from 'lucide-react';
import type { AccountProject, PendingEmailInvitation, ProjectJoinLinkInfo } from '../../../core/domain/accountProject';
import {
  canUseMobileSystemShare,
  copyTextResilient,
  createRuntimeShareBundle,
  launchShareChannel,
  type ShareChannelKind,
} from '../../../infrastructure/projects/shareChannelLauncher';
import { EmailInviteSection } from './EmailInviteSection';

interface Props {
  project: AccountProject;
  canManageProject: boolean;
  busy: boolean;
  loadingInviteMeta?: boolean;
  joinLink: ProjectJoinLinkInfo | null;
  pendingInvites: PendingEmailInvitation[];
  onRetryLoad?: () => void;
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
  project, canManageProject, busy, loadingInviteMeta = false, joinLink, pendingInvites,
  onRetryLoad, onInviteEmail, onRevokeInvite, onConfigureJoinLink,
}: Props) {
  const [defaultRole, setDefaultRole] = useState(joinLink?.defaultJobTitle ?? '');
  const [copiedKind, setCopiedKind] = useState<'full' | 'link' | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (joinLink) setDefaultRole(joinLink.defaultJobTitle);
  }, [joinLink]);

  if (!canManageProject) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 text-center text-xs text-slate-300">
        <ShieldAlert className="mx-auto mb-2 h-7 w-7 text-indigo-400" />
        <p className="font-bold text-foreground">Chỉ Chủ dự án mới tạo hoặc thu hồi lời mời</p>
        <p className="mt-1 text-slate-400">Hãy nhờ Chủ dự án gửi Link mời nhóm hoặc mời trực tiếp qua Gmail của đồng đội mới.</p>
      </div>
    );
  }

  const shareBundle = joinLink
    ? createRuntimeShareBundle({
        projectName: project.name,
        projectCode: project.code,
        joinCode: joinLink.joinCode,
        invitedJobTitle: defaultRole || joinLink.defaultJobTitle,
      })
    : null;

  async function handleCopy(text: string, kind: 'full' | 'link') {
    const ok = await copyTextResilient(text);
    if (!ok) {
      setFeedback('Trình duyệt chặn chép tự động — bạn hãy bôi đen đường dẫn phía trên để sao chép.');
      return;
    }
    setCopiedKind(kind);
    setFeedback(
      kind === 'link'
        ? 'Đã sao chép đường dẫn vào dự án! Bạn có thể dán gửi ngay cho đối tác.'
        : 'Đã sao chép trọn bộ tin nhắn lời mời + đường dẫn vào dự án!',
    );
    setTimeout(() => setCopiedKind((cur) => (cur === kind ? null : cur)), 2400);
  }

  async function handleSendChannel(channel: ShareChannelKind) {
    if (!shareBundle || !joinLink?.enabled) return;
    const result = await launchShareChannel(channel, shareBundle);
    setFeedback(result.notice);
  }

  const expiryBadge = joinLink?.expiresAt
    ? `Hết hạn: ${new Date(joinLink.expiresAt).toLocaleDateString('vi-VN')}`
    : 'Không giới hạn ngày';

  return (
    <div className="space-y-4">
      {feedback && (
        <div role="status" className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-medium text-emerald-200">
          {feedback}
        </div>
      )}

      <section className="rounded-2xl border border-indigo-500/35 bg-slate-900/90 p-4 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
            <Link2 className="h-4 w-4" />
            Kênh 1 — Chia sẻ qua Link (Gmail · Zalo · Telegram)
          </div>
          {joinLink && (
            <button type="button" disabled={busy} onClick={() => void onConfigureJoinLink({ enabled: !joinLink.enabled })} className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold cursor-pointer ${joinLink.enabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
              {joinLink.enabled ? '● Đang bật — Bấm để tắt' : '○ Đang tắt — Bấm để bật'}
            </button>
          )}
        </div>

        {joinLink && shareBundle ? (
          <>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] text-slate-400">
                  Mã tham gia nhanh: <strong className="font-mono text-sm text-emerald-300">{joinLink.joinCode}</strong>
                  <span className="ml-2 text-slate-500">(Đã dùng {joinLink.useCount} lượt · {expiryBadge})</span>
                </div>
                <button type="button" disabled={busy} onClick={() => void onConfigureJoinLink({ enabled: true, regenerate: true })} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-slate-800 cursor-pointer">
                  <RefreshCw className="h-3 w-3" /> Đổi mã mới
                </button>
              </div>
              <input readOnly aria-label="Đường dẫn tham gia dự án" value={shareBundle.joinUrl} onFocus={(e) => e.currentTarget.select()} className="w-full rounded-lg border border-slate-800 bg-slate-900/90 px-2.5 py-1.5 font-mono text-[11px] text-indigo-200 focus:border-indigo-500 focus:outline-none" />
            </div>

            {!joinLink.enabled && (
              <p className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                Đường dẫn mời đang tạm tắt. Hãy bấm <strong>Đang tắt — Bấm để bật</strong> ở góc trên để gửi Link cho đối tác.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={!joinLink.enabled} onClick={() => void handleCopy(shareBundle.joinUrl, 'link')} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-500 disabled:opacity-40 cursor-pointer">
                {copiedKind === 'link' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copiedKind === 'link' ? 'Đã chép Link dự án!' : 'Sao chép Link mời'}
              </button>
              <button type="button" disabled={!joinLink.enabled} onClick={() => void handleCopy(shareBundle.fullMessage, 'full')} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40 cursor-pointer">
                {copiedKind === 'full' ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                {copiedKind === 'full' ? 'Đã chép trọn bộ!' : 'Chép Lời mời + Link'}
              </button>
            </div>

            <div className="space-y-2 border-t border-slate-800/80 pt-3">
              <p className="text-[11px] font-semibold text-slate-300">Gửi nhanh Link dự án cho đối tác qua:</p>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" disabled={!joinLink.enabled} onClick={() => void handleSendChannel('gmail')} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-2.5 text-xs font-bold text-rose-200 hover:bg-rose-500/20 disabled:opacity-40 cursor-pointer">
                  <Mail className="h-4 w-4 shrink-0 text-rose-300" /> Gmail
                </button>
                <button type="button" disabled={!joinLink.enabled} onClick={() => void handleSendChannel('zalo')} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/15 px-3 py-2.5 text-xs font-bold text-sky-200 hover:bg-sky-500/25 disabled:opacity-40 cursor-pointer">
                  <MessageCircle className="h-4 w-4 shrink-0 text-sky-300" /> Zalo
                </button>
                <button type="button" disabled={!joinLink.enabled} onClick={() => void handleSendChannel('telegram')} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-3 py-2.5 text-xs font-bold text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-40 cursor-pointer">
                  <Send className="h-4 w-4 shrink-0 text-cyan-300" /> Telegram
                </button>
              </div>
              {canUseMobileSystemShare() && (
                <button type="button" disabled={!joinLink.enabled} onClick={() => void handleSendChannel('system')} className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40 cursor-pointer">
                  <Share2 className="h-3.5 w-3.5 text-indigo-300" /> Chia sẻ qua ứng dụng khác trên điện thoại...
                </button>
              )}
            </div>

            <div className="grid gap-2 border-t border-slate-800/80 pt-3 sm:grid-cols-[1fr_auto_auto]">
              <input maxLength={80} value={defaultRole} onChange={(e) => setDefaultRole(e.target.value)} placeholder="Vai trò mặc định khi vào bằng Link (VD: Đối tác)" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-foreground" />
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
        ) : loadingInviteMeta ? (
          <p className="text-xs text-slate-400">Đang chuẩn bị đường dẫn mời nhóm...</p>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
            <span>Chưa tải được đường dẫn chia sẻ của dự án.</span>
            {onRetryLoad && (
              <button type="button" onClick={onRetryLoad} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 cursor-pointer">
                <RefreshCw className="h-3.5 w-3.5" /> Thử lại
              </button>
            )}
          </div>
        )}
      </section>

      <EmailInviteSection project={project} joinLink={joinLink} pendingInvites={pendingInvites} busy={busy} onInviteEmail={onInviteEmail} onRevokeInvite={onRevokeInvite} onFeedback={setFeedback} />
    </div>
  );
}
