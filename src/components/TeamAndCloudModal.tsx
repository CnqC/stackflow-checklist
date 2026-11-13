import React, { useState } from 'react';
import {
  Check,
  Cloud,
  Copy,
  Database,
  Download,
  Share2,
  Smartphone,
  Trash2,
  UploadCloud,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import schemaSqlRaw from '../../supabase/schema.sql?raw';
import { canAddMember } from '../domain/stackDomain';
import {
  getBundledSupabaseConfig,
  getSupabaseConfig,
  saveSupabaseConfig,
  verifySupabaseConnection,
} from '../services/supabaseConfig';
import {
  MAX_TEAM_MEMBERS,
  type Member,
  type PresencePeer,
  type SyncMode,
  type WorkspaceSnapshot,
} from '../types/models';

interface TeamAndCloudModalProps {
  open: boolean;
  initialTab?: 'team' | 'cloud' | 'app';
  onClose: () => void;
  snapshot: WorkspaceSnapshot | null;
  currentMember: Member | null;
  onlinePeers: PresencePeer[];
  syncMode: SyncMode;
  onAddMember?: (name: string, role: string) => Promise<void>;
  onRemoveMember?: (memberId: string) => Promise<void>;
  onCloudConfigChanged: () => void;
  onPushCurrentToSupabase?: () => Promise<void>;
  deferredInstallPrompt: BeforeInstallPromptEvent | null;
  onTriggerInstallPwa: () => Promise<void>;
}

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const TeamAndCloudModal: React.FC<TeamAndCloudModalProps> = ({
  open,
  initialTab = 'team',
  onClose,
  snapshot,
  currentMember,
  onlinePeers,
  syncMode,
  onAddMember,
  onRemoveMember,
  onCloudConfigChanged,
  onPushCurrentToSupabase,
  deferredInstallPrompt,
  onTriggerInstallPwa,
}) => {
  const existingCfg = getSupabaseConfig() ?? getBundledSupabaseConfig();
  const [tab, setTab] = useState<'team' | 'cloud' | 'app'>(initialTab);

  const [sbUrl, setSbUrl] = useState(existingCfg?.url ?? '');
  const [sbKey, setSbKey] = useState(existingCfg?.anonKey ?? '');
  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('Developer');
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  if (!open) return null;

  const activeTab = !snapshot && tab === 'team' ? 'cloud' : tab;

  const handleCopyInvite = async () => {
    if (!snapshot) return;
    const isNativeOrLocal =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const base = isNativeOrLocal
      ? 'https://cnqc.github.io/stackflow-checklist/'
      : window.location.origin + window.location.pathname;
    const url = `${base}?room=${encodeURIComponent(snapshot.workspace.code)}&pin=${encodeURIComponent(snapshot.workspace.pinCode)}`;
    const apkUrl = 'https://github.com/CnqC/stackflow-checklist/releases/latest/download/StackFlow-Checklist.apk';
    const inviteText = `Checklist dự án "${snapshot.workspace.name}"\n• Link Web/iPhone: ${url}\n• Tải App Android (.apk): ${apkUrl}\n• Mã dự án: ${snapshot.workspace.code}\n• Mã PIN: ${snapshot.workspace.pinCode}`;
    await navigator.clipboard.writeText(inviteText);
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2500);
  };

  const handleCopySql = async () => {
    await navigator.clipboard.writeText(schemaSqlRaw);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  const handleSaveSupabase = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    setBusy(true);
    try {
      const check = await verifySupabaseConnection(sbUrl, sbKey);
      if (!check.ok) {
        setStatusMsg({ type: 'err', text: check.errorMessage ?? 'Kết nối thất bại.' });
        return;
      }
      saveSupabaseConfig({ url: sbUrl, anonKey: sbKey });
      onCloudConfigChanged();
      setStatusMsg({
        type: 'ok',
        text: 'Đã kết nối Supabase Realtime thành công! Mọi thao tác từ nay đồng bộ tức thì qua Internet.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnectSupabase = () => {
    saveSupabaseConfig(null);
    const bundledCfg = getBundledSupabaseConfig();
    setSbUrl(bundledCfg?.url ?? '');
    setSbKey(bundledCfg?.anonKey ?? '');
    onCloudConfigChanged();
    setStatusMsg({
      type: 'ok',
      text: 'Đã chuyển về chế độ Local / Đa cửa sổ trên thiết bị này.',
    });
  };

  const handlePushSnapshot = async () => {
    if (!onPushCurrentToSupabase) return;
    setStatusMsg(null);
    setBusy(true);
    try {
      await onPushCurrentToSupabase();
      setStatusMsg({
        type: 'ok',
        text: 'Đã đẩy toàn bộ Stack, Thành viên và Đầu việc của dự án hiện tại lên Supabase Cloud!',
      });
    } catch (err) {
      setStatusMsg({
        type: 'err',
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAddMember || !newMemberName.trim()) return;
    setStatusMsg(null);
    setBusy(true);
    try {
      await onAddMember(newMemberName.trim(), newMemberRole.trim() || 'Member');
      setNewMemberName('');
    } catch (err) {
      setStatusMsg({ type: 'err', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="font-bold text-base text-white">Quản lý Nhóm, Đồng bộ Cloud &amp; App</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-3 p-1.5 bg-slate-950 border-b border-slate-800 gap-1">
          {snapshot && (
            <button
              type="button"
              onClick={() => {
                setTab('team');
                setStatusMsg(null);
              }}
              className={`py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
                activeTab === 'team'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Nhóm ({snapshot.members.length}/{MAX_TEAM_MEMBERS})
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setTab('cloud');
              setStatusMsg(null);
            }}
            className={`py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'cloud'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            Supabase Cloud
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('app');
              setStatusMsg(null);
            }}
            className={`py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'app'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            Cài đặt App
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {statusMsg && (
            <div
              className={`rounded-xl px-3.5 py-2.5 text-xs border ${
                statusMsg.type === 'ok'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {statusMsg.text}
            </div>
          )}

          {/* TAB 1: TEAM & INVITE */}
          {activeTab === 'team' && snapshot && (
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-400">Mã mời bạn bè vào dự án</div>
                  <div className="mt-1 flex items-center gap-3">
                    <span className="font-mono font-bold text-sm text-indigo-300">
                      Mã: {snapshot.workspace.code}
                    </span>
                    <span className="font-mono font-bold text-sm text-emerald-300">
                      PIN: {snapshot.workspace.pinCode}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopyInvite()}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white cursor-pointer shrink-0"
                >
                  {copiedInvite ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                  {copiedInvite ? 'Đã chép Link + PIN!' : 'Sao chép Link mời nhóm'}
                </button>
              </div>

              <div>
                <h3 className="text-xs font-semibold text-slate-300 mb-2">
                  Danh sách thành viên ({snapshot.members.length}/{MAX_TEAM_MEMBERS} người)
                </h3>
                <ul className="space-y-2">
                  {snapshot.members.map((m) => {
                    const peer = onlinePeers.find((p) => p.memberId === m.id);
                    const isMe = currentMember?.id === m.id;
                    return (
                      <li
                        key={m.id}
                        className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-slate-950/70 border border-slate-800"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-8 h-8 rounded-lg text-xs font-bold text-white flex items-center justify-center shrink-0"
                            style={{ backgroundColor: m.color }}
                          >
                            {m.avatar}
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-semibold text-white flex items-center gap-1.5">
                              <span className="truncate">{m.name}</span>
                              {isMe && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                                  Bạn
                                </span>
                              )}
                              {peer && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                                  ● Online ({peer.platform})
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400">{m.role}</div>
                          </div>
                        </div>

                        {!isMe && snapshot.members.length > 1 && onRemoveMember && (
                          <button
                            type="button"
                            onClick={() => void onRemoveMember(m.id)}
                            title="Xóa khỏi dự án"
                            className="p-1.5 text-slate-500 hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>

              {canAddMember(snapshot.members, snapshot.workspace.maxMembers) && onAddMember && (
                <form onSubmit={handleAddMember} className="flex flex-col sm:flex-row gap-2 pt-1">
                  <input
                    type="text"
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    placeholder="Tên thành viên mới..."
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                    required
                  />
                  <input
                    type="text"
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value)}
                    placeholder="Vai trò (Dev, Art, QA...)"
                    className="sm:w-40 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white cursor-pointer shrink-0"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Thêm
                  </button>
                </form>
              )}
            </div>
          )}

          {/* TAB 2: SUPABASE CLOUD REALTIME */}
          {activeTab === 'cloud' && (
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-3.5 text-xs text-slate-300 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-emerald-400" />
                    Trạng thái hiện tại:{' '}
                    {syncMode === 'supabase' ? (
                      <span className="text-emerald-400">Đang đồng bộ qua Supabase Cloud</span>
                    ) : (
                      <span className="text-amber-300">Chế độ Local (Đồng bộ tức thì giữa các tab)</span>
                    )}
                  </span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Để cả nhóm (&lt;10 bạn bè) ở khác mạng Wi-Fi/4G cùng sửa trực tiếp trên Web &amp; Điện thoại:
                  Tạo 1 project miễn phí tại <strong>supabase.com</strong>, bấm nút chép SQL bên dưới chạy trong
                  mục <em>SQL Editor</em>, rồi dán <strong>Project URL</strong> + <strong>Anon Key</strong> vào đây.
                </p>
                <button
                  type="button"
                  onClick={() => void handleCopySql()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-indigo-300 cursor-pointer"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedSql ? 'Đã chép toàn bộ mã SQL!' : 'Sao chép mã khởi tạo bảng (schema.sql)'}
                </button>
              </div>

              <form onSubmit={handleSaveSupabase} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Supabase Project URL
                  </label>
                  <input
                    type="url"
                    value={sbUrl}
                    onChange={(e) => setSbUrl(e.target.value)}
                    placeholder="https://xxxx.supabase.co"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Supabase Publishable / Anon Key
                  </label>
                  <input
                    type="password"
                    value={sbKey}
                    onChange={(e) => setSbKey(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                    required
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-semibold text-white cursor-pointer"
                  >
                    {busy ? 'Đang kiểm tra...' : 'Kiểm tra & Lưu kết nối Cloud'}
                  </button>

                  {syncMode === 'supabase' && snapshot && onPushCurrentToSupabase && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handlePushSnapshot()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white cursor-pointer"
                    >
                      <UploadCloud className="w-3.5 h-3.5" />
                      Đẩy dự án hiện tại lên Cloud
                    </button>
                  )}

                  {syncMode === 'supabase' && (
                    <button
                      type="button"
                      onClick={handleDisconnectSupabase}
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 cursor-pointer"
                    >
                      Ngắt Cloud
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: PWA & ANDROID APK */}
          {activeTab === 'app' && (
            <div className="space-y-3.5 text-xs text-slate-300">
              {deferredInstallPrompt && (
                <div className="rounded-xl bg-indigo-600/15 border border-indigo-500/40 p-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-bold text-sm text-white">Cài đặt ứng dụng StackFlow ngay</div>
                    <p className="text-slate-300 mt-0.5">
                      Chạy độc lập toàn màn hình như App gốc, mở 1 chạm từ màn hình chính.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onTriggerInstallPwa()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold cursor-pointer shrink-0"
                  >
                    <Download className="w-4 h-4" />
                    Cài đặt
                  </button>
                </div>
              )}

              <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-3">
                <div className="font-semibold text-white">1. Bản Android APK gốc (Capacitor)</div>
                <p className="text-slate-400">
                  Tải trực tiếp file <code className="text-indigo-300">StackFlow-Checklist.apk</code> để cài lên
                  điện thoại Android hoặc gửi qua Zalo/Telegram cho cả nhóm:
                </p>
                <a
                  href="https://github.com/CnqC/stackflow-checklist/releases/latest/download/StackFlow-Checklist.apk"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition"
                >
                  <Download className="w-4 h-4" />
                  Tải xuống StackFlow-Checklist.apk (Android)
                </a>
              </div>

              <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-2">
                <div className="font-semibold text-white">2. Bản iPhone / iPad và máy tính</div>
                <p className="text-slate-400">
                  Trên Safari iPhone: Bấm nút <strong>Chia sẻ (Share)</strong> ở cạnh dưới → Chọn{' '}
                  <strong>Thêm vào Màn hình chính (Add to Home Screen)</strong>. Ứng dụng sẽ hiển thị biểu tượng
                  StackFlow riêng và đồng bộ thời gian thực cùng cả nhóm.
                </p>
                <p className="text-slate-400">
                  Trên Windows: Mở trang này bằng <strong>Microsoft Edge</strong>, bấm biểu tượng cài ứng dụng
                  trên thanh địa chỉ hoặc vào <strong>⋯ → Ứng dụng → Cài đặt trang này dưới dạng ứng dụng</strong>.
                  Sau khi cài, bạn có thể ghim StackFlow vào Start hoặc thanh tác vụ.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
