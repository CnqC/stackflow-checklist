import { describe, expect, it } from 'vitest';
import type { ProjectActivity, ProjectNotice } from '../accountProject';
import { createSeedWorkspaceSnapshot } from '../stackDomain';
import {
  buildProjectActivityNotices,
  describeProjectActivityVi,
} from '../projectActivityNoticeEngine';
import { sanitizeNotificationPreferences } from '../notificationPreferences';

describe('projectActivityNoticeEngine — All Project Actions -> Notices & Vietnamese Labels', () => {
  it('translates raw PostgreSQL activity actions and status transitions into friendly Vietnamese', () => {
    expect(describeProjectActivityVi('create_task', '')).toMatchObject({
      badgeLabel: 'Việc mới',
      detailVi: 'Vừa thêm đầu việc mới',
    });
    expect(describeProjectActivityVi('create_stack', '')).toMatchObject({
      badgeLabel: 'Stack mới',
      detailVi: 'Vừa tạo tầng Stack mới',
    });
    expect(describeProjectActivityVi('create_subtask', '')).toMatchObject({
      badgeLabel: 'Việc nhỏ mới',
      detailVi: 'Vừa thêm phần việc nhỏ',
    });
    expect(describeProjectActivityVi('check', '')).toMatchObject({
      badgeLabel: 'Hoàn thành',
      detailVi: 'Đã đánh dấu hoàn thành',
    });
    expect(describeProjectActivityVi('update_task', 'todo → doing').detailVi).toContain('Đang làm');
  });

  it('converts new project activities (add task, add stack, check, join) into AppNotices and links taskId', () => {
    const snapshot = createSeedWorkspaceSnapshot('PARTNER-01', 'Dự Án Đối Tác');
    const targetTask = snapshot.items[0]!;
    const activities: ProjectActivity[] = [
      {
        id: 'act-task-1',
        project_id: snapshot.workspace.id,
        actor_user_id: 'user-partner',
        actor_name: 'Minh Đối Tác',
        action_type: 'create_task',
        target_title: targetTask.title,
        detail: '',
        created_at: '2026-11-16T12:00:00.000Z',
      },
      {
        id: 'act-stack-1',
        project_id: snapshot.workspace.id,
        actor_user_id: 'user-self',
        actor_name: 'Cao Nhật Quang',
        action_type: 'create_stack',
        target_title: 'Giai đoạn Bàn giao',
        detail: '',
        created_at: '2026-11-16T12:01:00.000Z',
      },
    ];

    const notices = buildProjectActivityNotices({
      activities,
      serverNotices: [],
      snapshot,
      actorMemberId: snapshot.members[0]!.id,
      actorUserId: 'user-self',
      includeSelfActions: true,
    });

    expect(notices).toHaveLength(2);
    expect(notices[0]).toMatchObject({
      id: 'activity:act-task-1',
      kind: 'project_activity',
      activityAction: 'create_task',
      taskId: targetTask.id,
      taskTitle: targetTask.title,
      isSelfAction: false,
      read: false,
    });
    expect(notices[1]).toMatchObject({
      id: 'activity:act-stack-1',
      kind: 'project_activity',
      activityAction: 'create_stack',
      taskId: '',
      taskTitle: 'Giai đoạn Bàn giao',
      isSelfAction: true,
    });
  });

  it('deduplicates create_task activity when a direct task_assigned notice already exists for the same task', () => {
    const snapshot = createSeedWorkspaceSnapshot();
    const targetTask = snapshot.items[0]!;
    const recipientMemberId = snapshot.members[1]!.id;

    const serverNotices: ProjectNotice[] = [
      {
        id: 'srv-assign-1',
        project_id: snapshot.workspace.id,
        recipient_member_id: recipientMemberId,
        actor_name: 'Cao Nhật Quang',
        kind: 'task_assigned',
        taskId: targetTask.id,
        task_id: targetTask.id,
        task_title: targetTask.title,
        subtask_title: null,
        created_at: '2026-11-16T12:05:00.000Z',
        read_at: null,
      } as ProjectNotice,
    ];

    const activities: ProjectActivity[] = [
      {
        id: 'act-dup-1',
        project_id: snapshot.workspace.id,
        actor_user_id: 'user-quang',
        actor_name: 'Cao Nhật Quang',
        action_type: 'create_task',
        target_title: targetTask.title,
        detail: '',
        created_at: '2026-11-16T12:05:01.000Z',
      },
    ];

    const notices = buildProjectActivityNotices({
      activities,
      serverNotices,
      snapshot,
      actorMemberId: recipientMemberId,
      actorUserId: 'user-minh',
      includeSelfActions: true,
    });

    expect(notices).toHaveLength(0);
  });

  it('defaults activityAlertsEnabled and selfActionFeedbackEnabled to true while preserving soundId notify-1', () => {
    const prefs = sanitizeNotificationPreferences({});
    expect(prefs).toMatchObject({
      soundEnabled: true,
      soundId: 'notify-1',
      activityAlertsEnabled: true,
      selfActionFeedbackEnabled: true,
    });
  });
});
