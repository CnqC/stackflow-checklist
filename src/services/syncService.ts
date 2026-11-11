import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  canAddMember,
  createSeedWorkspaceSnapshot,
  detectPlatform,
  generateId,
  getInitials,
  MEMBER_PALETTE,
  normalizeRoomCode,
  sortByPosition,
  STACK_PALETTE,
} from '../domain/stackDomain';
import {
  MAX_TEAM_MEMBERS,
  type ActivityLog,
  type ChecklistItem,
  type Member,
  type PresencePeer,
  type StackGroup,
  type SubtaskItem,
  type SyncMode,
  type TaskLink,
  type TaskPriority,
  type TaskStatus,
  type Workspace,
  type WorkspaceSnapshot,
} from '../types/models';
import { getSupabaseClient } from './supabaseConfig';

const LOCAL_DB_KEY = 'stackflow_local_workspaces_v1';
const BROADCAST_CHANNEL_NAME = 'stackflow_realtime_bus_v1';

interface LocalDbStore {
  workspaces: Record<string, WorkspaceSnapshot>; // keyed by normalized room code
}

type SnapshotListener = (snapshot: WorkspaceSnapshot) => void;
type PresenceListener = (peers: PresencePeer[]) => void;

// ============================================================================
// Row Mappers for Supabase (snake_case <-> camelCase)
// ============================================================================

interface DbWorkspaceRow {
  id: string;
  code: string;
  name: string;
  description: string;
  pin_code: string;
  max_members: number;
  created_at: string;
  updated_at: string;
}

interface DbMemberRow {
  id: string;
  workspace_id: string;
  name: string;
  role: string;
  color: string;
  avatar: string;
  created_at: string;
}

interface DbStackRow {
  id: string;
  workspace_id: string;
  title: string;
  description: string;
  color: string;
  position: number;
  sequential_lock: boolean;
  collapsed: boolean;
  created_at: string;
  updated_at: string;
}

interface DbItemRow {
  id: string;
  workspace_id: string;
  stack_id: string;
  title: string;
  notes: string;
  status: TaskStatus;
  priority: TaskPriority;
  completed: boolean;
  assignee_id: string | null;
  due_date: string | null;
  position: number;
  subtasks: SubtaskItem[] | null;
  links: TaskLink[] | null;
  completed_by_id: string | null;
  completed_by_name: string | null;
  completed_at: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
}

interface DbActivityRow {
  id: string;
  workspace_id: string;
  actor_id: string | null;
  actor_name: string;
  actor_color: string;
  action_type: ActivityLog['actionType'];
  target_title: string;
  detail: string;
  created_at: string;
}

function mapWorkspaceFromDb(r: DbWorkspaceRow): Workspace {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description ?? '',
    pinCode: r.pin_code,
    maxMembers: r.max_members ?? MAX_TEAM_MEMBERS,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapMemberFromDb(r: DbMemberRow): Member {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    role: r.role ?? 'Member',
    color: r.color ?? MEMBER_PALETTE[0],
    avatar: r.avatar || getInitials(r.name),
    createdAt: r.created_at,
  };
}

function mapStackFromDb(r: DbStackRow): StackGroup {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    title: r.title,
    description: r.description ?? '',
    color: r.color ?? STACK_PALETTE[0],
    position: r.position ?? 0,
    sequentialLock: Boolean(r.sequential_lock),
    collapsed: Boolean(r.collapsed),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapItemFromDb(r: DbItemRow): ChecklistItem {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    stackId: r.stack_id,
    title: r.title,
    notes: r.notes ?? '',
    status: r.status ?? (r.completed ? 'done' : 'todo'),
    priority: r.priority ?? 'medium',
    completed: Boolean(r.completed),
    assigneeId: r.assignee_id,
    dueDate: r.due_date,
    position: r.position ?? 0,
    subtasks: Array.isArray(r.subtasks) ? r.subtasks : [],
    links: Array.isArray(r.links) ? r.links : [],
    completedById: r.completed_by_id,
    completedByName: r.completed_by_name,
    completedAt: r.completed_at,
    updatedByName: r.updated_by_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapActivityFromDb(r: DbActivityRow): ActivityLog {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    actorId: r.actor_id,
    actorName: r.actor_name,
    actorColor: r.actor_color ?? MEMBER_PALETTE[0],
    actionType: r.action_type,
    targetTitle: r.target_title,
    detail: r.detail ?? '',
    createdAt: r.created_at,
  };
}

// ============================================================================
// Local Storage Helpers
// ============================================================================

function readLocalDb(): LocalDbStore {
  if (typeof window === 'undefined') {
    const demo = createSeedWorkspaceSnapshot();
    return { workspaces: { [demo.workspace.code]: demo } };
  }
  try {
    const raw = window.localStorage.getItem(LOCAL_DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LocalDbStore;
      if (parsed && typeof parsed.workspaces === 'object') {
        return parsed;
      }
    }
  } catch {
    // Fallback to seed
  }
  const demo = createSeedWorkspaceSnapshot();
  const initial: LocalDbStore = {
    workspaces: {
      [demo.workspace.code]: demo,
    },
  };
  window.localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(initial));
  return initial;
}

function writeLocalDb(store: LocalDbStore): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(store));
}

// ============================================================================
// Main Dual-Engine Sync Service
// ============================================================================

export class StackFlowSyncService {
  private currentSnapshot: WorkspaceSnapshot | null = null;
  private snapshotListeners = new Set<SnapshotListener>();
  private presenceListeners = new Set<PresenceListener>();

