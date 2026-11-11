import {
  CURRENT_SCHEMA_VERSION,
  MAX_TEAM_MEMBERS,
  type ChecklistItem,
  type Member,
  type StackGroup,
  type StackProgressStats,
  type WorkspaceSnapshot,
} from '../../types/models';
import { sanitizeWorkspaceSnapshot } from './dataValidator';

export const MEMBER_PALETTE = [
  '#6366f1', // Indigo
  '#10b981', // Emerald
  '#0ea5e9', // Sky
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Violet
  '#14b8a6', // Teal
  '#f97316', // Orange
  '#ef4444', // Red
  '#84cc16', // Lime
];

export const STACK_PALETTE = [
  '#6366f1',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#8b5cf6',
];

export interface RuntimePlatformHint {
  isNativePlatform?: boolean;
  isStandaloneDisplay?: boolean;
}

export function generateId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (typeof g.crypto?.randomUUID === 'function') {
    return g.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function normalizeRoomCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9-_]/g, '');
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  const first = parts[0][0] ?? '';
  const last = parts[parts.length - 1][0] ?? '';
  return `${first}${last}`.toUpperCase();
}

export function calculateProgress(items: ChecklistItem[]): StackProgressStats {
  const total = items.length;
  if (total === 0) {
    return { total: 0, completed: 0, doing: 0, blocked: 0, percentage: 0 };
  }
  let completed = 0;
  let doing = 0;
  let blocked = 0;
  for (const item of items) {
    if (item.completed || item.status === 'done') {
      completed += 1;
    } else if (item.status === 'doing') {
      doing += 1;
    } else if (item.status === 'blocked') {
      blocked += 1;
    }
  }
  const percentage = Math.round((completed / total) * 100);
  return { total, completed, doing, blocked, percentage };
}

