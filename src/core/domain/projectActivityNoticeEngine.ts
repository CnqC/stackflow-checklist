import type { ProjectActivity, ProjectNotice } from './accountProject';
import type { AppNotice, WorkspaceSnapshot } from '../../types/models';

export interface ActivityPresentationVi {
  badgeLabel: string;
  verbVi: string;
  detailVi: string;
}

const STATUS_LABELS_VI: Record<string, string> = {
  todo: 'Chưa làm',
  doing: 'Đang làm',
  blocked: 'Đang kẹt',
  done: 'Hoàn thành',
};

function formatStatusTransitionVi(rawDetail: string): string {
  const parts = rawDetail.split('→').map((p) => p.trim());
  if (parts.length !== 2) return rawDetail.trim() || 'Đổi trạng thái công việc';
  const from = STATUS_LABELS_VI[parts[0]!] ?? parts[0]!;
  const to = STATUS_LABELS_VI[parts[1]!] ?? parts[1]!;
  return `Chuyển tiến độ: ${from} → ${to}`;
}

export function describeProjectActivityVi(
  rawAction: string,
  rawDetail: string = '',
): ActivityPresentationVi {
  const cleanDetail = rawDetail.trim();
  switch (rawAction) {
    case 'create_task':
      return {
        badgeLabel: 'Việc mới',
        verbVi: cleanDetail ? `vừa tạo task mới (${cleanDetail})` : 'vừa thêm đầu việc mới',
        detailVi: cleanDetail ? `Vừa tạo task • ${cleanDetail}` : 'Vừa thêm đầu việc mới',
      };
    case 'create_subtask':
      return {
        badgeLabel: 'Việc nhỏ mới',
        verbVi: cleanDetail ? `vừa thêm phần việc nhỏ (${cleanDetail})` : 'vừa thêm phần việc nhỏ',
        detailVi: cleanDetail ? `Thêm việc nhỏ • ${cleanDetail}` : 'Vừa thêm phần việc nhỏ',
      };
    case 'create_stack':
      return {
        badgeLabel: 'Stack mới',
        verbVi: 'vừa tạo tầng Stack mới',
        detailVi: cleanDetail || 'Vừa tạo tầng Stack mới',
      };
    case 'check':
      return {
        badgeLabel: 'Hoàn thành',
        verbVi: 'đã hoàn thành công việc',
        detailVi: cleanDetail || 'Đã đánh dấu hoàn thành',
      };
    case 'uncheck':
      return {
        badgeLabel: 'Mở lại việc',
        verbVi: 'đã mở lại đầu việc',
        detailVi: cleanDetail || 'Mở lại đầu việc chưa xong',
      };
    case 'update_task':
      if (cleanDetail.includes('→')) {
        const formatted = formatStatusTransitionVi(cleanDetail);
        return {
          badgeLabel: 'Đổi tiến độ',
          verbVi: formatted.toLowerCase(),
          detailVi: formatted,
        };
      }
      return {
        badgeLabel: 'Cập nhật việc',
        verbVi: 'vừa cập nhật đầu việc',
        detailVi: cleanDetail || 'Cập nhật chi tiết đầu việc',
      };
    case 'update_subtask':
      return {
        badgeLabel: 'Việc nhỏ',
        verbVi: 'vừa cập nhật phần việc nhỏ',
        detailVi: cleanDetail || 'Cập nhật phần việc nhỏ',
      };
    case 'update_stack':
      return {
        badgeLabel: 'Cập nhật Stack',
        verbVi: 'vừa cập nhật tầng Stack',
        detailVi: cleanDetail || 'Cập nhật thông tin Stack',
      };
    case 'delete_task':
      return {
        badgeLabel: 'Xóa việc',
        verbVi: 'đã xóa đầu việc',
        detailVi: cleanDetail || 'Đã xóa đầu việc',
      };
    case 'delete_subtask':
      return {
        badgeLabel: 'Xóa việc nhỏ',
        verbVi: 'đã xóa phần việc nhỏ',
        detailVi: cleanDetail || 'Đã xóa phần việc nhỏ',
      };
    case 'delete_stack':
      return {
        badgeLabel: 'Xóa Stack',
        verbVi: 'đã xóa tầng Stack',
        detailVi: cleanDetail || 'Đã xóa tầng Stack',
      };
    case 'join_member':
      return {
        badgeLabel: 'Thành viên mới',
        verbVi: 'vừa tham gia dự án',
        detailVi: cleanDetail || 'Vừa tham gia dự án',
      };
    default:
      return {
        badgeLabel: 'Hoạt động mới',
        verbVi: 'vừa cập nhật dự án',
        detailVi: cleanDetail || 'Cập nhật mới trong dự án',
      };
  }
}

