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
    const assign = vi.spyOn(accountProjectRepository, 'setTaskAssignees').mockResolvedValue();

    await saveV2Item(data, 'task', { title: 'Tên mới', assigneeIds: ['new'] });

    expect(update).toHaveBeenCalledWith('task', 3, { title: 'Tên mới' });
    expect(assign).toHaveBeenCalledWith('task', 4, ['new']);
    expect(update.mock.invocationCallOrder[0]).toBeLessThan(assign.mock.invocationCallOrder[0]);
  });
});