  private realtimeChannel: RealtimeChannel | null = null;
  private broadcastBus: BroadcastChannel | null = null;
  private localPresenceMap = new Map<string, PresencePeer>();
  private localPresenceTimer: ReturnType<typeof setInterval> | null = null;
  private activeMember: Member | null = null;
  private sessionTabId = generateId();

  public getSyncMode(): SyncMode {
    return getSupabaseClient() ? 'supabase' : 'local';
  }

  public getSnapshot(): WorkspaceSnapshot | null {
    return this.currentSnapshot;
  }

  public subscribeSnapshot(listener: SnapshotListener): () => void {
    this.snapshotListeners.add(listener);
    if (this.currentSnapshot) {
      listener(this.currentSnapshot);
    }
    return () => {
      this.snapshotListeners.delete(listener);
    };
  }

  public subscribePresence(listener: PresenceListener): () => void {
    this.presenceListeners.add(listener);
    listener(Array.from(this.localPresenceMap.values()));
    return () => {
      this.presenceListeners.delete(listener);
    };
  }

  private emitSnapshot(snapshot: WorkspaceSnapshot): void {
    const normalized: WorkspaceSnapshot = {
      workspace: snapshot.workspace,
      members: [...snapshot.members].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      stacks: sortByPosition(snapshot.stacks),
      items: sortByPosition(snapshot.items),
      activities: [...snapshot.activities]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 60),
    };
    this.currentSnapshot = normalized;
    for (const listener of this.snapshotListeners) {
      listener(normalized);
    }
  }

  private emitPresence(peers: PresencePeer[]): void {
    const uniqueByMember = new Map<string, PresencePeer>();
    for (const peer of peers) {
      uniqueByMember.set(`${peer.memberId}:${peer.platform}`, peer);
    }
    const result = Array.from(uniqueByMember.values());
    for (const listener of this.presenceListeners) {
      listener(result);
    }
  }

  public listLocalWorkspaces(): Workspace[] {
    const db = readLocalDb();
    return Object.values(db.workspaces).map((s) => s.workspace);
  }

  // --------------------------------------------------------------------------
  // Workspace Join & Create
  // --------------------------------------------------------------------------

  public async joinWorkspaceByPin(roomCodeRaw: string, pinCodeRaw: string): Promise<WorkspaceSnapshot> {
    const code = normalizeRoomCode(roomCodeRaw);
    const pin = pinCodeRaw.trim();
    if (!code) {
      throw new Error('Vui lòng nhập Mã dự án (ví dụ: TEAM-STACK).');
    }
    if (!pin) {
      throw new Error('Vui lòng nhập Mã PIN của dự án.');
    }

    const supabase = getSupabaseClient();
    if (supabase) {
      const { data: wsRow, error } = await supabase
        .from('workspaces')
        .select('*')
        .eq('code', code)
        .maybeSingle();

      if (error) {
        throw new Error(`Lỗi truy vấn Supabase: ${error.message}`);
      }
      if (!wsRow) {
        throw new Error(`Không tìm thấy dự án "${code}" trên Cloud. Bạn có thể bấm sang tab "Tạo dự án mới"!`);
      }
      const ws = mapWorkspaceFromDb(wsRow as DbWorkspaceRow);
      if (ws.pinCode !== pin) {
        throw new Error('Mã PIN không chính xác. Vui lòng kiểm tra lại với nhóm!');
      }

      const snapshot = await this.fetchFullSupabaseSnapshot(ws.id);
      this.emitSnapshot(snapshot);
      this.setupRealtimeSubscriptions(ws.id);
      return snapshot;
    }

    // Local Instant Mode
    const db = readLocalDb();
    const existing = db.workspaces[code];
    if (!existing) {
      throw new Error(`Không tìm thấy dự án "${code}". Hãy thử mã mẫu TEAM-STACK (PIN: 1234) hoặc tạo dự án mới!`);
    }
    if (existing.workspace.pinCode !== pin) {
      throw new Error('Mã PIN không chính xác!');
    }

    this.emitSnapshot(existing);
    this.setupLocalBroadcastSubscriptions(existing.workspace.code);
    return existing;
  }

  public async createWorkspace(input: {
    code: string;
    name: string;
    pinCode: string;
    creatorName: string;
    creatorRole?: string;
    useStarterTemplate?: boolean;
  }): Promise<{ snapshot: WorkspaceSnapshot; creator: Member }> {
    const code = normalizeRoomCode(input.code);
    const name = input.name.trim();
    const pinCode = input.pinCode.trim();
    const creatorName = input.creatorName.trim();
    const creatorRole = input.creatorRole?.trim() || 'Project Lead';

    if (!code || code.length < 2) {
      throw new Error('Mã dự án cần ít nhất 2 ký tự (VD: APP-2026).');
    }
    if (!name) {
      throw new Error('Vui lòng nhập tên dự án.');
    }
    if (pinCode.length < 4 || pinCode.length > 12) {
      throw new Error('Mã PIN cần từ 4 đến 12 ký tự.');
    }
    if (!creatorName) {
      throw new Error('Vui lòng nhập tên của bạn để khởi tạo danh sách thành viên.');
    }

    const now = new Date().toISOString();
    const wsId = generateId();
    const creatorId = generateId();

    const creator: Member = {
      id: creatorId,
      workspaceId: wsId,
      name: creatorName,
      role: creatorRole,
      color: MEMBER_PALETTE[0],
      avatar: getInitials(creatorName),
      createdAt: now,
    };

    const stacks: StackGroup[] =
      input.useStarterTemplate !== false
        ? [
            {
              id: generateId(),
              workspaceId: wsId,
              title: 'Stack 1 — Chuẩn bị & Thống nhất Mục tiêu',
              description: 'Các đầu việc nền tảng cần chốt đầu tiên',
              color: STACK_PALETTE[0],
              position: 0,
              sequentialLock: true,
              collapsed: false,
              createdAt: now,
              updatedAt: now,
            },
            {
              id: generateId(),
              workspaceId: wsId,
              title: 'Stack 2 — Triển khai Chính',
              description: 'Các hạng mục thực thi song song của các thành viên',
              color: STACK_PALETTE[1],
              position: 1,
              sequentialLock: false,
              collapsed: false,
              createdAt: now,
              updatedAt: now,
            },
            {
              id: generateId(),
              workspaceId: wsId,
              title: 'Stack 3 — Kiểm tra & Hoàn tất',
              description: 'Rà soát chất lượng trước khi bàn giao',
              color: STACK_PALETTE[2],
              position: 2,
              sequentialLock: true,
              collapsed: false,
              createdAt: now,
              updatedAt: now,
            },
          ]
        : [];

    const items: ChecklistItem[] =
      stacks.length > 0
        ? [
            {
              id: generateId(),
              workspaceId: wsId,
              stackId: stacks[0].id,
              title: 'Mời các bạn trong nhóm (<10 người) vào bằng Mã dự án & PIN',
              notes: 'Gửi link kèm mã PIN để mọi người chọn tên và nhận việc.',
              status: 'doing',
              priority: 'high',
              completed: false,
              assigneeId: creator.id,
              dueDate: null,
              position: 0,
              subtasks: [],
              links: [],
              completedById: null,
              completedByName: null,
              completedAt: null,
              updatedByName: creator.name,
              createdAt: now,
              updatedAt: now,
            },
          ]
        : [];

    const initialSnapshot: WorkspaceSnapshot = {
      workspace: {
        id: wsId,
        code,
        name,
        description: 'Checklist dự án nhóm theo Stack',
        pinCode,
        maxMembers: MAX_TEAM_MEMBERS,
        createdAt: now,
        updatedAt: now,
      },
      members: [creator],
      stacks,
      items,
      activities: [
        {
          id: generateId(),
          workspaceId: wsId,
          actorId: creator.id,
          actorName: creator.name,
          actorColor: creator.color,
          actionType: 'join_member',
          targetTitle: name,
          detail: 'Khởi tạo không gian dự án mới',
          createdAt: now,
        },
      ],
    };

    const supabase = getSupabaseClient();
    if (supabase) {
      await this.uploadSnapshotToSupabase(initialSnapshot, false);
      const fresh = await this.fetchFullSupabaseSnapshot(wsId);
      this.emitSnapshot(fresh);
      this.setupRealtimeSubscriptions(wsId);
      return { snapshot: fresh, creator };
    }

    const db = readLocalDb();
    if (db.workspaces[code]) {
      throw new Error(`Mã dự án "${code}" đã tồn tại. Vui lòng chọn mã khác hoặc đăng nhập bằng mã PIN!`);
    }
    db.workspaces[code] = initialSnapshot;
    writeLocalDb(db);
    this.emitSnapshot(initialSnapshot);
    this.setupLocalBroadcastSubscriptions(code);
    return { snapshot: initialSnapshot, creator };
  }

  public async uploadSnapshotToSupabase(snapshot: WorkspaceSnapshot, overwriteExisting = true): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Chưa cấu hình URL và Anon Key của Supabase.');
    }

    const ws = snapshot.workspace;
    if (!overwriteExisting) {
      const { data: existing } = await supabase
        .from('workspaces')
        .select('id')
        .eq('code', ws.code)
        .maybeSingle();
      if (existing) {
        throw new Error(`Mã dự án "${ws.code}" đã tồn tại trên Supabase Cloud.`);
      }
    }

    const { error: wsErr } = await supabase.from('workspaces').upsert(
      {
        id: ws.id,
        code: ws.code,
        name: ws.name,
        description: ws.description,
        pin_code: ws.pinCode,
        max_members: ws.maxMembers,
        created_at: ws.createdAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
    if (wsErr) throw new Error(`Không thể lưu Workspace lên Supabase: ${wsErr.message}`);

    if (snapshot.members.length > 0) {
      const { error: memErr } = await supabase.from('members').upsert(
        snapshot.members.slice(0, MAX_TEAM_MEMBERS).map((m) => ({
          id: m.id,
          workspace_id: ws.id,
          name: m.name,
          role: m.role,
          color: m.color,
          avatar: m.avatar,
          created_at: m.createdAt,
        })),
        { onConflict: 'id' },
      );
      if (memErr) throw new Error(`Không thể đồng bộ Thành viên: ${memErr.message}`);
    }

    if (snapshot.stacks.length > 0) {
      const { error: stErr } = await supabase.from('stacks').upsert(
        snapshot.stacks.map((s) => ({
          id: s.id,
          workspace_id: ws.id,
          title: s.title,
          description: s.description,
          color: s.color,
          position: s.position,
          sequential_lock: s.sequentialLock,
          collapsed: s.collapsed,
          created_at: s.createdAt,
          updated_at: s.updatedAt,
        })),
        { onConflict: 'id' },
      );
      if (stErr) throw new Error(`Không thể đồng bộ Stacks: ${stErr.message}`);
    }

    if (snapshot.items.length > 0) {
      const { error: itemErr } = await supabase.from('checklist_items').upsert(
        snapshot.items.map((item) => ({
          id: item.id,
          workspace_id: ws.id,
          stack_id: item.stackId,
          title: item.title,
          notes: item.notes,
          status: item.status,
          priority: item.priority,
          completed: item.completed,
          assignee_id: item.assigneeId,
          due_date: item.dueDate,
          position: item.position,
          subtasks: item.subtasks,
          links: item.links,
          completed_by_id: item.completedById,
          completed_by_name: item.completedByName,
          completed_at: item.completedAt,
          updated_by_name: item.updatedByName,
          created_at: item.createdAt,
          updated_at: item.updatedAt,
        })),
        { onConflict: 'id' },
      );
      if (itemErr) throw new Error(`Không thể đồng bộ Checklist Items: ${itemErr.message}`);
    }
  }

  private async fetchFullSupabaseSnapshot(workspaceId: string): Promise<WorkspaceSnapshot> {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new Error('Supabase client chưa sẵn sàng.');
    }

    const [wsRes, memRes, stackRes, itemRes, actRes] = await Promise.all([
      supabase.from('workspaces').select('*').eq('id', workspaceId).single(),
      supabase.from('members').select('*').eq('workspace_id', workspaceId).order('created_at'),
      supabase.from('stacks').select('*').eq('workspace_id', workspaceId).order('position'),
      supabase.from('checklist_items').select('*').eq('workspace_id', workspaceId).order('position'),
      supabase
        .from('activity_logs')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    if (wsRes.error || !wsRes.data) {
      throw new Error(wsRes.error?.message ?? 'Không tải được dữ liệu dự án.');
    }

    return {
      workspace: mapWorkspaceFromDb(wsRes.data as DbWorkspaceRow),
      members: ((memRes.data ?? []) as DbMemberRow[]).map(mapMemberFromDb),
      stacks: ((stackRes.data ?? []) as DbStackRow[]).map(mapStackFromDb),
      items: ((itemRes.data ?? []) as DbItemRow[]).map(mapItemFromDb),
      activities: ((actRes.data ?? []) as DbActivityRow[]).map(mapActivityFromDb),
    };
  }

  // --------------------------------------------------------------------------
  // Presence & Realtime Subscriptions
  // --------------------------------------------------------------------------

  public setActiveMember(member: Member | null): void {
    this.activeMember = member;
    if (!this.currentSnapshot) return;

    if (this.realtimeChannel && member) {
      void this.realtimeChannel.track({
        memberId: member.id,
        name: member.name,
        color: member.color,
        role: member.role,
        platform: detectPlatform(),
        lastSeenAt: new Date().toISOString(),
      } satisfies PresencePeer);
    }

    this.broadcastLocalPresence();
  }

  private setupRealtimeSubscriptions(workspaceId: string): void {
    this.teardownConnections();
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const refresh = async () => {
      try {
        const latest = await this.fetchFullSupabaseSnapshot(workspaceId);
        this.emitSnapshot(latest);
      } catch {
        // Ignore transient network hiccup
      }
    };

    const channel = supabase
      .channel(`workspace:${workspaceId}`, {
        config: {
          presence: { key: this.sessionTabId },
        },
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workspaces', filter: `id=eq.${workspaceId}` },
        () => void refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'members', filter: `workspace_id=eq.${workspaceId}` },
        () => void refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stacks', filter: `workspace_id=eq.${workspaceId}` },
        () => void refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'checklist_items', filter: `workspace_id=eq.${workspaceId}` },
        () => void refresh(),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'activity_logs', filter: `workspace_id=eq.${workspaceId}` },
        () => void refresh(),
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<PresencePeer>();
        const peers: PresencePeer[] = [];
        for (const entries of Object.values(state)) {
          for (const entry of entries) {
            if (entry.memberId) {
              peers.push(entry);
            }
          }
        }
        this.emitPresence(peers);
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && this.activeMember) {
          void channel.track({
            memberId: this.activeMember.id,
            name: this.activeMember.name,
            color: this.activeMember.color,
            role: this.activeMember.role,
            platform: detectPlatform(),
            lastSeenAt: new Date().toISOString(),
          } satisfies PresencePeer);
        }
      });

    this.realtimeChannel = channel;
  }

  private setupLocalBroadcastSubscriptions(workspaceCode: string): void {
    this.teardownConnections();
    if (typeof BroadcastChannel === 'undefined') return;

    const bus = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    bus.onmessage = (ev: MessageEvent) => {
      const msg = ev.data as
        | { type: 'SNAPSHOT_UPDATED'; workspaceCode: string }
        | { type: 'PRESENCE_PING'; workspaceCode: string; tabId: string; peer: PresencePeer };

      if (!msg || msg.workspaceCode !== workspaceCode) return;

      if (msg.type === 'SNAPSHOT_UPDATED') {
        const db = readLocalDb();
        const snap = db.workspaces[workspaceCode];
        if (snap) {
          this.emitSnapshot(snap);
        }
      } else if (msg.type === 'PRESENCE_PING') {
        this.localPresenceMap.set(msg.tabId, msg.peer);
        this.pruneAndEmitLocalPresence();
      }
    };
    this.broadcastBus = bus;

    // Storage event listener as secondary cross-window fallback
    if (typeof window !== 'undefined') {
      window.onstorage = (e: StorageEvent) => {
        if (e.key === LOCAL_DB_KEY && this.currentSnapshot) {
          const db = readLocalDb();
          const snap = db.workspaces[this.currentSnapshot.workspace.code];
          if (snap) this.emitSnapshot(snap);
        }
      };
    }

    this.broadcastLocalPresence();
    this.localPresenceTimer = setInterval(() => {
      this.broadcastLocalPresence();
      this.pruneAndEmitLocalPresence();
    }, 4000);
  }

  private broadcastLocalPresence(): void {
    if (!this.currentSnapshot || !this.activeMember) return;
    const peer: PresencePeer = {
      memberId: this.activeMember.id,
      name: this.activeMember.name,
      color: this.activeMember.color,
      role: this.activeMember.role,
      platform: detectPlatform(),
      lastSeenAt: new Date().toISOString(),
    };
    this.localPresenceMap.set(this.sessionTabId, peer);
    this.pruneAndEmitLocalPresence();

    this.broadcastBus?.postMessage({
      type: 'PRESENCE_PING',
      workspaceCode: this.currentSnapshot.workspace.code,
      tabId: this.sessionTabId,
      peer,
    });
  }

  private pruneAndEmitLocalPresence(): void {
    const cutoff = Date.now() - 12000;
    for (const [tabId, peer] of this.localPresenceMap.entries()) {
      if (new Date(peer.lastSeenAt).getTime() < cutoff) {
        this.localPresenceMap.delete(tabId);
      }
    }
    this.emitPresence(Array.from(this.localPresenceMap.values()));
  }

  private commitLocalMutation(mutator: (snap: WorkspaceSnapshot) => WorkspaceSnapshot): WorkspaceSnapshot {
    if (!this.currentSnapshot) {
      throw new Error('Chưa mở dự án nào.');
    }
    const code = this.currentSnapshot.workspace.code;
    const db = readLocalDb();
    const base = db.workspaces[code] ?? this.currentSnapshot;
    const next = mutator(structuredClone(base));
    db.workspaces[code] = next;
    writeLocalDb(db);
    this.emitSnapshot(next);
    this.broadcastBus?.postMessage({
      type: 'SNAPSHOT_UPDATED',
      workspaceCode: code,
    });
    return next;
  }

  public teardownConnections(): void {
    if (this.realtimeChannel) {
      const supabase = getSupabaseClient();
      if (supabase) {
        void supabase.removeChannel(this.realtimeChannel);
      }
      this.realtimeChannel = null;
    }
    if (this.broadcastBus) {
      this.broadcastBus.close();
      this.broadcastBus = null;
    }
    if (this.localPresenceTimer) {
      clearInterval(this.localPresenceTimer);
      this.localPresenceTimer = null;
    }
    this.localPresenceMap.clear();
  }

  // --------------------------------------------------------------------------
  // Team Member Operations (Strictly <= 10 Members)
  // --------------------------------------------------------------------------

  public async addMember(nameRaw: string, roleRaw = 'Member'): Promise<Member> {
    if (!this.currentSnapshot) throw new Error('Chưa mở dự án.');
    const name = nameRaw.trim();
    const role = roleRaw.trim() || 'Member';
    if (!name) throw new Error('Vui lòng nhập tên thành viên.');

    const { workspace, members } = this.currentSnapshot;
    if (!canAddMember(members, workspace.maxMembers)) {
      throw new Error(`Dự án giới hạn tối đa ${MAX_TEAM_MEMBERS} thành viên để tối ưu làm việc nhóm nhỏ.`);
    }
    if (members.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Thành viên "${name}" đã có trong danh sách dự án!`);
    }

    const newMember: Member = {
      id: generateId(),
      workspaceId: workspace.id,
      name,
      role,
      color: MEMBER_PALETTE[members.length % MEMBER_PALETTE.length],
      avatar: getInitials(name),
      createdAt: new Date().toISOString(),
    };

    const supabase = getSupabaseClient();
    if (supabase) {
      const { error } = await supabase.from('members').insert({
        id: newMember.id,
        workspace_id: workspace.id,
        name: newMember.name,
        role: newMember.role,
        color: newMember.color,
        avatar: newMember.avatar,
        created_at: newMember.createdAt,
      });
      if (error) throw new Error(error.message);
      await this.logActivity(newMember, 'join_member', newMember.name, `Tham gia với vai trò ${newMember.role}`);
      const snap = await this.fetchFullSupabaseSnapshot(workspace.id);
      this.emitSnapshot(snap);
      return newMember;
    }

    this.commitLocalMutation((snap) => {
      snap.members.push(newMember);
      snap.activities.unshift({
        id: generateId(),
        workspaceId: workspace.id,
        actorId: newMember.id,
        actorName: newMember.name,
        actorColor: newMember.color,
        actionType: 'join_member',
        targetTitle: newMember.name,
        detail: `Tham gia với vai trò ${newMember.role}`,
        createdAt: newMember.createdAt,
      });
      return snap;
    });
    return newMember;
  }

  public async removeMember(memberId: string): Promise<void> {
    if (!this.currentSnapshot) return;
    if (this.currentSnapshot.members.length <= 1) {
      throw new Error('Dự án cần giữ lại ít nhất 1 thành viên.');
    }

    const supabase = getSupabaseClient();
    if (supabase) {
      const { error } = await supabase.from('members').delete().eq('id', memberId);
      if (error) throw new Error(error.message);
      const snap = await this.fetchFullSupabaseSnapshot(this.currentSnapshot.workspace.id);
      this.emitSnapshot(snap);
      return;
    }

    this.commitLocalMutation((snap) => {
      snap.members = snap.members.filter((m) => m.id !== memberId);
      snap.items = snap.items.map((it) =>
        it.assigneeId === memberId ? { ...it, assigneeId: null } : it,
      );
      return snap;
    });
  }

  // --------------------------------------------------------------------------
  // Stack Group Operations
  // --------------------------------------------------------------------------

  public async addStack(input: {
    title: string;
    description?: string;
    sequentialLock?: boolean;
    color?: string;
    actor: Member;
  }): Promise<StackGroup> {
    if (!this.currentSnapshot) throw new Error('Chưa mở dự án.');
    const title = input.title.trim();
    if (!title) throw new Error('Vui lòng nhập tên Stack / Giai đoạn.');

    const now = new Date().toISOString();
    const { workspace, stacks } = this.currentSnapshot;
    const nextPos = stacks.length > 0 ? Math.max(...stacks.map((s) => s.position)) + 1 : 0;

    const stack: StackGroup = {
      id: generateId(),
      workspaceId: workspace.id,
      title,
      description: input.description?.trim() ?? '',
      color: input.color ?? STACK_PALETTE[stacks.length % STACK_PALETTE.length],
      position: nextPos,
      sequentialLock: Boolean(input.sequentialLock),
      collapsed: false,
      createdAt: now,
      updatedAt: now,
    };

    const supabase = getSupabaseClient();
    if (supabase) {
      const { error } = await supabase.from('stacks').insert({
        id: stack.id,
        workspace_id: stack.workspaceId,
        title: stack.title,
        description: stack.description,
        color: stack.color,
        position: stack.position,
        sequential_lock: stack.sequentialLock,
        collapsed: stack.collapsed,
        created_at: stack.createdAt,
        updated_at: stack.updatedAt,
      });
      if (error) throw new Error(error.message);
      await this.logActivity(input.actor, 'create_stack', stack.title, 'Tạo Stack mới');
      const snap = await this.fetchFullSupabaseSnapshot(workspace.id);
      this.emitSnapshot(snap);
      return stack;
    }

    this.commitLocalMutation((snap) => {
      snap.stacks.push(stack);
      snap.activities.unshift({
        id: generateId(),
        workspaceId: workspace.id,
        actorId: input.actor.id,
        actorName: input.actor.name,
        actorColor: input.actor.color,
        actionType: 'create_stack',
        targetTitle: stack.title,
        detail: 'Tạo Stack mới',
        createdAt: now,
      });
      return snap;
    });
    return stack;
  }

  public async updateStack(
    stackId: string,
    patch: Partial<Pick<StackGroup, 'title' | 'description' | 'sequentialLock' | 'collapsed' | 'color'>>,
  ): Promise<void> {
    if (!this.currentSnapshot) return;
    const now = new Date().toISOString();

    const supabase = getSupabaseClient();
    if (supabase) {
      const dbPatch: Record<string, unknown> = { updated_at: now };
      if (patch.title !== undefined) dbPatch.title = patch.title.trim();
      if (patch.description !== undefined) dbPatch.description = patch.description;
      if (patch.sequentialLock !== undefined) dbPatch.sequential_lock = patch.sequentialLock;
      if (patch.collapsed !== undefined) dbPatch.collapsed = patch.collapsed;
      if (patch.color !== undefined) dbPatch.color = patch.color;

      const { error } = await supabase.from('stacks').update(dbPatch).eq('id', stackId);
      if (error) throw new Error(error.message);
      const snap = await this.fetchFullSupabaseSnapshot(this.currentSnapshot.workspace.id);
      this.emitSnapshot(snap);
      return;
    }

    this.commitLocalMutation((snap) => {
      snap.stacks = snap.stacks.map((s) =>
        s.id === stackId ? { ...s, ...patch, updatedAt: now } : s,
      );
      return snap;
    });
  }

  public async deleteStack(stackId: string): Promise<void> {
    if (!this.currentSnapshot) return;
    const supabase = getSupabaseClient();
    if (supabase) {
      const { error } = await supabase.from('stacks').delete().eq('id', stackId);
      if (error) throw new Error(error.message);
      const snap = await this.fetchFullSupabaseSnapshot(this.currentSnapshot.workspace.id);
      this.emitSnapshot(snap);
      return;
    }

    this.commitLocalMutation((snap) => {
      snap.stacks = snap.stacks.filter((s) => s.id !== stackId);
      snap.items = snap.items.filter((it) => it.stackId !== stackId);
      return snap;
    });
  }

  public async moveStack(stackId: string, direction: 'up' | 'down'): Promise<void> {
    if (!this.currentSnapshot) return;
    const ordered = sortByPosition(this.currentSnapshot.stacks);
    const idx = ordered.findIndex((s) => s.id === stackId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= ordered.length) return;

    const reordered = [...ordered];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];

    const supabase = getSupabaseClient();
    if (supabase) {
      await Promise.all(
        reordered.map((s, position) =>
          supabase.from('stacks').update({ position }).eq('id', s.id),
        ),
      );
      const snap = await this.fetchFullSupabaseSnapshot(this.currentSnapshot.workspace.id);
      this.emitSnapshot(snap);
      return;
    }

    this.commitLocalMutation((snap) => {
      const posMap = new Map(reordered.map((s, i) => [s.id, i]));
      snap.stacks = snap.stacks.map((s) => ({
        ...s,
        position: posMap.get(s.id) ?? s.position,
      }));
      return snap;
    });
  }

  // --------------------------------------------------------------------------
  // Checklist Item Operations
  // --------------------------------------------------------------------------

  public async addItem(input: {
    stackId: string;
    title: string;
    assigneeId?: string | null;
    priority?: TaskPriority;
    dueDate?: string | null;
    actor: Member;
  }): Promise<ChecklistItem> {
    if (!this.currentSnapshot) throw new Error('Chưa mở dự án.');
    const title = input.title.trim();
    if (!title) throw new Error('Vui lòng nhập nội dung đầu việc.');

    const now = new Date().toISOString();
    const { workspace, items, stacks } = this.currentSnapshot;
    const stackItems = items.filter((it) => it.stackId === input.stackId);
    const nextPos = stackItems.length > 0 ? Math.max(...stackItems.map((i) => i.position)) + 1 : 0;
    const stackName = stacks.find((s) => s.id === input.stackId)?.title ?? 'Stack';

    const newItem: ChecklistItem = {
      id: generateId(),
      workspaceId: workspace.id,
      stackId: input.stackId,
      title,
      notes: '',
      status: 'todo',
      priority: input.priority ?? 'medium',
      completed: false,
      assigneeId: input.assigneeId ?? null,
      dueDate: input.dueDate ?? null,
      position: nextPos,
      subtasks: [],
      links: [],
      completedById: null,
      completedByName: null,
      completedAt: null,
      updatedByName: input.actor.name,
      createdAt: now,
      updatedAt: now,
    };

    const supabase = getSupabaseClient();
    if (supabase) {
      const { error } = await supabase.from('checklist_items').insert({
        id: newItem.id,
        workspace_id: newItem.workspaceId,
        stack_id: newItem.stackId,
        title: newItem.title,
        notes: newItem.notes,
        status: newItem.status,
        priority: newItem.priority,
        completed: newItem.completed,
        assignee_id: newItem.assigneeId,
        due_date: newItem.dueDate,
        position: newItem.position,
        subtasks: newItem.subtasks,
        links: newItem.links,
        updated_by_name: newItem.updatedByName,
        created_at: newItem.createdAt,
        updated_at: newItem.updatedAt,
      });
      if (error) throw new Error(error.message);
      await this.logActivity(input.actor, 'create_task', newItem.title, `Thêm vào ${stackName}`);
      const snap = await this.fetchFullSupabaseSnapshot(workspace.id);
      this.emitSnapshot(snap);
      return newItem;
    }

    this.commitLocalMutation((snap) => {
      snap.items.push(newItem);
      snap.activities.unshift({
        id: generateId(),
        workspaceId: workspace.id,
        actorId: input.actor.id,
        actorName: input.actor.name,
        actorColor: input.actor.color,
        actionType: 'create_task',
        targetTitle: newItem.title,
        detail: `Thêm vào ${stackName}`,
        createdAt: now,
      });
      return snap;
    });

    return newItem;
  }

  public async toggleItem(itemId: string, actor: Member): Promise<void> {
    if (!this.currentSnapshot) return;
    const item = this.currentSnapshot.items.find((i) => i.id === itemId);
    if (!item) return;

    const nextCompleted = !item.completed;
    const nextStatus: TaskStatus = nextCompleted ? 'done' : 'todo';
    const now = new Date().toISOString();
    const stackName = this.currentSnapshot.stacks.find((s) => s.id === item.stackId)?.title ?? 'Stack';

    const patch: Partial<ChecklistItem> = {
      completed: nextCompleted,
      status: nextStatus,
      completedById: nextCompleted ? actor.id : null,
      completedByName: nextCompleted ? actor.name : null,
      completedAt: nextCompleted ? now : null,
      updatedByName: actor.name,
      updatedAt: now,
    };

    // Optimistic UI update first for 0ms perceived latency
    this.emitSnapshot({
      ...this.currentSnapshot,
      items: this.currentSnapshot.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
    });

    const supabase = getSupabaseClient();
    if (supabase) {
      const { error } = await supabase
        .from('checklist_items')
        .update({
          completed: patch.completed,
          status: patch.status,
          completed_by_id: patch.completedById,
          completed_by_name: patch.completedByName,
          completed_at: patch.completedAt,
          updated_by_name: patch.updatedByName,
          updated_at: patch.updatedAt,
        })
        .eq('id', itemId);
      if (error) throw new Error(error.message);
      await this.logActivity(
        actor,
        nextCompleted ? 'check' : 'uncheck',
        item.title,
        `${nextCompleted ? 'Hoàn thành' : 'Mở lại'} trong ${stackName}`,
      );
      const snap = await this.fetchFullSupabaseSnapshot(this.currentSnapshot.workspace.id);
      this.emitSnapshot(snap);
      return;
    }

    this.commitLocalMutation((snap) => {
      snap.items = snap.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i));
      snap.activities.unshift({
        id: generateId(),
        workspaceId: snap.workspace.id,
        actorId: actor.id,
        actorName: actor.name,
        actorColor: actor.color,
        actionType: nextCompleted ? 'check' : 'uncheck',
        targetTitle: item.title,
        detail: `${nextCompleted ? 'Hoàn thành' : 'Mở lại'} trong ${stackName}`,
        createdAt: now,
      });
      return snap;
    });
  }

  public async updateItem(
    itemId: string,
    patch: Partial<
      Pick<
        ChecklistItem,
        'title' | 'notes' | 'status' | 'priority' | 'assigneeId' | 'dueDate' | 'subtasks' | 'links' | 'stackId'
      >
    >,
    actor: Member,
  ): Promise<void> {
    if (!this.currentSnapshot) return;
    const current = this.currentSnapshot.items.find((i) => i.id === itemId);
    if (!current) return;

    const now = new Date().toISOString();
    const resolvedCompleted =
      patch.status !== undefined ? patch.status === 'done' : current.completed;
    const resolvedStatus: TaskStatus =
      patch.status !== undefined ? patch.status : resolvedCompleted ? 'done' : current.status;

    const fullPatch: Partial<ChecklistItem> = {
      ...patch,
      status: resolvedStatus,
      completed: resolvedCompleted,
      completedById: resolvedCompleted ? current.completedById ?? actor.id : null,
      completedByName: resolvedCompleted ? current.completedByName ?? actor.name : null,
      completedAt: resolvedCompleted ? current.completedAt ?? now : null,
      updatedByName: actor.name,
      updatedAt: now,
    };

    const supabase = getSupabaseClient();
    if (supabase) {
      const dbPatch: Record<string, unknown> = {
        status: fullPatch.status,
        completed: fullPatch.completed,
        completed_by_id: fullPatch.completedById,
        completed_by_name: fullPatch.completedByName,
        completed_at: fullPatch.completedAt,
        updated_by_name: fullPatch.updatedByName,
        updated_at: fullPatch.updatedAt,
      };
      if (patch.title !== undefined) dbPatch.title = patch.title.trim();
      if (patch.notes !== undefined) dbPatch.notes = patch.notes;
      if (patch.priority !== undefined) dbPatch.priority = patch.priority;
      if (patch.assigneeId !== undefined) dbPatch.assignee_id = patch.assigneeId;
      if (patch.dueDate !== undefined) dbPatch.due_date = patch.dueDate;
      if (patch.subtasks !== undefined) dbPatch.subtasks = patch.subtasks;
      if (patch.links !== undefined) dbPatch.links = patch.links;
      if (patch.stackId !== undefined) dbPatch.stack_id = patch.stackId;

      const { error } = await supabase.from('checklist_items').update(dbPatch).eq('id', itemId);
      if (error) throw new Error(error.message);

      if (patch.status && patch.status !== current.status) {
        await this.logActivity(
          actor,
          'status_change',
          fullPatch.title ?? current.title,
          `Chuyển trạng thái sang ${statusLabelVi(patch.status)}`,
        );
      }
      const snap = await this.fetchFullSupabaseSnapshot(this.currentSnapshot.workspace.id);
      this.emitSnapshot(snap);
      return;
    }

    this.commitLocalMutation((snap) => {
      snap.items = snap.items.map((i) => (i.id === itemId ? { ...i, ...fullPatch } : i));
      if (patch.status && patch.status !== current.status) {
        snap.activities.unshift({
          id: generateId(),
          workspaceId: snap.workspace.id,
          actorId: actor.id,
          actorName: actor.name,
          actorColor: actor.color,
          actionType: 'status_change',
          targetTitle: fullPatch.title ?? current.title,
          detail: `Chuyển trạng thái sang ${statusLabelVi(patch.status)}`,
          createdAt: now,
        });
      }
      return snap;
    });
  }

  public async deleteItem(itemId: string, actor: Member): Promise<void> {
    if (!this.currentSnapshot) return;
    const target = this.currentSnapshot.items.find((i) => i.id === itemId);
    if (!target) return;
    const now = new Date().toISOString();

    const supabase = getSupabaseClient();
    if (supabase) {
      const { error } = await supabase.from('checklist_items').delete().eq('id', itemId);
      if (error) throw new Error(error.message);
      await this.logActivity(actor, 'delete_task', target.title, 'Đã xóa đầu việc');
      const snap = await this.fetchFullSupabaseSnapshot(this.currentSnapshot.workspace.id);
      this.emitSnapshot(snap);
      return;
    }

    this.commitLocalMutation((snap) => {
      snap.items = snap.items.filter((i) => i.id !== itemId);
      snap.activities.unshift({
        id: generateId(),
        workspaceId: snap.workspace.id,
        actorId: actor.id,
        actorName: actor.name,
        actorColor: actor.color,
        actionType: 'delete_task',
        targetTitle: target.title,
        detail: 'Đã xóa đầu việc',
        createdAt: now,
      });
      return snap;
    });
  }

  public async moveItem(itemId: string, direction: 'up' | 'down'): Promise<void> {
    if (!this.currentSnapshot) return;
    const target = this.currentSnapshot.items.find((i) => i.id === itemId);
    if (!target) return;

    const stackItems = sortByPosition(
      this.currentSnapshot.items.filter((i) => i.stackId === target.stackId),
    );
    const idx = stackItems.findIndex((i) => i.id === itemId);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= stackItems.length) return;

    const reordered = [...stackItems];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];

    const supabase = getSupabaseClient();
    if (supabase) {
      await Promise.all(
        reordered.map((it, position) =>
          supabase.from('checklist_items').update({ position }).eq('id', it.id),
        ),
      );
      const snap = await this.fetchFullSupabaseSnapshot(this.currentSnapshot.workspace.id);
      this.emitSnapshot(snap);
      return;
    }

    this.commitLocalMutation((snap) => {
      const posMap = new Map(reordered.map((it, i) => [it.id, i]));
      snap.items = snap.items.map((it) =>
        posMap.has(it.id) ? { ...it, position: posMap.get(it.id)! } : it,
      );
      return snap;
    });
  }

  private async logActivity(
    actor: Member,
    actionType: ActivityLog['actionType'],
    targetTitle: string,
    detail: string,
  ): Promise<void> {
    const supabase = getSupabaseClient();
    if (!supabase || !this.currentSnapshot) return;
    await supabase.from('activity_logs').insert({
      id: generateId(),
      workspace_id: this.currentSnapshot.workspace.id,
      actor_id: actor.id,
      actor_name: actor.name,
      actor_color: actor.color,
      action_type: actionType,
      target_title: targetTitle,
      detail,
      created_at: new Date().toISOString(),
    });
  }
}

export function statusLabelVi(status: TaskStatus): string {
  switch (status) {
    case 'todo':
      return 'Cần làm';
    case 'doing':
      return 'Đang làm';
    case 'blocked':
      return 'Đang kẹt';
    case 'done':
      return 'Hoàn thành';
  }
}

export function priorityLabelVi(priority: TaskPriority): string {
  switch (priority) {
    case 'high':
      return 'Ưu tiên cao';
    case 'medium':
      return 'Trung bình';
    case 'low':
      return 'Thấp';
  }
}

export const syncService = new StackFlowSyncService();
