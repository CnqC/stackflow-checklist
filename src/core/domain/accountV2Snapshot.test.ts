import { describe, expect, it } from 'vitest';
import { toV2WorkspaceSnapshot } from './accountV2Snapshot';
import type { ProjectData } from './accountProject';

describe('V2 board account read model', () => {
  it('keeps Stack, task, assignee, subtask and link IDs while hiding PIN', () => {
    const projectId = 'project';
    const data: ProjectData = {
      project: { id: projectId, code: 'TEAM', name: 'Dự án', description: '', version: 1, accessRole: 'owner' },
      members: [{ id: 'member', project_id: projectId, user_id: 'user', display_name: 'Quang', job_title: '', access_role: 'owner', active: true }],
      stacks: [{ id: 'stack', project_id: projectId, title: 'Giai đoạn', description: 'Mục tiêu', color: '#6366f1', position: 2, priority: 'high', sequential_lock: true, collapsed: false, version: 1, created_at: '' }],
      tasks: [{ id: 'task', project_id: projectId, stack_id: 'stack', title: 'Việc', notes: '', status: 'todo', priority: 'high', completed: false, due_date: null, position: 0, created_by_member_id: 'member', completed_by_member_id: null, version: 3, created_at: '' }],
      assignees: [{ project_id: projectId, task_id: 'task', member_id: 'member' }],
      subtasks: [{ id: 'subtask', project_id: projectId, task_id: 'task', title: 'Bước', position: 0, assignee_member_id: 'member', completed: false, completed_by_member_id: null, version: 1 }],
      links: [{ id: 'link', project_id: projectId, task_id: 'task', label: 'Tài liệu', url: 'https://example.com', position: 0, version: 1 }],
      activities: [], notices: [],
    };
    const snapshot = toV2WorkspaceSnapshot(data);
    expect(snapshot.workspace.pinCode).toBe('');
    expect(snapshot.stacks[0]).toMatchObject({ id: 'stack', position: 2, sequentialLock: true });
    expect(snapshot.items[0]).toMatchObject({ id: 'task', version: 3, assigneeIds: ['member'] });
    expect(snapshot.items[0].subtasks[0]).toMatchObject({ id: 'subtask', assigneeId: 'member' });
    expect(snapshot.items[0].links[0]).toMatchObject({ id: 'link' });
  });

  it('orders tasks by saved position for the V2 sequential lock', () => {
    const data = {
      project: { id: 'project', code: 'TEAM', name: 'Dự án', description: '', version: 1, accessRole: 'owner' },
      members: [], stacks: [], assignees: [], subtasks: [], links: [], activities: [], notices: [],
      tasks: [
        { id: 'second', project_id: 'project', stack_id: 'stack', position: 1, created_at: '2026-01-01' },
        { id: 'first', project_id: 'project', stack_id: 'stack', position: 0, created_at: '2026-01-01' },
      ],
    } as unknown as ProjectData;
    expect(toV2WorkspaceSnapshot(data).items.map((item) => item.id)).toEqual(['first', 'second']);
  });
});
