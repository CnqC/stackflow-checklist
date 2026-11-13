import type { ProjectStack } from './accountProject';

export type StackPriority = ProjectStack['priority'];
export type StackSort = 'position' | 'priority_high' | 'priority_low';

export const STACK_PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'] as const;
export const STACK_PRIORITY_LABELS: Record<StackPriority, string> = {
  low: 'Thấp', medium: 'Trung bình', high: 'Cao',
};

const priorityRank: Record<StackPriority, number> = { low: 0, medium: 1, high: 2 };

export function sortProjectStacks(stacks: ProjectStack[], sort: StackSort): ProjectStack[] {
  return [...stacks].sort((a, b) => {
    const priorityDifference = priorityRank[a.priority] - priorityRank[b.priority];
    if (sort === 'priority_high' && priorityDifference) return -priorityDifference;
    if (sort === 'priority_low' && priorityDifference) return priorityDifference;
    return a.position - b.position || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
  });
}
