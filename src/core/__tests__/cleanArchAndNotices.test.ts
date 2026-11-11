import { beforeEach, describe, expect, it } from 'vitest';
import {
  isMemberInvolvedInItem,
  normalizeAssigneeIds,
  sanitizeSubtaskItem,
  sanitizeWorkspaceSnapshot,
  type RawWorkspaceSnapshotInput,
} from '../domain/dataValidator';
import {
  detectAssignmentNotices,
  detectNewAssignmentNotices,
} from '../domain/notificationDiffEngine';
import { createSeedWorkspaceSnapshot } from '../domain/stackDomain';
import * as legacyDomainReExport from '../../domain/stackDomain';
import { DomainEventBus, domainEventBus } from '../events/domainEventBus';
import {
  formatNoticeMessage,
  hashNoticeIdToInt32,
  NotificationService,
  notificationService,
} from '../../infrastructure/notifications/notificationService';
import { StackFlowSyncService } from '../../services/syncService';
import {
  CURRENT_SCHEMA_VERSION,
  type ChecklistItem,
  type Member,
  type WorkspaceSnapshot,
} from '../../types/models';

const domainRawSources = import.meta.glob<string>('../domain/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function buildFixtureSnapshot(): {
  snapshot: WorkspaceSnapshot;
  quang: Member;
  minh: Member;
  linh: Member;
} {
  const base = createSeedWorkspaceSnapshot('QA-ROOM', 'Dự Án Kiểm Định QA', '2468');
  const quang = base.members[0]!; // Quang
  const minh = base.members[1]!; // Minh
  const linh = base.members[2]!; // Linh
  return { snapshot: base, quang, minh, linh };
}

