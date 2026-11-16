import { useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowRight, Check, Link2, Mail, Sparkles, X } from 'lucide-react';
import type { JoinCodePreview } from '../../core/domain/accountProject';
import type { ProjectInvitation } from '../../infrastructure/projects/accountProjectRepository';

interface Props {
  busy: boolean;
  isAdmin: boolean;
  previewChecked?: boolean;
  pendingCodePreview: JoinCodePreview | null;
  pendingCodeRaw: string | null;
  invitations: ProjectInvitation[];
  onJoinByCode: (rawCodeOrUrl: string, jobTitle?: string) => Promise<void>;
  onDismissPendingCode: () => void;
  onAcceptInvite: (invitationId: string) => Promise<void>;
  onDeclineInvite: (invitationId: string) => Promise<void>;
}

export function DashboardJoinAndInvites({
  busy,
  isAdmin,
  previewChecked = false,
  pendingCodePreview,
  pendingCodeRaw,
  invitations,
  onJoinByCode,
  onDismissPendingCode,
  onAcceptInvite,
  onDeclineInvite,
}: Props) {
  const [joinInput, setJoinInput] = useState('');
  const [joinRole, setJoinRole] = useState('');
  const [pendingRole, setPendingRole] = useState('');

  async function handleJoinSubmit(event: FormEvent) {
    event.preventDefault();
    if (!joinInput.trim()) return;
    await onJoinByCode(joinInput, joinRole);
    setJoinInput('');
    setJoinRole('');
  }

  const invalidPendingCode = Boolean(pendingCodeRaw && previewChecked && !pendingCodePreview);

  return (
    <div className="space-y-5">
      {!isAdmin && pendingCodeRaw && (
        <section
          aria-label="Lời mời từ đường dẫn chia sẻ"
          className={`rounded-2xl border p-4 shadow-lg ${
            invalidPendingCode
              ? 'border-amber-500/45 bg-amber-500/10'
              : 'border-indigo-500/50 bg-indigo-500/15'
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  invalidPendingCode
                    ? 'bg-amber-500/20 text-amber-200'
                    : 'bg-indigo-500/20 text-indigo-200'
                }`}
              >
                {invalidPendingCode ? <AlertTriangle className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                Lời mời qua Link dự án ({pendingCodeRaw})
              </span>

              {invalidPendingCode ? (
                <p className="mt-2 text-xs leading-relaxed text-amber-100">
                  Mã mời <strong>{pendingCodeRaw}</strong> hiện không tồn tại, đang tạm tắt hoặc đã hết hạn. Hãy nhờ Chủ dự án gửi lại đường dẫn mới.
                </p>
              ) : pendingCodePreview ? (
                <>
                  <h2 className="mt-2 text-base font-bold text-foreground">
                    Tham gia dự án “{pendingCodePreview.projectName}” ({pendingCodePreview.projectCode})
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-300">
                    {pendingCodePreview.alreadyMember
                      ? 'Bạn đã ở trong dự án này — bấm Mở dự án ngay để tiếp tục công việc.'
                      : `Vai trò mặc định: ${pendingCodePreview.defaultJobTitle || 'Thành viên'}`}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-xs text-slate-300">
                  Đang kiểm tra thông tin dự án từ mã mời {pendingCodeRaw}...
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!invalidPendingCode && (
                <>
                  {pendingCodePreview && !pendingCodePreview.alreadyMember && (
                    <input
                      maxLength={80}
                      value={pendingRole}
                      onChange={(e) => setPendingRole(e.target.value)}
                      placeholder="Vai trò của bạn (tuỳ chọn)"
                      className="h-9 rounded-xl border border-slate-700 bg-slate-950 px-3 text-xs text-foreground focus:border-indigo-500 focus:outline-none"
                    />
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onJoinByCode(pendingCodeRaw, pendingRole)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50 cursor-pointer"
                  >
                    <Check className="h-4 w-4" />
                    {pendingCodePreview?.alreadyMember ? 'Mở dự án ngay' : 'Xác nhận tham gia'}
                  </button>
                </>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={onDismissPendingCode}
                aria-label="Bỏ qua mã mời"
                className="rounded-xl border border-slate-700 bg-slate-900 p-2 text-slate-400 hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>
      )}

      {!isAdmin && (
        <form onSubmit={(e) => void handleJoinSubmit(e)} className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-300">
            <Link2 className="h-4 w-4" />
            Tham gia nhanh bằng Mã mời hoặc Link dự án (Gmail / Zalo / Telegram)
          </div>
          <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
            <input
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value)}
              placeholder="Dán mã SF-XXXXXX, tin nhắn mời hoặc toàn bộ đường link dự án..."
              className="min-h-11 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3.5 text-sm text-foreground focus:border-indigo-500 focus:outline-none"
            />
            <input
              value={joinRole}
              onChange={(e) => setJoinRole(e.target.value)}
              maxLength={80}
              placeholder="Vai trò của bạn (Tuỳ chọn: Đối tác, UI...)"
              className="min-h-11 rounded-xl border border-slate-700 bg-slate-950 px-3.5 text-sm text-foreground sm:w-56 focus:border-indigo-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !joinInput.trim()}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 cursor-pointer"
            >
              Vào nhóm <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </form>
      )}

      {invitations.length > 0 && (
        <section aria-label="Lời mời qua Email Google">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-indigo-300">
            <Mail className="h-4 w-4" />
            Lời mời gửi tới Gmail của bạn ({invitations.length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {invitations.map((invite) => (
              <div key={invite.id} className="flex flex-col justify-between rounded-2xl border border-indigo-500/40 bg-indigo-500/10 p-4">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-indigo-200">
                      {invite.projectCode}
                    </span>
                    {invite.invitedJobTitle && (
                      <span className="text-xs text-emerald-300">Vai trò: {invite.invitedJobTitle}</span>
                    )}
                  </div>
                  <p className="mt-2 text-base font-bold text-foreground">{invite.projectName}</p>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <button type="button" disabled={busy} onClick={() => void onAcceptInvite(invite.id)} className="flex-1 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50 cursor-pointer">
                    Tham gia dự án
                  </button>
                  <button type="button" disabled={busy} onClick={() => void onDeclineInvite(invite.id)} className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50 cursor-pointer">
                    Từ chối
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
