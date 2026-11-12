import type { AppNotice, WorkspaceSnapshot } from '../../types/models';

/** Resolve current stack data for a notice without persisting another stack name. */
export function resolveNoticeStackTitle(
  notice: AppNotice,
  snapshot: WorkspaceSnapshot,
): string | null {
  if (notice.workspaceId !== snapshot.workspace.id) return null;
  const stackId = snapshot.items.find((item) => item.id === notice.taskId)?.stackId;
  return snapshot.stacks.find((stack) => stack.id === stackId)?.title ?? null;
}