describe('Wave 3 QA Audit — Clean Architecture, Schema v1->v2 Governance & Assignment Notices', () => {
  beforeEach(() => {
    window.localStorage.clear();
    domainEventBus.clear();
  });

  describe('1. Clean Architecture Strict Layering & Backwards-Compatible Exports', () => {
    it('ensures src/core/domain/*.ts has zero UI, DOM, storage, or network infrastructure imports', () => {
      const entries = Object.entries(domainRawSources);
      expect(entries.length).toBeGreaterThanOrEqual(3);

      const forbiddenImportPattern =
        /from\s+['"](?:react|react-dom|mqtt|@supabase\/supabase-js|@capacitor\/[^'"]+)['"]/;
      const forbiddenBrowserStoragePattern = /\b(?:localStorage|sessionStorage|document)\b/;

      for (const [filePath, sourceCode] of entries) {
        const codeWithoutComments = sourceCode
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/.*$/gm, '');

        expect(codeWithoutComments, `${filePath} must not import UI/network packages`).not.toMatch(
          forbiddenImportPattern,
        );
        expect(codeWithoutComments, `${filePath} must not touch browser storage or DOM`).not.toMatch(
          forbiddenBrowserStoragePattern,
        );
      }
    });

    it('preserves 100% of legacy re-exports from src/domain/stackDomain.ts', () => {
      expect(legacyDomainReExport.sanitizeWorkspaceSnapshot).toBe(sanitizeWorkspaceSnapshot);
      expect(legacyDomainReExport.normalizeAssigneeIds).toBe(normalizeAssigneeIds);
      expect(legacyDomainReExport.isMemberInvolvedInItem).toBe(isMemberInvolvedInItem);
      expect(legacyDomainReExport.detectNewAssignmentNotices).toBe(detectNewAssignmentNotices);
      expect(legacyDomainReExport.detectAssignmentNotices).toBe(detectAssignmentNotices);
    });
  });

  describe('2. Schema v1 -> v2 Migration, Sanitization & Immutability', () => {
    it('upgrades legacy Schema v1 single assigneeId into assigneeIds, strips invalid IDs, and deduplicates', () => {
      const { snapshot, quang, minh } = buildFixtureSnapshot();
      const stackId = snapshot.stacks[0]!.id;
      const now = '2026-11-11T08:00:00.000Z';

      const rawV1Input: RawWorkspaceSnapshotInput = {
        // Legacy v1 snapshot without schemaVersion
        workspace: {
          ...snapshot.workspace,
          schemaVersion: undefined,
        },
        members: [quang, minh],
        stacks: snapshot.stacks,
        items: [
          {
            id: 'legacy-item-1',
            workspaceId: snapshot.workspace.id,
            stackId,
            title: 'Đầu việc từ phiên bản cũ v1',
            notes: 'Chỉ có assigneeId đơn lẻ',
            status: 'todo',
            priority: 'high',
            completed: false,
            assigneeId: minh.id,
            // No assigneeIds field at all
            dueDate: null,
            position: 0,
            subtasks: [
              { title: '  Bước con chưa có id  ', completed: false, assigneeId: quang.id },
              { id: 'sub-ghost', title: 'Bước gắn ID thành viên đã rời nhóm', completed: true, assigneeId: 'deleted-member-999' },
              { id: 'sub-empty', title: '   ', completed: false },
            ],
            links: null,
            completedById: null,
            completedByName: null,
            completedAt: null,
            updatedByName: 'Quang',
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'unmigrated-db-row',
            workspaceId: snapshot.workspace.id,
            stackId,
            title: 'Dòng DB vừa thêm cột assignee_ids rỗng',
            notes: '',
            status: 'doing',
            priority: 'medium',
            completed: false,
            assigneeId: quang.id,
            assigneeIds: [], // default '{}' before backfill on v1
            dueDate: null,
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
          {
            id: 'dirty-multi-item',
            workspaceId: snapshot.workspace.id,
            stackId,
            title: 'Đầu việc có trùng lặp & thành viên ảo',
            notes: '',
            status: 'todo',
            priority: 'low',
            completed: false,
            assigneeId: 'ghost-user',
            assigneeIds: ['ghost-user', `  ${minh.id} `, quang.id, minh.id, ''],
            dueDate: null,
            position: 2,
            subtasks: [],
            links: [],
            completedById: null,
            completedByName: null,
            completedAt: null,
            updatedByName: 'Quang',
            createdAt: now,
            updatedAt: now,
          },
        ],
        activities: snapshot.activities,
      };

      const sanitized = sanitizeWorkspaceSnapshot(rawV1Input);

      expect(sanitized.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(sanitized.workspace.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

      const item1 = sanitized.items.find((i) => i.id === 'legacy-item-1')!;
      expect(item1.assigneeIds).toEqual([minh.id]);
      expect(item1.assigneeId).toBe(minh.id);
      expect(item1.subtasks).toHaveLength(2); // blank title filtered out
      expect(item1.subtasks[0]).toEqual({
        id: 'sub-1',
        title: 'Bước con chưa có id',
        completed: false,
        assigneeId: quang.id,
        completedByName: null,
      });
      expect(item1.subtasks[1]?.assigneeId).toBeNull(); // invalid member stripped

      const item2 = sanitized.items.find((i) => i.id === 'unmigrated-db-row')!;
      expect(item2.assigneeIds).toEqual([quang.id]);
      expect(item2.assigneeId).toBe(quang.id);

      const item3 = sanitized.items.find((i) => i.id === 'dirty-multi-item')!;
      expect(item3.assigneeIds).toEqual([minh.id, quang.id]);
      expect(item3.assigneeId).toBe(minh.id); // synced to assigneeIds[0]
    });

    it('preserves explicit empty assigneeIds in Schema v2 and guarantees deep immutability', () => {
      const { snapshot, quang } = buildFixtureSnapshot();
      const v2Unassigned: WorkspaceSnapshot = {
        ...snapshot,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        items: [
          {
            ...snapshot.items[0]!,
            assigneeId: quang.id,
            assigneeIds: [], // Explicitly cleared all assignees in v2
          },
        ],
      };

      const sanitized = sanitizeWorkspaceSnapshot(v2Unassigned);
      expect(sanitized.items[0]!.assigneeIds).toEqual([]);
      expect(sanitized.items[0]!.assigneeId).toBeNull();

      // Mutating returned copy must NOT mutate input
      sanitized.items[0]!.assigneeIds.push(quang.id);
      expect(v2Unassigned.items[0]!.assigneeIds).toEqual([]);

      const normalizedSub = sanitizeSubtaskItem({
        id: ' s1 ',
        title: ' Viết test ',
        completed: true,
        assigneeId: quang.id,
        completedByName: ' Quang ',
      }, 0);
      expect(normalizedSub).toEqual({
        id: 's1',
        title: 'Viết test',
        completed: true,
        assigneeId: quang.id,
        completedByName: 'Quang',
      });
    });
  });

  describe('3. Multi-Assignee Tasks + Per-Subtask Assignees + isMemberInvolvedInItem', () => {
    it('returns true for primary assignee, co-assignee, and subtask-only assignee, and false otherwise', () => {
      const { snapshot, quang, minh, linh } = buildFixtureSnapshot();
      const huy = snapshot.members[3]!;
      const thao = snapshot.members[4]!;

      const collaborativeItem: ChecklistItem = {
        ...snapshot.items[0]!,
        completed: false,
        status: 'doing',
        assigneeId: quang.id,
        assigneeIds: [quang.id, minh.id], // Quang (primary) + Minh (co-assignee)
        subtasks: [
          {
            id: 'sub-ui',
            title: 'Thiết kế nút Chuông thông báo',
            completed: false,
            assigneeId: linh.id, // Linh is ONLY assigned to a subtask
            completedByName: null,
          },
          {
            id: 'sub-apk',
            title: 'Kiểm tra quyền AndroidManifest',
            completed: false,
            assigneeId: huy.id, // Huy is ONLY assigned to a subtask
            completedByName: null,
          },
        ],
      };

      expect(isMemberInvolvedInItem(collaborativeItem, quang.id)).toBe(true);
      expect(isMemberInvolvedInItem(collaborativeItem, minh.id)).toBe(true);
      expect(isMemberInvolvedInItem(collaborativeItem, linh.id)).toBe(true);
      expect(isMemberInvolvedInItem(collaborativeItem, huy.id)).toBe(true);
      expect(isMemberInvolvedInItem(collaborativeItem, thao.id)).toBe(false);
      expect(isMemberInvolvedInItem(collaborativeItem, '')).toBe(false);
    });
  });

  describe('4. detectNewAssignmentNotices Pure Diff Engine', () => {
    it('returns [] on initial load (prev === null) or when switching workspaces', () => {
      const { snapshot, minh } = buildFixtureSnapshot();
      expect(detectNewAssignmentNotices(null, snapshot, minh.id)).toEqual([]);

      const otherWorkspace = createSeedWorkspaceSnapshot('OTHER-ROOM', 'Dự Án Khác', '9999');
      const switched: WorkspaceSnapshot = {
        ...otherWorkspace,
        workspace: { ...otherWorkspace.workspace, id: 'different-ws-id' },
      };
      expect(detectNewAssignmentNotices(snapshot, switched, minh.id)).toEqual([]);
    });

    it('emits task_assigned when Person A assigns Person B to a new task or adds Person B to an existing task', () => {
      const { snapshot: prev, quang, minh, linh } = buildFixtureSnapshot();
      const stackId = prev.stacks[0]!.id;
      const t1 = '2026-11-11T09:00:00.000Z';

      // Case A: Brand new multi-assignee task created by Quang for [Quang, Minh]
      const newTask: ChecklistItem = {
        id: 'task-new-collab',
        workspaceId: prev.workspace.id,
        stackId,
        title: 'Chuẩn bị slide demo cuối tuần',
        notes: '',
        status: 'todo',
        priority: 'high',
        completed: false,
        assigneeId: quang.id,
        assigneeIds: [quang.id, minh.id],
        dueDate: null,
        position: 99,
        subtasks: [],
        links: [],
        completedById: null,
        completedByName: null,
        completedAt: null,
        updatedByName: quang.name,
        createdAt: t1,
        updatedAt: t1,
      };

      // Case B: Existing task previously owned only by Linh, now Quang adds Minh as co-assignee
      const existingTaskTarget = prev.items.find(
        (it) => !it.completed && !it.assigneeIds.includes(minh.id),
      )!;
      const updatedExistingTask: ChecklistItem = {
        ...existingTaskTarget,
        assigneeIds: [...existingTaskTarget.assigneeIds, minh.id],
        assigneeId: existingTaskTarget.assigneeIds[0] ?? minh.id,
        updatedByName: quang.name,
        updatedAt: t1,
      };

      const next: WorkspaceSnapshot = {
        ...prev,
        items: [
          ...prev.items.map((it) => (it.id === existingTaskTarget.id ? updatedExistingTask : it)),
          newTask,
        ],
      };

      const noticesForMinh = detectNewAssignmentNotices(prev, next, minh.id);
      expect(noticesForMinh).toHaveLength(2);
      expect(noticesForMinh.every((n) => n.kind === 'task_assigned')).toBe(true);
      expect(noticesForMinh.map((n) => n.taskId).sort()).toEqual(
        [existingTaskTarget.id, 'task-new-collab'].sort(),
      );
      expect(noticesForMinh[0]!.actorName).toBe('Quang');
      expect(noticesForMinh[0]!.read).toBe(false);

      const formatted = formatNoticeMessage(noticesForMinh.find((n) => n.taskId === 'task-new-collab')!);
      expect(formatted).toEqual({
        title: '🔔 Bạn được giao việc mới',
        body: 'Quang vừa giao cho bạn: Chuẩn bị slide demo cuối tuần',
      });

      // Uninvolved member (Linh was already on existingTaskTarget or not newly added) gets 0 notices
      const noticesForLinh = detectNewAssignmentNotices(prev, next, linh.id);
      expect(noticesForLinh).toEqual([]);
    });

    it('emits subtask_assigned when Person A assigns Person B to a subtask inside a task', () => {
      const { snapshot: prev, quang, minh } = buildFixtureSnapshot();
      const targetTask = prev.items.find((it) => !it.completed && !it.assigneeIds.includes(minh.id))!;
      const t2 = '2026-11-11T09:15:00.000Z';

      const next: WorkspaceSnapshot = {
        ...prev,
        items: prev.items.map((it) =>
          it.id === targetTask.id
            ? {
                ...it,
                updatedByName: quang.name,
                updatedAt: t2,
                subtasks: [
                  ...it.subtasks,
                  {
                    id: 'sub-api-check',
                    title: 'Kiểm tra kết nối API',
                    completed: false,
                    assigneeId: minh.id,
                    completedByName: null,
                  },
                ],
              }
            : it,
        ),
      };

      const notices = detectNewAssignmentNotices(prev, next, minh.id);
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({
        kind: 'subtask_assigned',
        targetMemberId: minh.id,
        actorName: 'Quang',
        taskId: targetTask.id,
        taskTitle: targetTask.title,
        subtaskTitle: 'Kiểm tra kết nối API',
        read: false,
      });

      expect(formatNoticeMessage(notices[0]!)).toEqual({
        title: '🔔 Phần việc mới trong nhóm',
        body: `Quang giao bạn làm: Kiểm tra kết nối API (${targetTask.title})`,
      });
    });

    it('does NOT emit self-notices when Person B assigns themselves and ignores unrelated edits', () => {
      const { snapshot: prev, quang, minh } = buildFixtureSnapshot();
      const targetTask = prev.items.find((it) => !it.completed && !it.assigneeIds.includes(minh.id))!;
      const alreadyMinhTask = prev.items.find((it) => !it.completed && it.assigneeIds.includes(minh.id))!;
      const t3 = '2026-11-11T09:30:00.000Z';

      // Minh assigns himself to both task and subtask (`updatedByName: ' minh '`)
      const selfAssignedSnap: WorkspaceSnapshot = {
        ...prev,
        items: prev.items.map((it) =>
          it.id === targetTask.id
            ? {
                ...it,
                assigneeIds: [...it.assigneeIds, minh.id],
                assigneeId: it.assigneeIds[0] ?? minh.id,
                subtasks: [
                  ...it.subtasks,
                  { id: 'sub-self', title: 'Tự nhận việc nhỏ', completed: false, assigneeId: minh.id },
                ],
                updatedByName: '  minh ',
                updatedAt: t3,
              }
            : it,
        ),
      };
      expect(detectNewAssignmentNotices(prev, selfAssignedSnap, minh.id)).toEqual([]);

      // Quang edits notes/priority on a task where Minh was ALREADY assigned -> 0 duplicate notices!
      const unrelatedEditSnap: WorkspaceSnapshot = {
        ...prev,
        items: prev.items.map((it) =>
          it.id === alreadyMinhTask.id
            ? {
                ...it,
                notes: 'Cập nhật ghi chú mới không đổi người làm',
                priority: 'low',
                updatedByName: quang.name,
                updatedAt: t3,
              }
            : it,
        ),
      };
      expect(detectNewAssignmentNotices(prev, unrelatedEditSnap, minh.id)).toEqual([]);
    });
  });

  describe('5. DomainEventBus & Notification Helpers', () => {
    it('supports typed on, once, emit, unsubscribe, and clear', () => {
      const bus = new DomainEventBus<{ ping: { count: number } }>();
      const received: number[] = [];

      const off = bus.on('ping', (p) => received.push(p.count));
      bus.once('ping', (p) => received.push(p.count * 10));
      expect(bus.listenerCount('ping')).toBe(2);

      bus.emit('ping', { count: 2 });
      bus.emit('ping', { count: 3 });
      expect(received).toEqual([2, 20, 3]);

      off();
      expect(bus.listenerCount('ping')).toBe(0);

      expect(hashNoticeIdToInt32('notice:task:1')).toBeGreaterThan(0);
      expect(hashNoticeIdToInt32('notice:task:1')).toBe(hashNoticeIdToInt32('notice:task:1'));

      const localSvc = new NotificationService();
      expect(['unsupported', 'default', 'granted', 'denied']).toContain(
        localSvc.getPermissionState(),
      );
    });

    it('dispatches Web Notification popup when permission is granted and deduplicates identical notice IDs', async () => {
      const firedPopups: Array<{ title: string; body?: string; tag?: string }> = [];
      const originalNotification = window.Notification;

      class MockNotification {
        static permission: NotificationPermission = 'granted';
        static requestPermission = async (): Promise<NotificationPermission> => 'granted';
        constructor(title: string, options?: NotificationOptions) {
          firedPopups.push({ title, body: options?.body, tag: options?.tag });
        }
      }

      Object.defineProperty(window, 'Notification', {
        configurable: true,
        writable: true,
        value: MockNotification,
      });

      try {
        const localSvc = new NotificationService();
        expect(localSvc.getPermissionState()).toBe('granted');
        await expect(localSvc.requestPermission()).resolves.toBe(true);

        const sampleNotice = {
          id: 'notice:task:ws-1:item-1:minh:2026-11-11T10:00:00.000Z',
          workspaceId: 'ws-1',
          workspaceCode: 'QA-ROOM',
          targetMemberId: 'minh',
          actorName: 'Quang',
          kind: 'task_assigned' as const,
          taskId: 'item-1',
          taskTitle: 'Hoàn thiện kiểm thử tự động',
          createdAt: '2026-11-11T10:00:00.000Z',
          read: false,
        };

        const acceptedFirst = localSvc.dispatchNotices([sampleNotice]);
        const acceptedDuplicate = localSvc.dispatchNotices([sampleNotice]);

        // Wait microtask for async triggerOsNotification
        await Promise.resolve();

        expect(acceptedFirst).toHaveLength(1);
        expect(acceptedDuplicate).toHaveLength(0);
        expect(firedPopups).toHaveLength(1);
        expect(firedPopups[0]).toEqual({
          title: '🔔 Bạn được giao việc mới',
          body: 'Quang vừa giao cho bạn: Hoàn thiện kiểm thử tự động',
          tag: sampleNotice.id,
        });
      } finally {
        Object.defineProperty(window, 'Notification', {
          configurable: true,
          writable: true,
          value: originalNotification,
        });
      }
    });
  });

  describe('6. StackFlowSyncService + notificationService End-to-End Integration', () => {
    it('stores AppNotice for target member when multi-assignee task or subtask is added/updated, and cleans up removed members', async () => {
      const svc = new StackFlowSyncService();
      const { creator: quang } = await svc.createWorkspace({
        code: 'E2E-NOTIFY',
        name: 'Dự Án Đồng Bộ Thông Báo',
        pinCode: '1357',
        creatorName: 'Quang',
      });

      const minh = await svc.addMember('Minh', 'Backend');
      const linh = await svc.addMember('Linh', 'Design');

      const wsId = svc.getSnapshot()!.workspace.id;
      const stackId = svc.getSnapshot()!.stacks[0]!.id;

      // Minh is currently viewing the app on his device
      svc.setActiveMember(minh);
      expect(notificationService.getNotices(wsId, minh.id)).toHaveLength(0);
      expect(notificationService.getUnreadCount(wsId, minh.id)).toBe(0);

      let subscriberCallCount = 0;
      const unsubscribeNotices = notificationService.subscribeNotices(() => {
        subscriberCallCount += 1;
      });

      // 1) Quang creates a multi-assignee task for [Quang, Minh] with a subtask for Linh
      const sharedTask = await svc.addItem({
        stackId,
        title: 'Thiết kế & Ghép API Màn Hình Chính',
        assigneeIds: [quang.id, minh.id],
        subtasks: [
          {
            id: 'sub-wireframe',
            title: 'Vẽ khung màn hình',
            completed: false,
            assigneeId: linh.id,
          },
        ],
        actor: quang,
      });

      expect(sharedTask.assigneeIds).toEqual([quang.id, minh.id]);
      expect(sharedTask.assigneeId).toBe(quang.id);

      const noticesAfterCreate = notificationService.getNotices(wsId, minh.id);
      expect(noticesAfterCreate).toHaveLength(1);
      expect(noticesAfterCreate[0]).toMatchObject({
        kind: 'task_assigned',
        targetMemberId: minh.id,
        actorName: 'Quang',
        taskId: sharedTask.id,
        taskTitle: 'Thiết kế & Ghép API Màn Hình Chính',
        read: false,
      });
      expect(notificationService.getUnreadCount(wsId, minh.id)).toBe(1);
      expect(subscriberCallCount).toBeGreaterThanOrEqual(1);

      // 2) Quang breaks down another task into subtasks and assigns one subtask to Minh
      const secondTask = await svc.addItem({
        stackId,
        title: 'Kiểm thử bản cài đặt Android APK',
        assigneeIds: [linh.id],
        actor: quang,
      });
      // Minh was NOT assigned to secondTask yet -> still 1 notice
      expect(notificationService.getUnreadCount(wsId, minh.id)).toBe(1);

      await svc.updateItem(
        secondTask.id,
        {
          subtasks: [
            {
              id: 'sub-minh-test',
              title: 'Cài thử APK trên máy Samsung và bấm chuông',
              completed: false,
              assigneeId: minh.id,
            },
          ],
        },
        quang,
      );

      const noticesAfterSubtask = notificationService.getNotices(wsId, minh.id);
      expect(noticesAfterSubtask).toHaveLength(2);
      expect(
        noticesAfterSubtask.some(
          (n) =>
            n.kind === 'subtask_assigned' &&
            n.taskId === secondTask.id &&
            n.subtaskTitle === 'Cài thử APK trên máy Samsung và bấm chuông',
        ),
      ).toBe(true);
      expect(notificationService.getUnreadCount(wsId, minh.id)).toBe(2);

      // 3) Minh assigns himself to a task -> NO self-notice generated!
      await svc.addItem({
        stackId,
        title: 'Việc Minh tự tạo cho mình',
        assigneeIds: [minh.id],
        actor: minh,
      });
      expect(notificationService.getNotices(wsId, minh.id)).toHaveLength(2);

      // 4) Mark single notice read, mark all read, and clear notices
      notificationService.markNoticeRead(noticesAfterCreate[0]!.id);
      expect(notificationService.getUnreadCount(wsId, minh.id)).toBe(1);

      notificationService.markAllRead(wsId, minh.id);
      expect(notificationService.getUnreadCount(wsId, minh.id)).toBe(0);

      notificationService.clearNotices(wsId, minh.id);
      expect(notificationService.getNotices(wsId, minh.id)).toHaveLength(0);

      // 5) Removing Linh cleans up Linh's ID from task assigneeIds & subtask assigneeId
      await svc.removeMember(linh.id);
      const afterRemoveSnap = svc.getSnapshot()!;
      const refreshedShared = afterRemoveSnap.items.find((i) => i.id === sharedTask.id)!;
      const refreshedSecond = afterRemoveSnap.items.find((i) => i.id === secondTask.id)!;
      expect(refreshedShared.subtasks[0]!.assigneeId).toBeNull();
      expect(refreshedSecond.assigneeIds).toEqual([]);
      expect(refreshedSecond.assigneeId).toBeNull();

      unsubscribeNotices();
      svc.teardownConnections();
    });
  });
});
