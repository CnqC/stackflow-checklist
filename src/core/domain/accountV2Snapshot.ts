import type { ProjectData } from './accountProject';
import type { ActivityLog, WorkspaceSnapshot } from '../../types/models';

/** Read model for the original V2 board. Account data remains authoritative on the server. */
export function toV2WorkspaceSnapshot(data: ProjectData): WorkspaceSnapshot {
  const members = data.members.filter((member) => member.active).map((member) => ({
    id: member.id,
    workspaceId: data.project.id,
    name: member.display_name,
    role: member.job_title || (member.access_role === 'owner' ? 'Chủ dự án' : 'Thành viên'),
    color: '#6366f1',
    avatar: member.display_name.slice(0, 2).toUpperCase(),
    createdAt: '',
  }));
  const memberNames = new Map(members.map((member) => [member.id, member.name]));
  return {
    workspace: {
      id: data.project.id,
      code: data.project.code,
      name: data.project.name,
      description: data.project.description,
      pinCode: '',
      maxMembers: 20,
      createdAt: '',
      updatedAt: '',
    },
    members,
    stacks: [...data.stacks].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)).map((stack) => ({
      id: stack.id,
      workspaceId: stack.project_id,
      title: stack.title,
      description: stack.description,
      color: stack.color,
      position: stack.position,
      sequentialLock: stack.sequential_lock,
      collapsed: stack.collapsed,
      createdAt: stack.created_at,
      updatedAt: stack.created_at,
    })),
    items: [...data.tasks].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)).map((task) => {
      const assigneeIds = data.assignees.filter((entry) => entry.task_id === task.id).map((entry) => entry.member_id);
      return {
        id: task.id,
        version: task.version,
        workspaceId: task.project_id,
        stackId: task.stack_id,
        title: task.title,
        notes: task.notes,
        status: task.status,
        priority: task.priority,
        completed: task.completed,
        assigneeId: assigneeIds[0] ?? null,
        assigneeIds,
        dueDate: task.due_date,
        position: task.position,
        subtasks: data.subtasks.filter((subtask) => subtask.task_id === task.id).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)).map((subtask) => ({
          id: subtask.id,
          title: subtask.title,
          completed: subtask.completed,
          assigneeId: subtask.assignee_member_id,
          completedById: subtask.completed_by_member_id,
          completedByName: subtask.completed_by_member_id ? memberNames.get(subtask.completed_by_member_id) ?? null : null,
        })),
        links: data.links.filter((link) => link.task_id === task.id).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)).map((link) => ({ id: link.id, label: link.label, url: link.url })),
        completedById: task.completed_by_member_id,
        completedByName: task.completed_by_member_id ? memberNames.get(task.completed_by_member_id) ?? null : null,
        completedAt: null,
        updatedByName: null,
        createdAt: task.created_at,
        updatedAt: task.created_at,
      };
    }),
    activities: data.activities.map((activity): ActivityLog => ({
      id: activity.id,
      workspaceId: activity.project_id,
      actorId: null,
      actorName: activity.actor_name,
      actorColor: '#6366f1',
      actionType: activity.action_type as ActivityLog['actionType'],
      targetTitle: activity.target_title,
      detail: activity.detail,
      createdAt: activity.created_at,
    })),
  };
}
