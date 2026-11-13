import { getSupabaseClient } from '../../services/supabaseConfig';

export class TaskVersionConflictError extends Error {
  constructor() {
    super('Task đã được người khác thay đổi. Tải lại dữ liệu trước khi thử lại.');
    this.name = 'TaskVersionConflictError';
  }
}

function requireClient() {
  const client = getSupabaseClient();
  if (!client) throw new Error('Chưa cấu hình Supabase.');
  return client;
}

function unwrapVersion(data: unknown, error: { code?: string; message: string } | null): number {
  if (error?.code === '40001') throw new TaskVersionConflictError();
  if (error) throw new Error(error.message);
  if (typeof data !== 'number' || !Number.isSafeInteger(data) || data < 1) {
    throw new Error('Server không trả về version task hợp lệ.');
  }
  return data;
}

export const secureTaskRepository = {
  async toggleTask(itemId: string, expectedVersion: number): Promise<number> {
    const { data, error } = await requireClient().rpc('toggle_account_task', {
      p_item_id: itemId,
      p_expected_version: expectedVersion,
    });
    return unwrapVersion(data, error);
  },

  async toggleSubtask(itemId: string, subtaskId: string, expectedVersion: number): Promise<number> {
    const { data, error } = await requireClient().rpc('toggle_account_subtask', {
      p_item_id: itemId,
      p_subtask_id: subtaskId,
      p_expected_version: expectedVersion,
    });
    return unwrapVersion(data, error);
  },
};
