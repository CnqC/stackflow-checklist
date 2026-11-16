import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectData, ProjectTable } from '../../core/domain/accountProject';
import { domainEventBus } from '../../core/events/domainEventBus';
import { notificationSoundService } from '../../infrastructure/notifications/notificationSoundService';
import { ProjectWorkspace } from '../account/ProjectWorkspace';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const STACK_ID = '22222222-2222-4222-8222-222222222222';
const TASK_ID = '33333333-3333-4333-8333-333333333333';

let currentProjectState: ProjectData;
let realtimeListener: ((table: ProjectTable) => void) | null = null;

vi.mock('../../infrastructure/projects/accountProjectRepository', () => ({
  VersionConflictError: class VersionConflictError extends Error {},
  accountProjectRepository: {
    loadProject: vi.fn(async () => structuredClone(currentProjectState)),
    loadTable: vi.fn(async (_pid: string, table: ProjectTable) => structuredClone(currentProjectState[table])),
    subscribe: vi.fn((_pid: string, onChange: (table: ProjectTable) => void) => {
      realtimeListener = onChange;
      return () => { realtimeListener = null; };
    }),
    notifyProjectMutated: vi.fn(),
    markNoticeRead: vi.fn(async () => undefined),
    updateStack: vi.fn(async () => undefined),
    updateTask: vi.fn(async () => 2),
    addTask: vi.fn(async () => undefined),
  },
}));

vi.mock('../../infrastructure/projects/accountTeamInviteRepository', () => ({
  accountTeamInviteRepository: {
    subscribePresence: vi.fn(() => () => undefined),
    getJoinLink: vi.fn(),
    listPendingInvitations: vi.fn(async () => []),
  },
}));

function buildBaseProjectData(): ProjectData {
  return {
    project: {
      id: PROJECT_ID, code: 'SF-TEAM', name: 'Dự Án Đồng Bộ Nhóm',
      description: 'Kiểm thử liên kết toàn diện 2 tài khoản', version: 1, accessRole: 'member',
    },
    members: [
      {
        id: 'm-quang', project_id: PROJECT_ID, user_id: 'u-quang',
        display_name: 'Cao Nhật Quang', job_title: 'Lead', avatar_color: '#6366f1', access_role: 'owner', active: true,
      },
      {
        id: 'm-minh', project_id: PROJECT_ID, user_id: 'u-minh',
        display_name: 'Minh Đối Tác', job_title: 'Frontend', avatar_color: '#10b981', access_role: 'member', active: true,
      },
    ],
    stacks: [{
      id: STACK_ID, project_id: PROJECT_ID, title: 'UI/UX Chính', description: '',
      color: '#6366f1', priority: 'high', position: 0, sequential_lock: false,
      collapsed: false, version: 1, created_at: '2026-11-16T08:00:00.000Z',
    }],
    tasks: [], assignees: [], subtasks: [], links: [], activities: [], notices: [],
  };
}

