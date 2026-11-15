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
import { domainEventBus } from '../events/domainEventBus';
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
  return {
    snapshot: base,
    quang: base.members[0]!,
    minh: base.members[1]!,
    linh: base.members[2]!,
  };
}

describe('Clean Architecture & Schema v1->v2 Governance', () => {
  beforeEach(() => {
    window.localStorage.clear();
    domainEventBus.clear();
  });

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
      expect(codeWithoutComments, `${filePath} must not import UI/network packages`).not.toMatch(forbiddenImportPattern);
      expect(codeWithoutComments, `${filePath} must not touch browser storage or DOM`).not.toMatch(forbiddenBrowserStoragePattern);
    }
  });

  it('preserves 100% of legacy re-exports from src/domain/stackDomain.ts', () => {
    expect(legacyDomainReExport.sanitizeWorkspaceSnapshot).toBe(sanitizeWorkspaceSnapshot);
    expect(legacyDomainReExport.normalizeAssigneeIds).toBe(normalizeAssigneeIds);
    expect(legacyDomainReExport.isMemberInvolvedInItem).toBe(isMemberInvolvedInItem);
    expect(legacyDomainReExport.detectNewAssignmentNotices).toBe(detectNewAssignmentNotices);
    expect(legacyDomainReExport.detectAssignmentNotices).toBe(detectAssignmentNotices);
  });

  it('upgrades legacy Schema v1 single assigneeId into assigneeIds, strips invalid IDs, and deduplicates', () => {
    const { snapshot, quang, minh } = buildFixtureSnapshot();
    const stackId = snapshot.stacks[0]!.id;
    const now = '2026-11-11T08:00:00.000Z';

    const rawV1Input: RawWorkspaceSnapshotInput = {
      workspace: { ...snapshot.workspace, schemaVersion: undefined },
      members: [quang, minh],
      stacks: snapshot.stacks,
      items: [
        {
          id: 'legacy-item-1', workspaceId: snapshot.workspace.id, stackId,
          title: 'Đầu việc từ phiên bản cũ v1', notes: 'Chỉ có assigneeId đơn lẻ',
          status: 'todo', priority: 'high', completed: false, assigneeId: minh.id,
          dueDate: null, position: 0,
          subtasks: [
            { title: '  Bước con chưa có id  ', completed: false, assigneeId: quang.id },
            { id: 'sub-ghost', title: 'Bước gắn ID thành viên đã rời nhóm', completed: true, assigneeId: 'deleted-member-999' },
            { id: 'sub-empty', title: '   ', completed: false },
          ],
          links: null, completedById: null, completedByName: null, completedAt: null, updatedByName: 'Quang', createdAt: now, updatedAt: now,
        },
        {
          id: 'unmigrated-db-row', workspaceId: snapshot.workspace.id, stackId,
          title: 'Dòng DB vừa thêm cột assignee_ids rỗng', notes: '',
          status: 'doing', priority: 'medium', completed: false, assigneeId: quang.id, assigneeIds: [],
          dueDate: null, position: 1, subtasks: [], links: [],
          completedById: null, completedByName: null, completedAt: null, updatedByName: 'Quang', createdAt: now, updatedAt: now,
        },
        {
          id: 'dirty-multi-item', workspaceId: snapshot.workspace.id, stackId,
          title: 'Đầu việc có trùng lặp & thành viên ảo', notes: '',
          status: 'todo', priority: 'low', completed: false,
          assigneeId: 'ghost-user', assigneeIds: ['ghost-user', `  ${minh.id} `, quang.id, minh.id, ''],
          dueDate: null, position: 2, subtasks: [], links: [],
          completedById: null, completedByName: null, completedAt: null, updatedByName: 'Quang', createdAt: now, updatedAt: now,
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
    expect(item1.subtasks).toHaveLength(2);
    expect(item1.subtasks[0]).toEqual({
      id: 'sub-1', title: 'Bước con chưa có id', completed: false, assigneeId: quang.id, completedByName: null,
    });
    expect(item1.subtasks[1]?.assigneeId).toBeNull();

    const item2 = sanitized.items.find((i) => i.id === 'unmigrated-db-row')!;
    expect(item2.assigneeIds).toEqual([quang.id]);
    expect(item2.assigneeId).toBe(quang.id);

    const item3 = sanitized.items.find((i) => i.id === 'dirty-multi-item')!;
    expect(item3.assigneeIds).toEqual([minh.id, quang.id]);
    expect(item3.assigneeId).toBe(minh.id);
  });

  it('preserves explicit empty assigneeIds in Schema v2 and guarantees deep immutability', () => {
    const { snapshot, quang } = buildFixtureSnapshot();
    const v2Unassigned: WorkspaceSnapshot = {
      ...snapshot,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      items: [{ ...snapshot.items[0]!, assigneeId: quang.id, assigneeIds: [] }],
    };

    const sanitized = sanitizeWorkspaceSnapshot(v2Unassigned);
    expect(sanitized.items[0]!.assigneeIds).toEqual([]);
    expect(sanitized.items[0]!.assigneeId).toBeNull();

    sanitized.items[0]!.assigneeIds.push(quang.id);
    expect(v2Unassigned.items[0]!.assigneeIds).toEqual([]);

    expect(sanitizeSubtaskItem({ id: ' s1 ', title: ' Viết test ', completed: true, assigneeId: quang.id, completedByName: ' Quang ' }, 0)).toEqual({
      id: 's1', title: 'Viết test', completed: true, assigneeId: quang.id, completedByName: 'Quang',
    });
  });

  it('identifies primary assignee, co-assignee, and subtask-only assignee in isMemberInvolvedInItem', () => {
    const { snapshot, quang, minh, linh } = buildFixtureSnapshot();
    const huy = snapshot.members[3]!;
    const thao = snapshot.members[4]!;

    const collaborativeItem: ChecklistItem = {
      ...snapshot.items[0]!,
      completed: false,
      status: 'doing',
      assigneeId: quang.id,
      assigneeIds: [quang.id, minh.id],
      subtasks: [
        { id: 'sub-ui', title: 'Thiết kế nút Chuông thông báo', completed: false, assigneeId: linh.id, completedByName: null },
        { id: 'sub-apk', title: 'Kiểm tra quyền AndroidManifest', completed: false, assigneeId: huy.id, completedByName: null },
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
