import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectData } from '../../core/domain/accountProject';
import { accountProjectRepository } from './accountProjectRepository';
import { saveV2Item } from './accountV2Actions';

afterEach(() => vi.restoreAllMocks());

describe('V2 drawer writes on account projects', () => {
  it('uses the returned task version before updating assignees', async () => {
    const data = {
      tasks: [{ id: 'task', project_id: 'project', version: 3 }],
      assignees: [{ task_id: 'task', member_id: 'old' }],
      subtasks: [], links: [],
    } as unknown as ProjectData;
    const update = vi.spyOn(accountProjectRepository, 'updateTask').mockResolvedValue(4);
    const assign = vi.spyOn(accountProjectRepository, 'setTaskAssignees').mockResolvedValue(5);

    const version = await saveV2Item(data, 'task', { title: 'Tên mới', assigneeIds: ['new'] }, 3);

    expect(update).toHaveBeenCalledWith('task', 3, { title: 'Tên mới' });
    expect(assign).toHaveBeenCalledWith('task', 4, ['new']);
    expect(version).toBe(5);
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(assign.mock.invocationCallOrder[0]);
  });

  it('rejects a stale drawer draft before writing', async () => {
    const data = {
      tasks: [{ id: 'task', project_id: 'project', version: 4, title: 'Việc' }],
      assignees: [], subtasks: [], links: [],
    } as unknown as ProjectData;
    const update = vi.spyOn(accountProjectRepository, 'updateTask');

    await expect(saveV2Item(data, 'task', { title: 'Tên cũ' }, 3)).rejects.toThrow(/cập nhật ở nơi khác/);
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps drawer IDs when adding subtasks and links', async () => {
    const data = {
      tasks: [{ id: 'task', project_id: 'project', version: 3 }],
      assignees: [], subtasks: [], links: [],
    } as unknown as ProjectData;
    const addSubtask = vi.spyOn(accountProjectRepository, 'addSubtask').mockResolvedValue();
    const addLink = vi.spyOn(accountProjectRepository, 'addTaskLink').mockResolvedValue();

    await saveV2Item(data, 'task', {
      subtasks: [{ id: 'subtask-id', title: 'Bước', completed: false, assigneeId: null }],
      links: [{ id: 'link-id', label: 'Tài liệu', url: 'https://example.com' }],
    }, 3);

    expect(addSubtask).toHaveBeenCalledWith({ id: 'subtask-id', projectId: 'project', taskId: 'task', title: 'Bước', assigneeId: null });
    expect(addLink).toHaveBeenCalledWith('project', 'task', 'Tài liệu', 'https://example.com', 'link-id');
  });

  it('does not bump a task version when the V2 drawer saves unchanged fields', async () => {
    const data = {
      tasks: [{ id: 'task', project_id: 'project', version: 3, title: 'Việc', notes: '', status: 'todo', priority: 'medium', due_date: null, stack_id: 'stack' }],
      assignees: [], subtasks: [], links: [],
    } as unknown as ProjectData;
    const update = vi.spyOn(accountProjectRepository, 'updateTask');
    await saveV2Item(data, 'task', {
      title: 'Việc', notes: '', status: 'todo', priority: 'medium', dueDate: null, stackId: 'stack',
    });
    expect(update).not.toHaveBeenCalled();
  });
});
