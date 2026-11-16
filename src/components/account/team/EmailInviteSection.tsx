import { useState, type FormEvent } from 'react';
import { Check, Copy, Mail, Send, Trash2 } from 'lucide-react';
import type {
  AccountProject,
  PendingEmailInvitation,
  ProjectJoinLinkInfo,
} from '../../../core/domain/accountProject';
import {
  copyTextResilient,
  createRuntimeShareBundle,
  launchShareChannel,
} from '../../../infrastructure/projects/shareChannelLauncher';

interface Props {
  project: AccountProject;
  joinLink: ProjectJoinLinkInfo | null;
  pendingInvites: PendingEmailInvitation[];
  busy: boolean;
  onInviteEmail: (email: string, jobTitle: string) => Promise<void>;
  onRevokeInvite: (invitationId: string) => Promise<void>;
  onFeedback: (message: string) => void;
}

export function EmailInviteSection({
  project,
  joinLink,
  pendingInvites,
  busy,
  onInviteEmail,
  onRevokeInvite,
  onFeedback,
}: Props) {
  const [email, setEmail] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [openGmailCompose, setOpenGmailCompose] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function buildInviteBundle(targetEmail: string, targetRole: string) {
    return createRuntimeShareBundle({
      projectName: project.name,
      projectCode: project.code,
      joinCode: joinLink?.enabled ? joinLink.joinCode : null,
      invitedJobTitle: targetRole,
      recipientEmail: targetEmail,
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const targetEmail = email.trim().toLowerCase();
    const targetRole = jobTitle.trim();
    if (!targetEmail) return;

    await onInviteEmail(targetEmail, targetRole);
    const bundle = buildInviteBundle(targetEmail, targetRole);
    setEmail('');
    setJobTitle('');

    if (openGmailCompose) {
      const result = await launchShareChannel('gmail', bundle);
      onFeedback(`Đã cấp quyền cho ${targetEmail}. ${result.notice}`);
    } else {
      await copyTextResilient(bundle.fullMessage);
      onFeedback(
        `Đã cấp quyền tham gia cho ${targetEmail} và chép sẵn lời mời kèm Link vào bộ nhớ tạm!`,
      );
    }
  }

  async function handleResendGmail(inv: PendingEmailInvitation) {
    const bundle = buildInviteBundle(inv.invitedEmail, inv.invitedJobTitle);
    const result = await launchShareChannel('gmail', bundle);
    onFeedback(result.notice);
  }

  async function handleCopyForInvite(inv: PendingEmailInvitation) {
    const bundle = buildInviteBundle(inv.invitedEmail, inv.invitedJobTitle);
    const ok = await copyTextResilient(bundle.fullMessage);
    if (ok) {
      setCopiedId(inv.id);
      setTimeout(() => setCopiedId((cur) => (cur === inv.id ? null : cur)), 2200);
      onFeedback(`Đã sao chép thư mời & Link dự án cho ${inv.invitedEmail}!`);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
      <div className="flex items-center gap-2 text-xs font-bold text-foreground">
        <Mail className="h-4 w-4 text-sky-400" />
        Kênh 2 — Cấp quyền &amp; Gửi đích danh tới Gmail đối tác
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-2.5">
        <div className="grid gap-2 sm:grid-cols-[1.2fr_0.8fr_auto]">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="doitac@gmail.com"
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-foreground focus:border-indigo-500 focus:outline-none"
          />
          <input
            maxLength={80}
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="Vai trò (VD: Đối tác, QA, UI/UX)"
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-foreground focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50 cursor-pointer"
          >
            <Send className="h-3.5 w-3.5" />
            {openGmailCompose ? 'Mời & Mở Gmail' : 'Lưu lời mời'}
          </button>
        </div>

        <label className="inline-flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={openGmailCompose}
            onChange={(e) => setOpenGmailCompose(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-600 accent-indigo-500"
          />
          Mở ngay cửa sổ soạn Gmail kèm sẵn đường dẫn vào dự án cho địa chỉ này
        </label>
      </form>

      {pendingInvites.length > 0 && (
        <div className="space-y-1.5 border-t border-slate-800 pt-3">
          <p className="text-[11px] font-semibold text-slate-400">
            Đang chờ xác nhận ({pendingInvites.length})
          </p>
          {pendingInvites.map((inv) => (
            <div
              key={inv.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-foreground">{inv.invitedEmail}</p>
                {inv.invitedJobTitle && (
                  <p className="truncate text-[11px] text-slate-400">Vai trò: {inv.invitedJobTitle}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void handleResendGmail(inv)}
                  className="inline-flex items-center gap-1 rounded-lg border border-sky-500/35 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-200 hover:bg-sky-500/20 cursor-pointer"
                >
                  <Mail className="h-3 w-3" /> Gửi Gmail
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyForInvite(inv)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  {copiedId === inv.id ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {copiedId === inv.id ? 'Đã chép' : 'Chép thư'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onRevokeInvite(inv.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" /> Thu hồi
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
