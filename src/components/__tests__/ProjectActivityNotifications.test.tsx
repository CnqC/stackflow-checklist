import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectActivity, ProjectData } from '../../core/domain/accountProject';
import { toV2WorkspaceSnapshot } from '../../core/domain/accountV2Snapshot';
import { useAccountNoticeBridge } from '../../infrastructure/notifications/accountNoticeBridge';
import type { AppNotice } from '../../types/models';
import { useState } from 'react';
import { DeviceNotificationSettings } from '../DeviceNotificationSettings';
import { LiveNoticeToast } from '../LiveNoticeToast';
import { NotificationBell } from '../NotificationBell';

vi.mock('../../infrastructure/projects/accountProjectRepository', () => ({
  accountProjectRepository: {
    markNoticeRead: vi.fn().mockResolvedValue(undefined),
  },
}));

function buildProjectFixture(activities: ProjectActivity[]): ProjectData {
  const projectId = '00000000-0000-4000-8000-000000000077';
  return {
    project: {
      id: projectId,
      code: 'LIVE-BELL',
      name: 'Dự Án Chuông Trực Tiếp',
      description: '',
      version: 1,
      accessRole: 'owner',
    },
    members: [
      {
        id: 'mem-quang',
        project_id: projectId,
        user_id: 'user-quang',
        display_name: 'Cao Nhật Quang',
        job_title: 'Chủ dự án',
        avatar_color: '#6366f1',
        access_role: 'owner',
        active: true,
      },
      {
        id: 'mem-partner',
        project_id: projectId,
        user_id: 'user-partner',
        display_name: 'Minh Đối Tác',
        job_title: 'Đối tác',
        avatar_color: '#10b981',
        access_role: 'member',
        active: true,
      },
    ],
    stacks: [
      {
        id: 'stack-1',
        project_id: projectId,
        title: 'Stack 1 — Chuẩn bị Ra Mắt',
        description: '',
        color: '#6366f1',
        priority: 'high',
        position: 0,
        sequential_lock: false,
        collapsed: false,
        version: 1,
        created_at: '2026-11-16T10:00:00Z',
      },
    ],
    tasks: [
      {
        id: 'task-new-1',
        project_id: projectId,
        stack_id: 'stack-1',
        title: 'Chốt hợp đồng cùng đối tác',
        notes: '',
        status: 'todo',
        priority: 'high',
        completed: false,
        due_date: null,
        position: 0,
        created_by_member_id: 'mem-partner',
        completed_by_member_id: null,
        version: 1,
        created_at: '2026-11-16T12:00:00Z',
      },
    ],
    assignees: [],
    subtasks: [],
    links: [],
    activities,
    notices: [],
  };
}

function Harness({
  data,
  onOpenTask,
}: {
  data: ProjectData;
  onOpenTask: (taskId: string) => void;
}) {
  const [liveNotice, setLiveNotice] = useState<AppNotice | null>(null);
  const snapshot = toV2WorkspaceSnapshot(data);
  useAccountNoticeBridge({
    projectId: data.project.id,
    actorMemberId: 'mem-quang',
    actorUserId: 'user-quang',
    serverNotices: data.notices,
    activities: data.activities,
    v2Snapshot: snapshot,
    onOpenTask,
    onLiveNotice: setLiveNotice,
  });

  return (
    <div>
      <LiveNoticeToast
        notice={liveNotice}
        onDismiss={() => setLiveNotice(null)}
        onOpenTask={(taskId) => onOpenTask(taskId)}
      />
      <NotificationBell
        snapshot={snapshot}
        memberId="mem-quang"
        memberName="Cao Nhật Quang"
        onOpenTask={onOpenTask}
      />
      <DeviceNotificationSettings
        snapshot={snapshot}
        memberId="mem-quang"
        syncMode="supabase"
      />
    </div>
  );
}

describe('Project Activity Notifications, Sound Chime & Live Toast E2E', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('stays silent on initial load, then rings chime + shows Live Toast + updates Bell on new task/stack actions', async () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const onOpenTask = vi.fn();

    try {
      const oldActivity: ProjectActivity = {
        id: 'act-old-0',
        project_id: '00000000-0000-4000-8000-000000000077',
        actor_user_id: 'user-quang',
        actor_name: 'Cao Nhật Quang',
        action_type: 'create_stack',
        target_title: 'Stack 1 — Chuẩn bị Ra Mắt',
        detail: '',
        created_at: '2026-11-16T10:00:00Z',
      };

      const { rerender } = render(
        <Harness data={buildProjectFixture([oldActivity])} onOpenTask={onOpenTask} />,
      );

      // Silent on initial load
      expect(playSpy).toHaveBeenCalledTimes(0);

      // Partner adds a new task -> Realtime pushes new activity row
      const freshTaskActivity: ProjectActivity = {
        id: 'act-live-1',
        project_id: '00000000-0000-4000-8000-000000000077',
        actor_user_id: 'user-partner',
        actor_name: 'Minh Đối Tác',
        action_type: 'create_task',
        target_title: 'Chốt hợp đồng cùng đối tác',
        detail: '',
        created_at: '2026-11-16T12:00:05Z',
      };

      rerender(
        <Harness
          data={buildProjectFixture([freshTaskActivity, oldActivity])}
          onOpenTask={onOpenTask}
        />,
      );

      await waitFor(() => {
        expect(playSpy).toHaveBeenCalledTimes(1);
        expect(screen.getByText(/Minh Đối Tác vừa thêm đầu việc mới/i)).toBeTruthy();
        expect(
          screen.getByRole('button', { name: /Thông báo việc mới \(1 chưa đọc\)/i }),
        ).toBeTruthy();
      });

      // Open NotificationBell -> click the new task notice -> opens TaskDetailDrawer
      fireEvent.click(
        screen.getByRole('button', { name: /Thông báo việc mới \(1 chưa đọc\)/i }),
      );
      expect(screen.getByText('Việc mới')).toBeTruthy();
      fireEvent.click(screen.getByText('Chốt hợp đồng cùng đối tác').closest('button')!);
      expect(onOpenTask).toHaveBeenCalledWith('task-new-1');

      // Test the 1-click "Bắn thử thông báo & nghe tiếng chuông ngay" button
      fireEvent.click(
        screen.getByRole('button', { name: /Bắn thử thông báo & nghe tiếng chuông ngay/i }),
      );
      await waitFor(() => {
        expect(playSpy).toHaveBeenCalledTimes(2);
      });
    } finally {
      playSpy.mockRestore();
      pauseSpy.mockRestore();
    }
  });
});
