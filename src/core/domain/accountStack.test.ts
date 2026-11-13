import { describe, expect, it } from 'vitest';
import { sortProjectStacks } from './accountStack';
import type { ProjectStack } from './accountProject';

const makeStack = (id: string, position: number, priority: ProjectStack['priority']): ProjectStack => ({
  id, project_id: 'project', title: id, description: '', color: '#6366f1',
  position, priority, sequential_lock: false, collapsed: false, version: 1, created_at: '2026-01-01',
});

describe('Stack sorting', () => {
  const stacks = [makeStack('low', 0, 'low'), makeStack('medium', 1, 'medium'), makeStack('high', 2, 'high')];

  it('keeps saved positions for manual order', () => {
    expect(sortProjectStacks(stacks, 'position').map((stack) => stack.id)).toEqual(['low', 'medium', 'high']);
  });

  it('sorts by priority without changing saved positions', () => {
    expect(sortProjectStacks(stacks, 'priority_high').map((stack) => stack.id)).toEqual(['high', 'medium', 'low']);
    expect(sortProjectStacks(stacks, 'priority_low').map((stack) => stack.id)).toEqual(['low', 'medium', 'high']);
    expect(stacks.map((stack) => stack.position)).toEqual([0, 1, 2]);
  });

  it('uses manual order when two Stacks have the same priority', () => {
    const samePriority = [makeStack('second', 2, 'high'), makeStack('first', 0, 'high')];
    expect(sortProjectStacks(samePriority, 'priority_high').map((stack) => stack.id)).toEqual(['first', 'second']);
  });
});