function resolveTaskIdForActivity(
  activity: ProjectActivity,
  snapshot: WorkspaceSnapshot,
): { taskId: string; parentTaskTitle?: string } {
  const normalizedTarget = activity.target_title.trim();
  if (!normalizedTarget) return { taskId: '' };

  if (
    activity.action_type === 'create_subtask' ||
    activity.action_type === 'update_subtask'
  ) {
    for (const item of snapshot.items) {
      if (item.subtasks.some((sub) => sub.title.trim() === normalizedTarget)) {
        return { taskId: item.id, parentTaskTitle: item.title };
      }
    }
  }

  if (
    activity.action_type === 'create_task' ||
    activity.action_type === 'update_task' ||
    activity.action_type === 'check' ||
    activity.action_type === 'uncheck'
  ) {
    const matched = snapshot.items.find((item) => item.title.trim() === normalizedTarget);
    if (matched) return { taskId: matched.id };
  }

  return { taskId: '' };
}

function hasSimultaneousDirectAssignment(
  activity: ProjectActivity,
  serverNotices: readonly ProjectNotice[],
  actorMemberId: string,
): boolean {
  if (
    activity.action_type !== 'create_task' &&
    activity.action_type !== 'create_subtask' &&
    activity.action_type !== 'update_task' &&
    activity.action_type !== 'update_subtask'
  ) {
    return false;
  }
  const actMs = Date.parse(activity.created_at);
  return serverNotices.some((notice) => {
    if (notice.recipient_member_id !== actorMemberId) return false;
    const matchesTitle =
      notice.task_title.trim() === activity.target_title.trim() ||
      notice.subtask_title?.trim() === activity.target_title.trim();
    if (!matchesTitle) return false;
    const noticeMs = Date.parse(notice.created_at);
    if (Number.isNaN(actMs) || Number.isNaN(noticeMs)) return true;
    return Math.abs(actMs - noticeMs) <= 8000;
  });
}

export function buildProjectActivityNotices(params: {
  activities: readonly ProjectActivity[];
  serverNotices: readonly ProjectNotice[];
  snapshot: WorkspaceSnapshot;
  actorMemberId: string;
  actorUserId: string | null;
  includeSelfActions: boolean;
}): AppNotice[] {
  const { activities, serverNotices, snapshot, actorMemberId, actorUserId, includeSelfActions } = params;
  if (!actorMemberId) return [];

  const result: AppNotice[] = [];
  for (const activity of activities) {
    const isSelf = Boolean(actorUserId && activity.actor_user_id === actorUserId);
    if (isSelf && !includeSelfActions) continue;
    if (hasSimultaneousDirectAssignment(activity, serverNotices, actorMemberId)) continue;

    const desc = describeProjectActivityVi(activity.action_type, activity.detail);
    const { taskId, parentTaskTitle } = resolveTaskIdForActivity(activity, snapshot);
    const isSubtaskActivity =
      activity.action_type === 'create_subtask' ||
      activity.action_type === 'update_subtask' ||
      activity.action_type === 'delete_subtask';

    result.push({
      id: `activity:${activity.id}`,
      workspaceId: activity.project_id,
      workspaceCode: snapshot.workspace.code,
      targetMemberId: actorMemberId,
      actorName: activity.actor_name || 'Đồng đội',
      kind: 'project_activity',
      activityAction: activity.action_type,
      activityDetail: desc.verbVi,
      activityBadge: desc.badgeLabel,
      isSelfAction: isSelf,
      taskId,
      taskTitle: parentTaskTitle ?? activity.target_title,
      subtaskTitle: isSubtaskActivity ? activity.target_title : undefined,
      createdAt: activity.created_at,
      read: false,
    });
  }
  return result;
}