export function sortByPosition<T extends { position: number; createdAt: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function isItemLockedBySequence(
  stack: StackGroup,
  targetItem: ChecklistItem,
  stackItems: ChecklistItem[],
): { locked: boolean; blockingItemTitle: string | null } {
  if (!stack.sequentialLock) {
    return { locked: false, blockingItemTitle: null };
  }
  const ordered = sortByPosition(stackItems);
  for (const candidate of ordered) {
    if (candidate.id === targetItem.id) {
      break;
    }
    if (!candidate.completed) {
      return { locked: true, blockingItemTitle: candidate.title };
    }
  }
  return { locked: false, blockingItemTitle: null };
}

export function canAddMember(members: Member[], maxMembers: number = MAX_TEAM_MEMBERS): boolean {
  const effectiveCap = Math.min(maxMembers, MAX_TEAM_MEMBERS);
  return members.length < effectiveCap;
}

export function detectPlatform(hint?: RuntimePlatformHint): 'Web' | 'App' {
  if (hint) {
    return hint.isNativePlatform || hint.isStandaloneDisplay ? 'App' : 'Web';
  }
  const g = globalThis as Record<string, unknown>;
  const cap = g['Capacitor'] as { isNativePlatform?: () => boolean } | undefined;
  if (cap?.isNativePlatform?.()) {
    return 'App';
  }
  const matchMediaFn = g['matchMedia'] as ((query: string) => { matches?: boolean }) | undefined;
  const nav = g['navigator'] as { standalone?: boolean } | undefined;
  const isStandalone =
    Boolean(matchMediaFn?.('(display-mode: standalone)')?.matches) || nav?.standalone === true;
  return isStandalone ? 'App' : 'Web';
}

export function createSeedWorkspaceSnapshot(
  code = 'TEAM-STACK',
  name = 'Dự Án App & Web Nhóm',
  pinCode = '1234',
): WorkspaceSnapshot {
  const now = new Date().toISOString();
  const wsId = '11111111-1111-4111-8111-111111111111';

  const members: Member[] = [
    {
      id: '22222222-2222-4222-8222-222222222201',
      workspaceId: wsId,
      name: 'Quang',
      role: 'Tech Lead',
      color: MEMBER_PALETTE[0],
      avatar: 'CQ',
      createdAt: now,
    },
    {
      id: '22222222-2222-4222-8222-222222222202',
      workspaceId: wsId,
      name: 'Minh',
      role: 'Backend',
      color: MEMBER_PALETTE[1],
      avatar: 'MI',
      createdAt: now,
    },
    {
      id: '22222222-2222-4222-8222-222222222203',
      workspaceId: wsId,
      name: 'Linh',
      role: 'UI/UX',
      color: MEMBER_PALETTE[4],
      avatar: 'LI',
      createdAt: now,
    },
    {
      id: '22222222-2222-4222-8222-222222222204',
      workspaceId: wsId,
      name: 'Huy',
      role: 'Mobile Dev',
      color: MEMBER_PALETTE[2],
      avatar: 'HU',
      createdAt: now,
    },
    {
      id: '22222222-2222-4222-8222-222222222205',
      workspaceId: wsId,
      name: 'Thảo',
      role: 'QA',
      color: MEMBER_PALETTE[3],
      avatar: 'TH',
      createdAt: now,
    },
  ];

  const stack1Id = '33333333-3333-4333-8333-333333333301';
  const stack2Id = '33333333-3333-4333-8333-333333333302';
  const stack3Id = '33333333-3333-4333-8333-333333333303';
  const stack4Id = '33333333-3333-4333-8333-333333333304';

  const stacks: StackGroup[] = [
    {
      id: stack1Id,
      workspaceId: wsId,
      title: 'Stack 1 — Chốt Yêu Cầu & Thiết Kế Hệ Thống',
      description: 'Nền tảng kiến trúc, luồng màn hình và schema cơ sở dữ liệu trước khi code.',
      color: STACK_PALETTE[0],
      position: 0,
      sequentialLock: true,
      collapsed: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: stack2Id,
      workspaceId: wsId,
      title: 'Stack 2 — Backend & Đồng Bộ Realtime',
      description: 'Thiết lập Supabase Postgres, Realtime WebSockets và cơ chế PIN dự án.',
      color: STACK_PALETTE[1],
      position: 1,
      sequentialLock: false,
      collapsed: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: stack3Id,
      workspaceId: wsId,
      title: 'Stack 3 — Giao Diện Web & Đóng Gói Mobile App',
      description: 'Hoàn thiện trải nghiệm đa nền tảng trên trình duyệt, PWA và bản cài APK.',
      color: STACK_PALETTE[2],
      position: 2,
      sequentialLock: false,
      collapsed: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: stack4Id,
      workspaceId: wsId,
      title: 'Stack 4 — Kiểm Thử Nhóm & Ra Mắt',
      description: 'Checklist nghiệm thu cuối cùng trước khi gửi link và file APK cho cả nhóm.',
      color: STACK_PALETTE[3],
      position: 3,
      sequentialLock: true,
      collapsed: false,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const items: ChecklistItem[] = [
    {
      id: '44444444-4444-4444-8444-444444444401',
      workspaceId: wsId,
      stackId: stack1Id,
      title: 'Chốt danh sách thành viên (<10 người) và phân vai trò chính',
      notes: 'Mỗi thành viên có màu nhận diện riêng để nhìn vào biết ngay ai đang giữ đầu việc nào.',
      status: 'done',
      priority: 'high',
      completed: true,
      assigneeId: members[0].id,
      assigneeIds: [members[0].id],
      dueDate: '2026-11-12',
      position: 0,
      subtasks: [
        {
          id: 's-1',
          title: 'Lập danh sách thành viên cốt lõi',
          completed: true,
          assigneeId: members[0].id,
          completedByName: 'Quang',
        },
        {
          id: 's-2',
          title: 'Thống nhất mã PIN nội bộ',
          completed: true,
          assigneeId: members[1].id,
          completedByName: 'Minh',
        },
      ],
      links: [],
      completedById: members[0].id,
      completedByName: 'Quang',
      completedAt: now,
      updatedByName: 'Quang',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: '44444444-4444-4444-8444-444444444402',
      workspaceId: wsId,
      stackId: stack1Id,
      title: 'Thiết kế Wireframe đồng nhất cho cả Desktop Web & Mobile App',
      notes: 'Đảm bảo thao tác tick 1 chạm trên điện thoại không bị vướng và rõ tiến độ từng Stack.',
      status: 'done',
      priority: 'high',
      completed: true,
      assigneeId: members[2].id,
      assigneeIds: [members[2].id, members[3].id],
      dueDate: '2026-11-13',
      position: 1,
      subtasks: [
        {
          id: 's-3',
          title: 'Layout Desktop 1920x1080 có Sidebar tiến độ',
          completed: true,
          assigneeId: members[2].id,
          completedByName: 'Linh',
        },
        {
          id: 's-4',
          title: 'Layout Mobile có Bottom Navigation dễ bấm bằng ngón cái',
          completed: true,
          assigneeId: members[3].id,
          completedByName: 'Huy',
        },
      ],
      links: [{ id: 'l-1', label: 'Tài liệu Thiết kế UI', url: 'https://figma.com' }],
      completedById: members[2].id,
      completedByName: 'Linh',
      completedAt: now,
      updatedByName: 'Linh',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: '44444444-4444-4444-8444-444444444403',
      workspaceId: wsId,
      stackId: stack1Id,
      title: 'Thống nhất quy ước Stack tuần tự & trạng thái đầu việc',
      notes: 'Các Stack quan trọng bật khóa tuần tự để đảm bảo xong bước nền mới nhảy sang bước kế.',
      status: 'doing',
      priority: 'medium',
      completed: false,
      assigneeId: members[0].id,
      assigneeIds: [members[0].id, members[4].id],
      dueDate: '2026-11-14',
      position: 2,
      subtasks: [
        {
          id: 's-5',
          title: 'Quy ước trạng thái Đang kẹt (Blocked) cần ghi rõ lý do',
          completed: true,
          assigneeId: members[0].id,
          completedByName: 'Quang',
        },
        {
          id: 's-6',
          title: 'Review cùng cả nhóm 5 phút',
          completed: false,
          assigneeId: members[4].id,
          completedByName: null,
        },
      ],
      links: [],
      completedById: null,
      completedByName: null,
      completedAt: null,
      updatedByName: 'Quang',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: '44444444-4444-4444-8444-444444444404',
      workspaceId: wsId,
      stackId: stack2Id,
      title: 'Chạy file supabase/schema.sql trên Supabase SQL Editor',
      notes: 'Tự động tạo 5 bảng + trigger giới hạn 10 thành viên + bật Realtime WebSockets.',
      status: 'done',
      priority: 'high',
      completed: true,
      assigneeId: members[1].id,
      assigneeIds: [members[1].id],
      dueDate: '2026-11-14',
      position: 0,
      subtasks: [],
      links: [{ id: 'l-2', label: 'Supabase Dashboard', url: 'https://supabase.com/dashboard' }],
      completedById: members[1].id,
      completedByName: 'Minh',
      completedAt: now,
      updatedByName: 'Minh',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: '44444444-4444-4444-8444-444444444405',
      workspaceId: wsId,
      stackId: stack2Id,
      title: 'Kết nối URL & Anon Key để kích hoạt đồng bộ Realtime đa thiết bị',
      notes: 'Có thể dán trực tiếp trong nút "Đồng bộ Cloud" ngay trên thanh công cụ ứng dụng.',
      status: 'doing',
      priority: 'high',
      completed: false,
      assigneeId: members[1].id,
      assigneeIds: [members[1].id],
      dueDate: '2026-11-15',
      position: 1,
      subtasks: [
        {
          id: 's-7',
          title: 'Lấy Project URL và Anon Key từ Project Settings -> API',
          completed: true,
          assigneeId: members[1].id,
          completedByName: 'Minh',
        },
        {
          id: 's-8',
          title: 'Bấm Đẩy dữ liệu hiện tại lên Cloud',
          completed: false,
          assigneeId: members[1].id,
          completedByName: null,
        },
      ],
      links: [],
      completedById: null,
      completedByName: null,
      completedAt: null,
      updatedByName: 'Minh',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: '44444444-4444-4444-8444-444444444406',
      workspaceId: wsId,
      stackId: stack3Id,
      title: 'Hoàn thiện tính năng lọc "Việc của tôi" & tìm kiếm tức thì',
      notes: 'Giúp mỗi bạn khi mở App biết ngay hôm nay mình cần xử lý những mục nào trong Stack.',
      status: 'done',
      priority: 'medium',
      completed: true,
      assigneeId: members[3].id,
      assigneeIds: [members[3].id],
      dueDate: '2026-11-15',
      position: 0,
      subtasks: [],
      links: [],
      completedById: members[3].id,
      completedByName: 'Huy',
      completedAt: now,
      updatedByName: 'Huy',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: '44444444-4444-4444-8444-444444444407',
      workspaceId: wsId,
      stackId: stack3Id,
      title: 'Xuất bản cài đặt PWA (iOS/Android) và build file Android APK',
      notes: 'Bạn dùng iPhone có thể bấm Chia sẻ -> Thêm vào Màn hình chính; Android cài thẳng APK.',
      status: 'todo',
      priority: 'high',
      completed: false,
      assigneeId: members[3].id,
      assigneeIds: [members[3].id],
      dueDate: '2026-11-16',
      position: 1,
      subtasks: [],
      links: [],
      completedById: null,
      completedByName: null,
      completedAt: null,
      updatedByName: 'Huy',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: '44444444-4444-4444-8444-444444444408',
      workspaceId: wsId,
      stackId: stack4Id,
      title: 'Test thực tế đồng bộ 2 chiều giữa điện thoại và trình duyệt máy tính',
      notes: 'Mở cùng lúc trên Web và điện thoại, tick thử 1 mục và kiểm tra độ trễ < 200ms.',
      status: 'todo',
      priority: 'high',
      completed: false,
      assigneeId: members[4].id,
      assigneeIds: [members[4].id],
      dueDate: '2026-11-17',
      position: 0,
      subtasks: [],
      links: [],
      completedById: null,
      completedByName: null,
      completedAt: null,
      updatedByName: 'Thảo',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: '44444444-4444-4444-8444-444444444409',
      workspaceId: wsId,
      stackId: stack4Id,
      title: 'Gửi link truy cập + Mã PIN cho cả nhóm bắt đầu chạy dự án',
      notes: 'Bước này mở khóa sau khi QA xác nhận đồng bộ ổn định 100%.',
      status: 'todo',
      priority: 'medium',
      completed: false,
      assigneeId: members[0].id,
      assigneeIds: [members[0].id],
      dueDate: '2026-11-18',
      position: 1,
      subtasks: [],
      links: [],
      completedById: null,
      completedByName: null,
      completedAt: null,
      updatedByName: 'Quang',
      createdAt: now,
      updatedAt: now,
    },
  ];

  return sanitizeWorkspaceSnapshot({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    workspace: {
      id: wsId,
      code: normalizeRoomCode(code),
      name,
      description: 'Không gian theo dõi tiến độ theo từng Stack đồng bộ thời gian thực trên App & Web',
      pinCode,
      maxMembers: MAX_TEAM_MEMBERS,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
    },
    members,
    stacks,
    items,
    activities: [
      {
        id: '55555555-5555-4555-8555-555555555501',
        workspaceId: wsId,
        actorId: members[1].id,
        actorName: 'Minh',
        actorColor: members[1].color,
        actionType: 'check',
        targetTitle: 'Chạy file supabase/schema.sql trên Supabase SQL Editor',
        detail: 'Hoàn thành trong Stack 2',
        createdAt: now,
      },
      {
        id: '55555555-5555-4555-8555-555555555502',
        workspaceId: wsId,
        actorId: members[2].id,
        actorName: 'Linh',
        actorColor: members[2].color,
        actionType: 'check',
        targetTitle: 'Thiết kế Wireframe đồng nhất cho cả Desktop Web & Mobile App',
        detail: 'Hoàn thành trong Stack 1',
        createdAt: now,
      },
    ],
  });
}

export {
  isMemberInvolvedInItem,
  normalizeAssigneeIds,
  sanitizeSubtaskItem,
  sanitizeWorkspaceSnapshot,
  type LegacyChecklistItemInput,
  type LegacySubtaskInput,
  type RawWorkspaceSnapshotInput,
} from './dataValidator';

export {
  detectAssignmentNotices,
  detectNewAssignmentNotices,
} from './notificationDiffEngine';
