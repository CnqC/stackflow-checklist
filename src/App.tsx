import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CheckSquare,
  Cloud,
  Filter,
  FolderPlus,
  Layers,
  Lock,
  LogOut,
  Plus,
  Search,
  Share2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { ActivityPanel } from './components/ActivityPanel';
import { NotificationBell } from './components/NotificationBell';
import { PinAuthScreen } from './components/PinAuthScreen';
import { StackGroupCard } from './components/StackGroupCard';
import { TaskDetailDrawer } from './components/TaskDetailDrawer';
import {
  TeamAndCloudModal,
  type BeforeInstallPromptEvent,
} from './components/TeamAndCloudModal';
import {
  calculateProgress,
  isMemberInvolvedInItem,
  STACK_PALETTE,
} from './domain/stackDomain';
import { syncService } from './services/syncService';
import {
  MAX_TEAM_MEMBERS,
  type ChecklistItem,
  type Member,
  type PresencePeer,
  type SyncMode,
  type WorkspaceSnapshot,
} from './types/models';

const SESSION_STORAGE_KEY = 'stackflow_saved_session_v1';

interface SavedSession {
  roomCode: string;
  pinCode: string;
  memberId?: string;
}

type TaskFilter = 'all' | 'mine' | 'incomplete' | 'doing' | 'blocked' | 'done';
type MobileTab = 'board' | 'mine' | 'activity' | 'team';