describe('Two-Account Synchronized Task Assignment & Live Activity Feed', () => {
  beforeEach(() => {
    window.localStorage.clear();
    domainEventBus.clear();
    currentProjectState = buildBaseProjectData();
    realtimeListener = null;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('atomically updates tasks, Việc của tôi counter, Hoạt động trực tiếp, Bell badge, Live Toast, and chime when Account 1 assigns Account 2', async () => {
    const playChimeSpy = vi.spyOn(notificationSoundService, 'playForNotice').mockImplementation(() => undefined);

    render(
      <ProjectWorkspace
        projectId={PROJECT_ID}
        identity={{ id: 'u-minh', email: 'minh@example.com', name: 'Minh Đối Tác' }}
        onBack={() => undefined}
        onSignOut={() => undefined}
        onSettings={() => undefined}
      />,
    );

    await screen.findAllByText('Dự Án Đồng Bộ Nhóm');
    expect(screen.getByRole('button', { name: 'Việc của tôi (0)' })).toBeTruthy();
    expect(screen.getByText('Chưa có hoạt động nào được ghi nhận.')).toBeTruthy();

    const nowIso = new Date().toISOString();
    currentProjectState = {
      ...currentProjectState,
      tasks: [{
        id: TASK_ID, project_id: PROJECT_ID, stack_id: STACK_ID,
        title: 'Thiết kế màn hình chính V3', notes: 'Đồng bộ 1:1 theo thiết kế',
        status: 'todo', priority: 'high', completed: false, due_date: null, position: 0,
        created_by_member_id: 'm-quang', completed_by_member_id: null, version: 1, created_at: nowIso,
      }],
      assignees: [{ task_id: TASK_ID, member_id: 'm-minh', project_id: PROJECT_ID }],
      activities: [{
        id: 'act-create-1', project_id: PROJECT_ID, actor_user_id: 'u-quang', actor_name: 'Cao Nhật Quang',
        action_type: 'create_task', target_title: 'Thiết kế màn hình chính V3',
        detail: 'Trong UI/UX Chính · Giao cho: Minh Đối Tác', created_at: nowIso,
      }],
      notices: [{
        id: 'notice-assign-1', project_id: PROJECT_ID, recipient_member_id: 'm-minh',
        actor_name: 'Cao Nhật Quang', kind: 'task_assigned', task_id: TASK_ID,
        task_title: 'Thiết kế màn hình chính V3', subtask_title: null, created_at: nowIso, read_at: null,
      }],
    };

    act(() => { realtimeListener?.('project'); });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Việc của tôi (1)' })).toBeTruthy();
      expect(screen.getByText(/vừa giao việc mới cho bạn/i)).toBeTruthy();
      expect(screen.getByRole('button', { name: /Thông báo việc mới \(1 chưa đọc\)/i })).toBeTruthy();
    });

    expect(screen.getAllByText(/Thiết kế màn hình chính V3/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Cao Nhật Quang').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Vừa tạo task • Trong UI\/UX Chính · Giao cho: Minh Đối Tác/)).toBeTruthy();
    expect(playChimeSpy).toHaveBeenCalledWith(PROJECT_ID, 'm-minh');
  });

  it('alerts recipient immediately on first project entry if an unread assignment arrived while away', async () => {
    const playChimeSpy = vi.spyOn(notificationSoundService, 'playForNotice').mockImplementation(() => undefined);
    const nowIso = new Date().toISOString();
    currentProjectState = {
      ...buildBaseProjectData(),
      tasks: [{
        id: TASK_ID, project_id: PROJECT_ID, stack_id: STACK_ID,
        title: 'Kiểm tra báo cáo đối tác', notes: '', status: 'todo', priority: 'medium',
        completed: false, due_date: null, position: 0, created_by_member_id: 'm-quang',
        completed_by_member_id: null, version: 1, created_at: nowIso,
      }],
      assignees: [{ task_id: TASK_ID, member_id: 'm-minh', project_id: PROJECT_ID }],
      notices: [{
        id: 'notice-offline-1', project_id: PROJECT_ID, recipient_member_id: 'm-minh',
        actor_name: 'Cao Nhật Quang', kind: 'task_assigned', task_id: TASK_ID,
        task_title: 'Kiểm tra báo cáo đối tác', subtask_title: null, created_at: nowIso, read_at: null,
      }],
    };

    render(
      <ProjectWorkspace
        projectId={PROJECT_ID}
        identity={{ id: 'u-minh', email: 'minh@example.com', name: 'Minh Đối Tác' }}
        onBack={() => undefined}
        onSignOut={() => undefined}
        onSettings={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/vừa giao/i)).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: /Thông báo việc mới \(1 chưa đọc\)/i })).toBeTruthy();
    expect(playChimeSpy).toHaveBeenCalledWith(PROJECT_ID, 'm-minh');
  });
});
