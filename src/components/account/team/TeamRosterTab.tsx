import { useState } from 'react';
import { Crown, Share2, UserCheck, UserMinus } from 'lucide-react';
import type { AccountProject, ProjectMember } from '../../../core/domain/accountProject';
import { getInitials, MEMBER_PALETTE } from '../../../core/domain/stackDomain';
import type { PresencePeer } from '../../../types/models';
import { MyProjectProfileCard } from './MyProjectProfileCard';

interface Props {
  project: AccountProject;
  members: ProjectMember[];
  currentUserId: string;
  canManageProject: boolean;
  peers: PresencePeer[];
  busy: boolean;
  onQuickOpenInviteTab: () => void;
  onFilterByMember: (memberId: string) => void;
  onUpdateMyProfile: (input: { displayName: string; jobTitle: string; avatarColor: string }) => Promise<void>;
  onUpdateMemberRole: (memberId: string, jobTitle: string) => Promise<void>;
  onToggleMemberActive: (memberId: string, active: boolean) => Promise<void>;
  onTransferOwner: (memberId: string, memberName: string) => Promise<void>;
  onUpdateProjectInfo: (name: string, description: string) => Promise<void>;
}

export function TeamRosterTab({
  project,
  members,
  currentUserId,
  canManageProject,
  peers,
  busy,
  onQuickOpenInviteTab,
  onFilterByMember,
  onUpdateMyProfile,
  onUpdateMemberRole,
  onToggleMemberActive,
  onTransferOwner,
  onUpdateProjectInfo,
}: Props) {
  const me = members.find((m) => m.user_id === currentUserId && m.active) ?? null;
  const [projName, setProjName] = useState(project.name);
  const [projDesc, setProjDesc] = useState(project.description);
  const [editingRoleMemberId, setEditingRoleMemberId] = useState<string | null>(null);
  const [editingRoleValue, setEditingRoleValue] = useState('');

  const peerMap = new Map(peers.map((p) => [p.memberId, p]));
  const activeCount = members.filter((m) => m.active).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/90 p-3.5">
        <div>
          <p className="text-xs text-slate-400">Mời đồng đội vào dự án</p>
          <p className="mt-0.5 text-xs font-bold text-foreground">
            Mã dự án: <span className="font-mono text-indigo-300">{project.code}</span> · Tối đa 20 người
          </p>
        </div>
        <button type="button" onClick={onQuickOpenInviteTab} className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-500 cursor-pointer">
          <Share2 className="h-3.5 w-3.5" />
          Lấy Link Zalo / Mời Gmail
        </button>
      </div>

      {me && <MyProjectProfileCard me={me} busy={busy} onSave={onUpdateMyProfile} />}

      <div>
        <h3 className="mb-2.5 text-xs font-bold text-slate-300">Danh sách thành viên ({activeCount}/20 người)</h3>
        <div className="space-y-2">
          {members.map((m, idx) => {
            const color = m.avatar_color || MEMBER_PALETTE[idx % MEMBER_PALETTE.length]!;
            const peer = peerMap.get(m.id);
            const isMe = m.user_id === currentUserId;
            return (
              <div key={m.id} className={`rounded-2xl border p-3 transition ${m.active ? 'border-slate-800 bg-slate-900/90' : 'border-slate-800/60 bg-slate-950/60 opacity-60'}`}>
                <div className="flex items-center justify-between gap-2.5">
                  <button type="button" onClick={() => onFilterByMember(m.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left cursor-pointer">
                    <span style={{ backgroundColor: color }} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold text-white shadow">
                      {getInitials(m.display_name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <strong className="truncate text-xs font-bold text-foreground sm:text-sm">{m.display_name}</strong>
                        {isMe && <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-bold text-indigo-300">Bạn</span>}
                        {m.access_role === 'owner' && (
                          <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                            <Crown className="h-2.5 w-2.5" /> Chủ dự án
                          </span>
                        )}
                        {peer && m.active && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">● Online ({peer.platform})</span>}
                        {!m.active && <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] text-rose-300">Tạm dừng</span>}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                        {m.job_title || (m.access_role === 'owner' ? 'Chủ dự án' : 'Thành viên')}
                      </span>
                    </span>
                  </button>

                  {canManageProject && (
                    <div className="flex shrink-0 items-center gap-1.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingRoleMemberId(editingRoleMemberId === m.id ? null : m.id);
                          setEditingRoleValue(m.job_title);
                        }}
                        className="rounded-lg border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800 cursor-pointer"
                      >
                        Vai trò
                      </button>
                      {m.access_role !== 'owner' && (
                        <>
                          <button type="button" disabled={busy} onClick={() => void onToggleMemberActive(m.id, !m.active)} title={m.active ? 'Tạm dừng quyền vào dự án' : 'Mở lại quyền vào dự án'} className="rounded-lg border border-slate-700 p-1.5 text-slate-300 hover:bg-slate-800 disabled:opacity-50 cursor-pointer">
                            {m.active ? <UserMinus className="h-3.5 w-3.5 text-rose-300" /> : <UserCheck className="h-3.5 w-3.5 text-emerald-300" />}
                          </button>
                          {m.active && (
                            <button type="button" disabled={busy} onClick={() => void onTransferOwner(m.id, m.display_name)} className="rounded-lg border border-amber-500/30 px-2 py-1 text-amber-300 hover:bg-amber-500/10 disabled:opacity-50 cursor-pointer">
                              Chuyển chủ
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {editingRoleMemberId === m.id && canManageProject && (
                  <div className="mt-2.5 flex gap-2 border-t border-slate-800 pt-2.5">
                    <input maxLength={80} value={editingRoleValue} onChange={(e) => setEditingRoleValue(e.target.value)} placeholder="Nhập vai trò cho thành viên..." className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-foreground" />
                    <button type="button" disabled={busy} onClick={() => void onUpdateMemberRole(m.id, editingRoleValue).then(() => setEditingRoleMemberId(null))} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white cursor-pointer">
                      Lưu
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {canManageProject && (
        <form onSubmit={(e) => { e.preventDefault(); void onUpdateProjectInfo(projName, projDesc); }} className="space-y-2.5 border-t border-slate-800 pt-4">
          <p className="text-xs font-bold text-slate-300">Thông tin dự án</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input required minLength={2} maxLength={120} value={projName} onChange={(e) => setProjName(e.target.value)} placeholder="Tên dự án" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-foreground" />
            <input maxLength={400} value={projDesc} onChange={(e) => setProjDesc(e.target.value)} placeholder="Mô tả ngắn dự án" className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-foreground" />
          </div>
          <button type="submit" disabled={busy} className="rounded-xl border border-indigo-500/50 bg-indigo-500/10 px-3.5 py-1.5 text-xs font-bold text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-50 cursor-pointer">
            Cập nhật thông tin dự án
          </button>
        </form>
      )}
    </div>
  );
}
