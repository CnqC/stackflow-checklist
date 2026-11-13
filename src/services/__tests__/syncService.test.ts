import { beforeEach, describe, expect, it } from 'vitest';
import {
  calculateProgress,
  canAddMember,
  getInitials,
  isItemLockedBySequence,
  normalizeRoomCode,
} from '../../domain/stackDomain';
import { canCompleteSubtask, canCompleteTask } from '../../core/domain/taskCompletionPolicy';
import { MAX_TEAM_MEMBERS } from '../../types/models';
import {
  decryptPayload,
  deriveRoomTopicAndKey,
  encryptPayload,
} from '../e2eeRelaySync';
import { StackFlowSyncService } from '../syncService';

describe('StackFlow Domain & Realtime Sync Service', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('normalizes room codes and extracts Vietnamese initials cleanly', () => {
    expect(normalizeRoomCode('  nhom game 2026! ')).toBe('NHOM-GAME-2026');
    expect(getInitials('Cao Nhật Quang')).toBe('CQ');
    expect(getInitials('Minh')).toBe('MI');
  });

  it('joins default seed workspace with valid PIN and rejects wrong PIN', async () => {
    const svc = new StackFlowSyncService();
    await expect(svc.joinWorkspaceByPin('TEAM-STACK', '9999')).rejects.toThrow(/Mã PIN không chính xác/);

    const snap = await svc.joinWorkspaceByPin('TEAM-STACK', '1234');
    expect(snap.workspace.code).toBe('TEAM-STACK');
    expect(snap.members.length).toBe(5);
    expect(snap.stacks.length).toBe(4);
    svc.teardownConnections();
  });

  it('enforces maximum of 10 team members per project workspace', async () => {
    const svc = new StackFlowSyncService();
    const { snapshot } = await svc.createWorkspace({
      code: 'SQUAD-10',
      name: 'Dự án 10 Người',
      pinCode: '2468',
      creatorName: 'Quang',
    });

    expect(snapshot.members.length).toBe(1);

    for (let i = 2; i <= MAX_TEAM_MEMBERS; i++) {
      await svc.addMember(`Thành viên ${i}`, 'Dev');
    }

    const afterTen = svc.getSnapshot()!;
    expect(afterTen.members.length).toBe(10);
    expect(canAddMember(afterTen.members)).toBe(false);

    await expect(svc.addMember('Người thứ 11', 'QA')).rejects.toThrow(/tối đa 10 thành viên/);
    svc.teardownConnections();
  });

  it('locks downstream items in a sequential stack until preceding steps are completed', async () => {
    const svc = new StackFlowSyncService();
    const { creator } = await svc.createWorkspace({
      code: 'SEQ-TEST',
      name: 'Sequential Flow',
      pinCode: '1111',
      creatorName: 'Quang',
      useStarterTemplate: false,
    });

    const stack = await svc.addStack({
      title: 'Release Pipeline',
      sequentialLock: true,
      actor: creator,
    });

    const step1 = await svc.addItem({ stackId: stack.id, title: 'Build APK', assigneeId: creator.id, actor: creator });
    const step2 = await svc.addItem({ stackId: stack.id, title: 'QA Smoke Test', assigneeId: creator.id, actor: creator });

    let snap = svc.getSnapshot()!;
    const stackItemsBefore = snap.items.filter((i) => i.stackId === stack.id);
    expect(isItemLockedBySequence(stack, step1, stackItemsBefore).locked).toBe(false);
    expect(isItemLockedBySequence(stack, step2, stackItemsBefore)).toEqual({
      locked: true,
      blockingItemTitle: 'Build APK',
    });

    // Complete step 1 -> step 2 unlocks and progress reaches 50%
    await svc.toggleItem(step1.id, creator);
    snap = svc.getSnapshot()!;
    const stackItemsAfter = snap.items.filter((i) => i.stackId === stack.id);
    const updatedStep1 = stackItemsAfter.find((i) => i.id === step1.id)!;
    const updatedStep2 = stackItemsAfter.find((i) => i.id === step2.id)!;

    expect(updatedStep1.completed).toBe(true);
    expect(updatedStep1.completedByName).toBe('Quang');
    expect(isItemLockedBySequence(stack, updatedStep2, stackItemsAfter).locked).toBe(false);

    const progress = calculateProgress(stackItemsAfter);
    expect(progress).toEqual({
      total: 2,
      completed: 1,
      doing: 0,
      blocked: 0,
      percentage: 50,
    });

    svc.teardownConnections();
  });

  it('encrypts and decrypts workspace snapshots with PIN-derived AES-256-GCM and blocks wrong PIN', async () => {
    const right = await deriveRoomTopicAndKey('TEAM-STACK', '1234');
    const wrong = await deriveRoomTopicAndKey('TEAM-STACK', '9999');

    expect(right.topicBase).not.toBe(wrong.topicBase);

    const encrypted = await encryptPayload(right.aesKey, 'tab-A', {
      hello: 'StackFlow',
      count: 9,
    });

    const okResult = await decryptPayload<{ hello: string; count: number }>(
      right.aesKey,
      encrypted,
    );
    expect(okResult?.senderId).toBe('tab-A');
    expect(okResult?.data).toEqual({ hello: 'StackFlow', count: 9 });

    const badResult = await decryptPayload(wrong.aesKey, encrypted);
    expect(badResult).toBeNull();
  });

  it('keeps legacy single assigneeId and v2 multi-assignee assigneeIds in 2-way sync', async () => {
    const svc = new StackFlowSyncService();
    const { creator: quang } = await svc.createWorkspace({
      code: 'COMPAT-V2',
      name: 'Backwards Compat Check',
      pinCode: '5678',
      creatorName: 'Quang',
    });
    const minh = await svc.addMember('Minh', 'Dev');
    const stackId = svc.getSnapshot()!.stacks[0]!.id;

    // Legacy caller passing only `assigneeId`
    const legacyCreated = await svc.addItem({
      stackId,
      title: 'Legacy Single Assignee Call',
      assigneeId: minh.id,
      actor: quang,
    });
    expect(legacyCreated.assigneeId).toBe(minh.id);
    expect(legacyCreated.assigneeIds).toEqual([minh.id]);

    // v2 caller updating with multiple `assigneeIds`
    await svc.updateItem(legacyCreated.id, { assigneeIds: [quang.id, minh.id] }, quang);
    const updated = svc.getSnapshot()!.items.find((i) => i.id === legacyCreated.id)!;
    expect(updated.assigneeIds).toEqual([quang.id, minh.id]);
    expect(updated.assigneeId).toBe(quang.id);

    svc.teardownConnections();
  });

  it('allows only responsible members to complete tasks and subtasks through every update path', async () => {
    const svc = new StackFlowSyncService();
    const { creator: quang } = await svc.createWorkspace({
      code: 'TASK-OWNERS', name: 'Task owners', pinCode: '5678',
      creatorName: 'Quang', useStarterTemplate: false,
    });
    const minh = await svc.addMember('Minh');
    const stack = await svc.addStack({ title: 'Work', actor: quang });
    const item = await svc.addItem({
      stackId: stack.id, title: 'Parent', assigneeIds: [minh.id], actor: quang,
      subtasks: [
        { id: 'owned', title: 'Owned by Quang', completed: false, assigneeId: quang.id },
        { id: 'inherited', title: 'Inherited from parent', completed: false, assigneeId: null },
      ],
    });

    expect(canCompleteTask(item, quang.id)).toBe(false);
    expect(canCompleteTask(item, minh.id)).toBe(true);
    expect(canCompleteTask({ ...item, assigneeIds: [], assigneeId: null }, minh.id)).toBe(false);
    expect(canCompleteTask({ ...item, assigneeIds: [], assigneeId: minh.id }, minh.id)).toBe(false);
    expect(canCompleteTask({ ...item, assigneeIds: [quang.id, minh.id] }, quang.id)).toBe(true);
    expect(canCompleteSubtask(item, item.subtasks[0]!, quang.id)).toBe(true);
    expect(canCompleteSubtask(item, item.subtasks[0]!, minh.id)).toBe(false);
    expect(canCompleteSubtask(item, item.subtasks[1]!, minh.id)).toBe(true);

    await expect(svc.toggleItem(item.id, quang)).rejects.toThrow(/Chỉ người được giao/);
    await expect(svc.updateItem(item.id, { status: 'done' }, quang)).rejects.toThrow(/Chỉ người được giao/);
    await expect(svc.updateItem(item.id, {
      subtasks: item.subtasks.map((sub) => sub.id === 'inherited' ? { ...sub, completed: true } : sub),
    }, quang)).rejects.toThrow(/Chỉ người phụ trách/);
    expect(svc.getSnapshot()!.items.find((entry) => entry.id === item.id)!.completed).toBe(false);

    await svc.updateItem(item.id, {
      subtasks: item.subtasks.map((sub) => sub.id === 'owned'
        ? { ...sub, completed: true, completedByName: 'Forged' } : sub),
    }, quang);
    const afterOwned = svc.getSnapshot()!.items.find((entry) => entry.id === item.id)!;
    expect(afterOwned.subtasks[0]!.completedByName).toBe(quang.name);
    expect(afterOwned.subtasks[0]!.completedById).toBe(quang.id);
    await expect(svc.toggleSubtask(item.id, 'owned', minh)).rejects.toThrow(/Chỉ người phụ trách/);
    const afterInherited = await svc.toggleSubtask(item.id, 'inherited', minh);
    expect(afterInherited.find((sub) => sub.id === 'owned')?.completed).toBe(true);
    expect(afterInherited.find((sub) => sub.id === 'inherited')).toMatchObject({
      completed: true, completedById: minh.id, completedByName: minh.name,
    });
    await svc.toggleItem(item.id, minh);
    expect(svc.getSnapshot()!.items.find((entry) => entry.id === item.id)!.completedById).toBe(minh.id);
    svc.teardownConnections();
  });
});
