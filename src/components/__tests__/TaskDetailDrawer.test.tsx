import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskDetailDrawer } from '../TaskDetailDrawer';
import type { ChecklistItem, Member } from '../../types/models';

afterEach(cleanup);

const member = {
  id: 'member', workspaceId: 'project', name: 'An', role: 'member',
  color: '#6366f1', avatar: 'A', createdAt: '',
} satisfies Member;

const item = {
  id: 'task', version: 3, workspaceId: 'project', stackId: 'stack',
  title: 'Việc', notes: '', status: 'todo', priority: 'medium', completed: false,
  assigneeId: 'member', assigneeIds: ['member'], dueDate: null, position: 0,
  subtasks: [{ id: 'existing', title: 'Bước cũ', completed: false, assigneeId: null }],
  links: [], completedById: null, completedByName: null, completedAt: null,
  updatedByName: null, createdAt: '', updatedAt: '',
} satisfies ChecklistItem;

describe('Task drawer write order', () => {
  it('waits for a pending subtask save before toggling another subtask', async () => {
    let finishSave: ((version: number) => void) | undefined;
    const onSaveItem = vi.fn(() => new Promise<number>((resolve) => { finishSave = resolve; }));
    const onToggleSubtask = vi.fn(async () => [
      { ...item.subtasks[0], completed: true },
    ]);
    render(<TaskDetailDrawer item={item} stacks={[]} members={[member]} currentMember={member}
      onClose={vi.fn()} onSaveItem={onSaveItem} onToggleSubtask={onToggleSubtask}
      onDeleteItem={vi.fn()} onMoveItem={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('Nhập bước nhỏ...'), { target: { value: 'Bước mới' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    await waitFor(() => expect(onSaveItem).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu xong bước nhỏ Bước cũ' }));
    expect(onToggleSubtask).not.toHaveBeenCalled();

    finishSave?.(4);
    await waitFor(() => expect(onToggleSubtask).toHaveBeenCalledWith('task', 'existing'));
    expect(screen.getByText('Bước mới')).toBeTruthy();
  });
});
