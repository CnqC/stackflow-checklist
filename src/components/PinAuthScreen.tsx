import React, { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Cloud,
  FolderPlus,
  KeyRound,
  Layers,
  Lock,
  Sparkles,
  UserPlus,
  Users,
} from 'lucide-react';
import { canAddMember, normalizeRoomCode } from '../domain/stackDomain';
import {
  MAX_TEAM_MEMBERS,
  type Member,
  type PresencePeer,
  type SyncMode,
  type WorkspaceSnapshot,
} from '../types/models';

interface PinAuthScreenProps {
  syncMode: SyncMode;
  initialRoomCode?: string;
  initialPin?: string;
  unlockedSnapshot: WorkspaceSnapshot | null;
  onlinePeers: PresencePeer[];
  onUnlockWorkspace: (roomCode: string, pin: string) => Promise<void>;
  onCreateWorkspace: (input: {
    code: string;
    name: string;
    pinCode: string;
    creatorName: string;
    creatorRole: string;
  }) => Promise<void>;
  onSelectMember: (member: Member) => void;
  onAddAndSelectMember: (name: string, role: string) => Promise<void>;
  onBackToPinStep: () => void;
  onOpenCloudConfig: () => void;
}

export const PinAuthScreen: React.FC<PinAuthScreenProps> = ({
  syncMode,
  initialRoomCode = '',
  initialPin = '',
  unlockedSnapshot,
  onlinePeers,
  onUnlockWorkspace,
  onCreateWorkspace,
  onSelectMember,
  onAddAndSelectMember,
  onBackToPinStep,
  onOpenCloudConfig,
}) => {
  const [tab, setTab] = useState<'join' | 'create'>('join');
  const [roomCode, setRoomCode] = useState(initialRoomCode || 'TEAM-STACK');
  const [pinCode, setPinCode] = useState(initialPin || '1234');

  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [creatorName, setCreatorName] = useState('');
  const [creatorRole, setCreatorRole] = useState('Tech Lead');

  const [addingMember, setAddingMember] = useState(false);
  const [memberName, setMemberName] = useState('');
  const [memberRole, setMemberRole] = useState('Developer');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onUnlockWorkspace(roomCode, pinCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleQuickDemo = async () => {
    setError(null);
    setRoomCode('TEAM-STACK');
    setPinCode('1234');
    setBusy(true);
    try {
      await onUnlockWorkspace('TEAM-STACK', '1234');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onCreateWorkspace({
        code: newCode,
        name: newName,
        pinCode: newPin,
        creatorName,
        creatorRole,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleAddMemberSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onAddAndSelectMember(memberName, memberRole);
      setMemberName('');
      setAddingMember(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#090d16] text-slate-100 flex flex-col justify-between relative overflow-hidden safe-top safe-bottom">
      {/* Subtle Ambient Glow */}
      <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 h-80 w-[36rem] rounded-full bg-indigo-600/20 blur-[110px]" />

      {/* Top Bar */}
      <header className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 pt-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-bold tracking-tight text-base text-white">StackFlow</span>
            <span className="ml-2 text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
              Web &amp; App
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenCloudConfig}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer bg-slate-900/90 hover:bg-slate-800 border-slate-700/80 text-slate-200"
        >
          <Cloud className={`w-3.5 h-3.5 ${syncMode !== 'local' ? 'text-emerald-400' : 'text-amber-400'}`} />
          <span>
            {syncMode === 'supabase'
              ? 'Supabase Cloud: Đã bật'
              : syncMode === 'relay'
                ? 'Internet E2EE: Trực tuyến'
                : 'Đồng bộ Internet E2EE: Sẵn sàng'}
          </span>
        </button>
      </header>

      {/* Main Card */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-6">
        <div className="w-full max-w-md bg-slate-900/85 backdrop-blur-xl border border-slate-800 rounded-2xl shadow-2xl shadow-black/50 p-5 sm:p-7">
          {!unlockedSnapshot ? (
            <>
              <div className="mb-5">
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                  Checklist Dự Án Nhóm
                </h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-1">
                  Theo dõi tiến độ theo từng Stack, tối ưu gọn nhẹ cho nhóm dưới {MAX_TEAM_MEMBERS} người trên cả Web &amp; Điện thoại.
                </p>
              </div>

              {/* Switch Join / Create */}
              <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-950/80 border border-slate-800 mb-5">
                <button
                  type="button"
                  onClick={() => {
                    setTab('join');
                    setError(null);
                  }}
                  className={`py-2 text-xs sm:text-sm font-semibold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    tab === 'join'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  Vào bằng PIN
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTab('create');
                    setError(null);
                  }}
                  className={`py-2 text-xs sm:text-sm font-semibold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    tab === 'create'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  Tạo dự án mới
                </button>
              </div>

              {error && (
                <div className="mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 px-3.5 py-2.5 text-xs text-rose-300">
                  {error}
                </div>
              )}

              {tab === 'join' ? (
                <form onSubmit={handleJoinSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Mã dự án (Room Code)
                    </label>
                    <input
                      type="text"
                      value={roomCode}
                      onChange={(e) => setRoomCode(normalizeRoomCode(e.target.value))}
                      placeholder="VD: TEAM-STACK"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-sm text-white font-mono tracking-wider focus:outline-none focus:border-indigo-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Mã PIN nội bộ
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        inputMode="numeric"
                        value={pinCode}
                        onChange={(e) => setPinCode(e.target.value)}
                        placeholder="Nhập mã PIN (mặc định mẫu: 1234)"
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-sm text-white tracking-widest focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 transition cursor-pointer"
                  >
                    <span>{busy ? 'Đang kiểm tra...' : 'Tiếp tục chọn tên thành viên'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  {syncMode !== 'supabase' && (
                    <button
                      type="button"
                      onClick={handleQuickDemo}
                      disabled={busy}
                      className="w-full py-2 px-3 rounded-xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/70 text-xs text-slate-300 flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Vào nhanh dự án mẫu (TEAM-STACK • PIN 1234)</span>
                    </button>
                  )}
                </form>
              ) : (
                <form onSubmit={handleCreateSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Tên dự án của nhóm
                    </label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => {
                        setNewName(e.target.value);
                        if (!newCode) {
                          setNewCode(normalizeRoomCode(e.target.value).slice(0, 14));
                        }
                      }}
                      placeholder="VD: Ra mắt App Đặt Lịch v1.0"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-sm text-white focus:outline-none focus:border-indigo-500"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Mã phòng ngắn
                      </label>
                      <input
                        type="text"
                        value={newCode}
                        onChange={(e) => setNewCode(normalizeRoomCode(e.target.value))}
                        placeholder="APP-V1"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-sm font-mono text-white focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Mã PIN (4–12 ký tự)
                      </label>
                      <input
                        type="text"
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value)}
                        placeholder="VD: 2026"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-sm font-mono text-white focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Tên của bạn
                      </label>
                      <input
                        type="text"
                        value={creatorName}
                        onChange={(e) => setCreatorName(e.target.value)}
                        placeholder="VD: Quang"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-sm text-white focus:outline-none focus:border-indigo-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Vai trò
                      </label>
                      <input
                        type="text"
                        value={creatorRole}
                        onChange={(e) => setCreatorRole(e.target.value)}
                        placeholder="Lead / Dev / Design"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700/80 text-sm text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition cursor-pointer"
                  >
                    <span>{busy ? 'Đang khởi tạo...' : 'Khởi tạo & Mở Checklist'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              )}
            </>
          ) : (
            /* Step 2: Member Identity Picker (<10 people) */
            <div>
              <div className="flex items-start justify-between gap-2 mb-4">
                <div>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                    {unlockedSnapshot.workspace.code}
                  </span>
                  <h2 className="text-lg sm:text-xl font-bold text-white mt-1.5">
                    {unlockedSnapshot.workspace.name}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Chọn tên của bạn để mọi thao tác tick &amp; sửa đều ghi nhận rõ ràng:
                  </p>
                </div>
                <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  <Users className="w-3.5 h-3.5 text-indigo-400" />
                  {unlockedSnapshot.members.length}/{MAX_TEAM_MEMBERS}
                </span>
              </div>

              {error && (
                <div className="mb-3 rounded-xl bg-rose-500/10 border border-rose-500/30 px-3 py-2 text-xs text-rose-300">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto pr-1">
                {unlockedSnapshot.members.map((member) => {
                  const isOnline = onlinePeers.some((p) => p.memberId === member.id);
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => onSelectMember(member)}
                      className="group flex items-center gap-3 p-3 rounded-xl bg-slate-950/80 hover:bg-indigo-600/15 border border-slate-800 hover:border-indigo-500/60 text-left transition cursor-pointer"
                    >
                      <div
                        className="relative w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-inner"
                        style={{ backgroundColor: member.color }}
                      >
                        {member.avatar}
                        {isOnline && (
                          <span
                            title="Đang trực tuyến"
                            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-slate-950"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm text-white truncate group-hover:text-indigo-200">
                          {member.name}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">{member.role}</div>
                      </div>
                      <CheckCircle2 className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 shrink-0" />
                    </button>
                  );
                })}
              </div>

              {/* Add new member inline if < 10 */}
              {canAddMember(unlockedSnapshot.members, unlockedSnapshot.workspace.maxMembers) ? (
                !addingMember ? (
                  <button
                    type="button"
                    onClick={() => setAddingMember(true)}
                    className="mt-3 w-full py-2.5 px-3 rounded-xl border border-dashed border-slate-700 hover:border-indigo-500/60 text-xs font-medium text-slate-300 hover:text-indigo-300 flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Chưa có tên bạn? Thêm vào nhóm ({unlockedSnapshot.members.length}/{MAX_TEAM_MEMBERS})</span>
                  </button>
                ) : (
                  <form
                    onSubmit={handleAddMemberSubmit}
                    className="mt-3 p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={memberName}
                        onChange={(e) => setMemberName(e.target.value)}
                        placeholder="Tên của bạn"
                        className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                        autoFocus
                        required
                      />
                      <input
                        type="text"
                        value={memberRole}
                        onChange={(e) => setMemberRole(e.target.value)}
                        placeholder="Vai trò (VD: Dev)"
                        className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setAddingMember(false)}
                        className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white cursor-pointer"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        disabled={busy}
                        className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white cursor-pointer"
                      >
                        {busy ? 'Đang thêm...' : 'Thêm & Vào ngay'}
                      </button>
                    </div>
                  </form>
                )
              ) : (
                <p className="mt-3 text-center text-[11px] text-amber-400/90">
                  Nhóm đã đủ {MAX_TEAM_MEMBERS}/{MAX_TEAM_MEMBERS} thành viên. Hãy chọn tên của bạn ở trên.
                </p>
              )}

              <button
                type="button"
                onClick={onBackToPinStep}
                className="mt-4 w-full text-center text-xs text-slate-500 hover:text-slate-300 cursor-pointer"
              >
                ← Đổi mã dự án khác
              </button>
            </div>
          )}
        </div>
      </main>

      <footer className="relative z-10 text-center pb-4 px-4 text-[11px] text-slate-500">
        Tối ưu cho nhóm &lt;10 người • Đồng bộ Realtime trên cả Web, PWA &amp; Android APK
      </footer>
    </div>
  );
};