export function App() {
  const [syncMode, setSyncMode] = useState<SyncMode>(() => syncService.getSyncMode());
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [currentMember, setCurrentMember] = useState<Member | null>(null);
  const [onlinePeers, setOnlinePeers] = useState<PresencePeer[]>([]);

  const [filter, setFilter] = useState<TaskFilter>('all');
  const [assigneeFilterId, setAssigneeFilterId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileTab, setMobileTab] = useState<MobileTab>('board');

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [showAddStack, setShowAddStack] = useState(false);
  const [newStackTitle, setNewStackTitle] = useState('');
  const [newStackDesc, setNewStackDesc] = useState('');
  const [newStackSequential, setNewStackSequential] = useState(false);
  const [newStackColor, setNewStackColor] = useState(STACK_PALETTE[0]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'team' | 'cloud' | 'app'>('team');
  const [toast, setToast] = useState<string | null>(null);
  const [deferredInstallPrompt, setDeferredInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  // Parse URL invite params if present
  const urlParams = useMemo(() => {
    if (typeof window === 'undefined') return { room: '', pin: '' };
    const sp = new URLSearchParams(window.location.search);
    return {
      room: sp.get('room') ?? '',
      pin: sp.get('pin') ?? '',
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // Subscribe to realtime snapshot, presence & sync mode updates
  useEffect(() => {
    const unsubSnap = syncService.subscribeSnapshot((next) => {
      setSnapshot(next);
    });
    const unsubPresence = syncService.subscribePresence((peers) => {
      setOnlinePeers(peers);
    });
    const unsubMode = syncService.subscribeSyncMode((mode) => {
      setSyncMode(mode);
    });
    return () => {
      unsubSnap();
      unsubPresence();
      unsubMode();
    };
  }, []);

  // Capture PWA install prompt
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Auto-restore previous session or URL invite on mount
  useEffect(() => {
    const restore = async () => {
      try {
        if (urlParams.room && urlParams.pin) {
          await syncService.joinWorkspaceByPin(urlParams.room, urlParams.pin);
          return;
        }
        const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw) as SavedSession;
        if (!saved.roomCode || !saved.pinCode) return;
        const snap = await syncService.joinWorkspaceByPin(saved.roomCode, saved.pinCode);
        if (saved.memberId) {
          const found = snap.members.find((m) => m.id === saved.memberId);
          if (found) {
            setCurrentMember(found);
            syncService.setActiveMember(found);
          }
        }
      } catch {
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    };
    void restore();
  }, [urlParams.pin, urlParams.room]);

  // Keep currentMember synced if member list updates
  useEffect(() => {
    if (!snapshot || !currentMember) return;
    const updatedMe = snapshot.members.find((m) => m.id === currentMember.id);
    if (updatedMe && updatedMe !== currentMember) {
      setCurrentMember(updatedMe);
    }
  }, [snapshot, currentMember]);

  const persistSession = (roomCode: string, pinCode: string, memberId?: string) => {
    const payload: SavedSession = { roomCode, pinCode, memberId };
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
  };

  const handleUnlockWorkspace = async (roomCode: string, pinCode: string) => {
    const snap = await syncService.joinWorkspaceByPin(roomCode, pinCode);
    persistSession(snap.workspace.code, snap.workspace.pinCode);
  };

  const handleCreateWorkspace = async (input: {
    code: string;
    name: string;
    pinCode: string;
    creatorName: string;
    creatorRole: string;
  }) => {
    const { snapshot: snap, creator } = await syncService.createWorkspace(input);
    setCurrentMember(creator);
    syncService.setActiveMember(creator);
    persistSession(snap.workspace.code, snap.workspace.pinCode, creator.id);
    showToast(`Đã tạo dự án "${snap.workspace.name}" thành công!`);
  };

  const handleSelectMember = (member: Member) => {
    setCurrentMember(member);
    syncService.setActiveMember(member);
    if (snapshot) {
      persistSession(snapshot.workspace.code, snapshot.workspace.pinCode, member.id);
    }
  };

  const handleAddAndSelectMember = async (name: string, role: string) => {
    const created = await syncService.addMember(name, role);
    handleSelectMember(created);
  };

  const handleLogout = () => {
    syncService.teardownConnections();
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    setCurrentMember(null);
    setSnapshot(null);
  };

  const handleSwitchMemberOnly = () => {
    if (snapshot) {
      persistSession(snapshot.workspace.code, snapshot.workspace.pinCode);
    }
    syncService.setActiveMember(null);
    setCurrentMember(null);
  };

  const handleCreateStack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentMember || !newStackTitle.trim()) return;
    await syncService.addStack({
      title: newStackTitle.trim(),
      description: newStackDesc.trim(),
      sequentialLock: newStackSequential,
      color: newStackColor,
      actor: currentMember,
    });
    setNewStackTitle('');
    setNewStackDesc('');
    setNewStackSequential(false);
    setShowAddStack(false);
    showToast('Đã thêm Stack mới!');
  };

  const handleTriggerInstallPwa = async () => {
    if (!deferredInstallPrompt) return;
    await deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    setDeferredInstallPrompt(null);
  };

  const selectedItem: ChecklistItem | null = useMemo(() => {
    if (!snapshot || !selectedItemId) return null;
    return snapshot.items.find((i) => i.id === selectedItemId) ?? null;
  }, [snapshot, selectedItemId]);

  const overallStats = useMemo(
    () => calculateProgress(snapshot?.items ?? []),
    [snapshot?.items],
  );

  const effectiveFilter: TaskFilter = mobileTab === 'mine' ? 'mine' : filter;

  const filterItem = (item: ChecklistItem): boolean => {
    if (assigneeFilterId && !isMemberInvolvedInItem(item, assigneeFilterId)) {
      return false;
    }
    if (
      effectiveFilter === 'mine' &&
      currentMember &&
      !isMemberInvolvedInItem(item, currentMember.id)
    ) {
      return false;
    }
    if (effectiveFilter === 'incomplete' && item.completed) return false;
    if (effectiveFilter === 'doing' && (item.completed || item.status !== 'doing')) return false;
    if (effectiveFilter === 'blocked' && (item.completed || item.status !== 'blocked')) return false;
    if (effectiveFilter === 'done' && !item.completed) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const inTitle = item.title.toLowerCase().includes(q);
      const inNotes = item.notes.toLowerCase().includes(q);
      if (!inTitle && !inNotes) return false;
    }
    return true;
  };

  // Render PIN / Member Gate if not signed in
  if (!snapshot || !currentMember) {
    return (
      <>
        <PinAuthScreen
          syncMode={syncMode}
          initialRoomCode={urlParams.room}
          initialPin={urlParams.pin}
          unlockedSnapshot={snapshot}
          onlinePeers={onlinePeers}
          onUnlockWorkspace={handleUnlockWorkspace}
          onCreateWorkspace={handleCreateWorkspace}
          onSelectMember={handleSelectMember}
          onAddAndSelectMember={handleAddAndSelectMember}
          onBackToPinStep={handleLogout}
          onOpenCloudConfig={() => {
            setModalTab('cloud');
            setModalOpen(true);
          }}
        />
        <TeamAndCloudModal
          open={modalOpen}
          initialTab={modalTab}
          onClose={() => setModalOpen(false)}
          snapshot={snapshot}
          currentMember={currentMember}
          onlinePeers={onlinePeers}
          syncMode={syncMode}
          onCloudConfigChanged={() => setSyncMode(syncService.getSyncMode())}
          deferredInstallPrompt={deferredInstallPrompt}
          onTriggerInstallPwa={handleTriggerInstallPwa}
        />
      </>
    );
  }

  const myRemainingCount = snapshot.items.filter(
    (i) => isMemberInvolvedInItem(i, currentMember.id) && !i.completed,
  ).length;

  const handleOpenTaskFromNotice = (taskId: string) => {
    const exists = snapshot.items.some((i) => i.id === taskId);
    if (!exists) {
      showToast('Đầu việc này đã được xóa hoặc không còn tồn tại.');
      return;
    }
    if (mobileTab === 'activity') {
      setMobileTab('board');
    }
    setSelectedItemId(taskId);
  };

  return (
    <div className="min-h-dvh bg-[#090d16] text-slate-100 flex flex-col lg:flex-row safe-top">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-slate-900 border border-indigo-500/50 text-xs sm:text-sm font-medium text-white shadow-2xl flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* =====================================================================
          DESKTOP LEFT SIDEBAR (>= 1024px)
         ===================================================================== */}
      <aside className="hidden lg:flex lg:w-72 xl:w-80 shrink-0 flex-col justify-between border-r border-slate-800/80 bg-slate-950/60 p-5 h-dvh sticky top-0 overflow-y-auto">
        <div className="space-y-6">
          {/* Brand + Project Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/20">
                <Layers className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-mono text-indigo-400">
                  {snapshot.workspace.code}
                </div>
                <h1 className="font-bold text-sm text-white truncate" title={snapshot.workspace.name}>
                  {snapshot.workspace.name}
                </h1>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setModalTab('team');
                setModalOpen(true);
              }}
              title="Mời bạn bè & Lấy mã PIN"
              className="p-2 rounded-xl bg-indigo-600/15 hover:bg-indigo-600/25 text-indigo-300 border border-indigo-500/30 cursor-pointer shrink-0"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>

          {/* Overall Progress Card */}
          <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-xs text-slate-400">Tiến độ toàn dự án</div>
                <div className="text-2xl font-extrabold text-white mt-0.5 tabular-nums">
                  {overallStats.percentage}%
                </div>
              </div>
              <span className="text-xs font-semibold text-slate-300 tabular-nums">
                {overallStats.completed}/{overallStats.total} mục
              </span>
            </div>

            <div className="h-2.5 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-sky-400 to-emerald-400 transition-all duration-300"
                style={{ width: `${overallStats.percentage}%` }}
              />
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              <div className="rounded-xl bg-slate-950/80 py-1.5 px-2 border border-slate-800/80">
                <div className="text-xs font-bold text-emerald-400 tabular-nums">
                  {overallStats.completed}
                </div>
                <div className="text-[10px] text-slate-400">Đã xong</div>
              </div>
              <div className="rounded-xl bg-slate-950/80 py-1.5 px-2 border border-slate-800/80">
                <div className="text-xs font-bold text-sky-400 tabular-nums">
                  {overallStats.doing}
                </div>
                <div className="text-[10px] text-slate-400">Đang làm</div>
              </div>
              <div className="rounded-xl bg-slate-950/80 py-1.5 px-2 border border-slate-800/80">
                <div className="text-xs font-bold text-rose-400 tabular-nums">
                  {overallStats.blocked}
                </div>
                <div className="text-[10px] text-slate-400">Đang kẹt</div>
              </div>
            </div>
          </div>

          {/* Stack Roadmap Quick Overview */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Các tầng Stack ({snapshot.stacks.length})
              </span>
              <button
                type="button"
                onClick={() => setShowAddStack(true)}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Thêm Stack
              </button>
            </div>
            <ul className="space-y-1.5">
              {snapshot.stacks.map((st) => {
                const stStats = calculateProgress(
                  snapshot.items.filter((i) => i.stackId === st.id),
                );
                return (
                  <li
                    key={st.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-900/50 border border-slate-800/60 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: st.color }}
                      />
                      <span className="text-slate-200 truncate">{st.title}</span>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400 shrink-0">
                      {stStats.percentage}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Team Roster Filter (<10 Members) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Thành viên ({snapshot.members.length}/{MAX_TEAM_MEMBERS})
              </span>
              {assigneeFilterId && (
                <button
                  type="button"
                  onClick={() => setAssigneeFilterId(null)}
                  className="text-[11px] text-indigo-400 hover:underline cursor-pointer"
                >
                  Bỏ lọc
                </button>
              )}
            </div>
            <div className="space-y-1">
              {snapshot.members.map((m) => {
                const isOnline = onlinePeers.some((p) => p.memberId === m.id);
                const isSelected = assigneeFilterId === m.id;
                const countLeft = snapshot.items.filter(
                  (i) => isMemberInvolvedInItem(i, m.id) && !i.completed,
                ).length;

                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setAssigneeFilterId(isSelected ? null : m.id)}
                    className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left transition cursor-pointer border ${
                      isSelected
                        ? 'bg-indigo-600/20 border-indigo-500/50 text-white'
                        : 'bg-transparent border-transparent hover:bg-slate-900 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="relative w-7 h-7 rounded-lg text-[10px] font-bold text-white flex items-center justify-center shrink-0"
                        style={{ backgroundColor: m.color }}
                      >
                        {m.avatar}
                        {isOnline && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-slate-950" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold truncate">
                          {m.name} {m.id === currentMember.id ? '(Bạn)' : ''}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">{m.role}</div>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-900 text-slate-400">
                      {countLeft} việc
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom Current Member & Sync Status */}
        <div className="pt-4 mt-4 border-t border-slate-800/80 space-y-2.5">
          <button
            type="button"
            onClick={() => {
              setModalTab('cloud');
              setModalOpen(true);
            }}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs cursor-pointer"
          >
            <span className="inline-flex items-center gap-2 text-slate-200 font-medium">
              <Cloud
                className={`w-4 h-4 ${
                  syncMode !== 'local' ? 'text-emerald-400' : 'text-amber-400'
                }`}
              />
              {syncMode === 'supabase'
                ? 'Supabase Cloud: Bật'
                : syncMode === 'relay'
                  ? 'Internet E2EE: Trực tuyến'
                  : 'Đồng bộ Local / Cloud'}
            </span>
            <span className="text-[11px] text-indigo-400">Cấu hình</span>
          </button>

          <div className="flex items-center justify-between gap-2 px-1">
            <button
              type="button"
              onClick={handleSwitchMemberOnly}
              className="text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              Đổi thành viên ({currentMember.name})
            </button>
            <button
              type="button"
              onClick={handleLogout}
              title="Thoát ra màn hình PIN"
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-rose-400 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Thoát
            </button>
          </div>
        </div>
      </aside>

      {/* =====================================================================
          MOBILE TOP HEADER (< 1024px)
         ===================================================================== */}
      <header className="lg:hidden sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="font-bold text-sm text-white truncate">
                  {snapshot.workspace.name}
                </h1>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 shrink-0">
                  {overallStats.percentage}%
                </span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-2">
                <span>Mã: {snapshot.workspace.code}</span>
                <span>•</span>
                <span className="text-emerald-400">● {onlinePeers.length || 1} online</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <NotificationBell
              workspaceId={snapshot.workspace.id}
              memberId={currentMember.id}
              memberName={currentMember.name}
              onOpenTask={handleOpenTaskFromNotice}
              compact
            />
            <button
              type="button"
              onClick={() => setShowAddStack(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-600 text-xs font-semibold text-white cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Stack
            </button>
            <button
              type="button"
              onClick={handleSwitchMemberOnly}
              title={`Đang dùng tên: ${currentMember.name}`}
              className="w-8 h-8 rounded-xl text-xs font-bold text-white flex items-center justify-center cursor-pointer"
              style={{ backgroundColor: currentMember.color }}
            >
              {currentMember.avatar}
            </button>
          </div>
        </div>

        {/* Thin Mobile Progress Bar */}
        <div className="h-1.5 rounded-full bg-slate-900 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-300"
            style={{ width: `${overallStats.percentage}%` }}
          />
        </div>
      </header>

      {/* =====================================================================
          MAIN WORKSPACE CONTENT
         ===================================================================== */}
      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-5 pb-24 lg:pb-10 max-w-5xl mx-auto w-full">
        {/* Mobile Activity View */}
        {mobileTab === 'activity' ? (
          <div className="lg:hidden">
            <ActivityPanel activities={snapshot.activities} />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Top Action & Filter Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Search Box */}
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm kiếm đầu việc hoặc ghi chú..."
                  className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="hidden lg:flex items-center gap-2">
                <NotificationBell
                  workspaceId={snapshot.workspace.id}
                  memberId={currentMember.id}
                  memberName={currentMember.name}
                  onOpenTask={handleOpenTaskFromNotice}
                />
                <button
                  type="button"
                  onClick={() => {
                    setModalTab('team');
                    setModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-semibold text-slate-200 cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5 text-indigo-400" />
                  Mời nhóm ({snapshot.members.length}/{MAX_TEAM_MEMBERS})
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddStack(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 cursor-pointer"
                >
                  <FolderPlus className="w-4 h-4" />
                  Thêm Stack mới
                </button>
              </div>
            </div>

            {/* Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0 mr-1" />
              {(
                [
                  { id: 'all', label: 'Tất cả' },
                  { id: 'mine', label: `Việc của tôi (${myRemainingCount})` },
                  { id: 'incomplete', label: 'Chưa xong' },
                  { id: 'doing', label: 'Đang làm' },
                  { id: 'blocked', label: 'Đang kẹt' },
                  { id: 'done', label: 'Hoàn thành' },
                ] as { id: TaskFilter; label: string }[]
              ).map((chip) => {
                const active = effectiveFilter === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => {
                      setFilter(chip.id);
                      if (mobileTab === 'mine' && chip.id !== 'mine') {
                        setMobileTab('board');
                      }
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap border transition cursor-pointer ${
                      active
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                        : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>

            {/* Inline Create Stack Card */}
            {showAddStack && (
              <form
                onSubmit={handleCreateStack}
                className="rounded-2xl bg-slate-900 border border-indigo-500/40 p-4 sm:p-5 space-y-3.5 shadow-xl"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-white">Tạo Stack / Giai đoạn mới</h3>
                  <button
                    type="button"
                    onClick={() => setShowAddStack(false)}
                    className="text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={newStackTitle}
                    onChange={(e) => setNewStackTitle(e.target.value)}
                    placeholder="VD: Stack 5 — Phát hành & Marketing"
                    className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-indigo-500"
                    autoFocus
                    required
                  />
                  <input
                    type="text"
                    value={newStackDesc}
                    onChange={(e) => setNewStackDesc(e.target.value)}
                    placeholder="Mô tả ngắn mục tiêu của Stack này (tuỳ chọn)"
                    className="px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-4">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newStackSequential}
                        onChange={(e) => setNewStackSequential(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-950 text-indigo-600"
                      />
                      <span>Khóa thứ tự tuần tự (xong bước trên mới mở bước dưới)</span>
                    </label>

                    <div className="flex items-center gap-1.5">
                      {STACK_PALETTE.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setNewStackColor(c)}
                          className={`w-5 h-5 rounded-full cursor-pointer ${
                            newStackColor === c ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900' : ''
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddStack(false)}
                      className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white cursor-pointer"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white cursor-pointer"
                    >
                      Tạo Stack
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Stacks List */}
            {snapshot.stacks.length === 0 ? (
              <div className="rounded-2xl bg-slate-900/60 border border-dashed border-slate-800 p-10 text-center space-y-3">
                <Layers className="w-8 h-8 text-indigo-400 mx-auto" />
                <div className="text-sm font-semibold text-white">
                  Dự án chưa có Stack công việc nào
                </div>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Chia dự án thành từng Stack để các bạn trong nhóm dễ dàng theo dõi thứ tự ưu tiên
                  và biết bước nào cần hoàn thành trước.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAddStack(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Tạo Stack đầu tiên
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {snapshot.stacks.map((stack, idx) => {
                  const allStackItems = snapshot.items.filter((i) => i.stackId === stack.id);
                  const visibleItems = allStackItems.filter(filterItem);

                  return (
                    <StackGroupCard
                      key={stack.id}
                      stack={stack}
                      stackIndex={idx}
                      totalStacks={snapshot.stacks.length}
                      allStackItems={allStackItems}
                      visibleItems={visibleItems}
                      members={snapshot.members}
                      currentMember={currentMember}
                      onToggleItem={(it) => void syncService.toggleItem(it.id, currentMember)}
                      onSelectItem={(it) => setSelectedItemId(it.id)}
                      onQuickAddItem={async (stackId, title, assigneeId, assigneeIds) => {
                        await syncService.addItem({
                          stackId,
                          title,
                          assigneeId,
                          assigneeIds: assigneeIds ?? (assigneeId ? [assigneeId] : []),
                          actor: currentMember,
                        });
                      }}
                      onUpdateStack={(stackId, patch) =>
                        void syncService.updateStack(stackId, patch)
                      }
                      onMoveStack={(stackId, dir) => void syncService.moveStack(stackId, dir)}
                      onDeleteStack={(stackId) => void syncService.deleteStack(stackId)}
                      onNotifyBlockedSequence={(blockingTitle) =>
                        showToast(`Stack tuần tự: Hãy hoàn thành "${blockingTitle}" trước!`)
                      }
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* =====================================================================
          DESKTOP RIGHT ACTIVITY FEED (>= 1280px)
         ===================================================================== */}
      <aside className="hidden xl:block xl:w-80 shrink-0 border-l border-slate-800/80 bg-slate-950/40 p-5 h-dvh sticky top-0 overflow-y-auto">
        <ActivityPanel activities={snapshot.activities} />
      </aside>

      {/* =====================================================================
          MOBILE BOTTOM NAVIGATION BAR (< 1024px)
         ===================================================================== */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-slate-950/95 backdrop-blur-lg border-t border-slate-800 safe-bottom">
        <div className="grid grid-cols-4 px-2 pt-1.5">
          <button
            type="button"
            onClick={() => {
              setMobileTab('board');
              if (filter === 'mine') setFilter('all');
            }}
            className={`py-1.5 flex flex-col items-center gap-1 text-[11px] font-medium cursor-pointer ${
              mobileTab === 'board' ? 'text-indigo-400' : 'text-slate-400'
            }`}
          >
            <CheckSquare className="w-4.5 h-4.5" />
            <span>Checklist</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileTab('mine')}
            className={`py-1.5 flex flex-col items-center gap-1 text-[11px] font-medium cursor-pointer relative ${
              mobileTab === 'mine' ? 'text-indigo-400' : 'text-slate-400'
            }`}
          >
            <UserCheck className="w-4.5 h-4.5" />
            <span>Của tôi ({myRemainingCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileTab('activity')}
            className={`py-1.5 flex flex-col items-center gap-1 text-[11px] font-medium cursor-pointer ${
              mobileTab === 'activity' ? 'text-indigo-400' : 'text-slate-400'
            }`}
          >
            <Activity className="w-4.5 h-4.5" />
            <span>Nhật ký</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setModalTab('team');
              setModalOpen(true);
            }}
            className="py-1.5 flex flex-col items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-indigo-400 cursor-pointer"
          >
            <Users className="w-4.5 h-4.5" />
            <span>Nhóm &amp; Cloud</span>
          </button>
        </div>
      </nav>

      {/* Slide-over Task Detail Drawer */}
      <TaskDetailDrawer
        item={selectedItem}
        stacks={snapshot.stacks}
        members={snapshot.members}
        currentMember={currentMember}
        onClose={() => setSelectedItemId(null)}
        onSaveItem={(itemId, patch) => syncService.updateItem(itemId, patch, currentMember)}
        onDeleteItem={(itemId) => syncService.deleteItem(itemId, currentMember)}
        onMoveItem={(itemId, dir) => syncService.moveItem(itemId, dir)}
      />

      {/* Team, Invite, Supabase Cloud & App Install Modal */}
      <TeamAndCloudModal
        open={modalOpen}
        initialTab={modalTab}
        onClose={() => setModalOpen(false)}
        snapshot={snapshot}
        currentMember={currentMember}
        onlinePeers={onlinePeers}
        syncMode={syncMode}
        onAddMember={async (name, role) => {
          await syncService.addMember(name, role);
        }}
        onRemoveMember={(memberId) => syncService.removeMember(memberId)}
        onCloudConfigChanged={() => setSyncMode(syncService.getSyncMode())}
        onPushCurrentToSupabase={() => syncService.uploadSnapshotToSupabase(snapshot, true)}
        deferredInstallPrompt={deferredInstallPrompt}
        onTriggerInstallPwa={handleTriggerInstallPwa}
      />
    </div>
  );
}

export default App;
