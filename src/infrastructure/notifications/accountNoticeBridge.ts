import { useEffect, useRef } from 'react';
import type { ProjectActivity, ProjectNotice } from '../../core/domain/accountProject';
import { buildProjectActivityNotices } from '../../core/domain/projectActivityNoticeEngine';
import { domainEventBus } from '../../core/events/domainEventBus';
import type { AppNotice, WorkspaceSnapshot } from '../../types/models';
import { accountProjectRepository } from '../projects/accountProjectRepository';
import { watchBrowserTabNotices } from './browserTabTitle';
import { notificationPreferencesStore } from './notificationPreferencesStore';
import { notificationService } from './notificationService';
import { notificationSoundService } from './notificationSoundService';

function mapServerNoticeToV2(
  notice: ProjectNotice,
  workspaceCode: string,
): AppNotice {
  return {
    id: notice.id,
    workspaceId: notice.project_id,
    workspaceCode,
    targetMemberId: notice.recipient_member_id,
    actorName: notice.actor_name,
    kind: notice.kind,
    taskId: notice.task_id,
    taskTitle: notice.task_title,
    subtaskTitle: notice.subtask_title ?? undefined,
    createdAt: notice.created_at,
    read: Boolean(notice.read_at),
  };
}

export function triggerTestNotificationAndSound(
  snapshot: WorkspaceSnapshot,
  memberId: string,
  memberName: string,
): AppNotice {
  const sampleTask = snapshot.items[0];
  const testNotice: AppNotice = {
    id: `test-alert:${snapshot.workspace.id}:${Date.now()}`,
    workspaceId: snapshot.workspace.id,
    workspaceCode: snapshot.workspace.code,
    targetMemberId: memberId,
    actorName: memberName || 'StackFlow',
    kind: 'project_activity',
    activityAction: 'create_task',
    activityDetail: 'gửi thông báo kiểm tra chuông & âm thanh',
    activityBadge: 'Kiểm tra chuông',
    isSelfAction: false,
    taskId: sampleTask?.id ?? '',
    taskTitle: sampleTask?.title ?? `Dự án ${snapshot.workspace.name}`,
    createdAt: new Date().toISOString(),
    read: false,
  };
  const dispatched = notificationService.dispatchNotices([testNotice], {
    deviceAlert: true,
    snapshot,
  });
  if (dispatched.length === 0) {
    void notificationSoundService.preview(snapshot.workspace.id, memberId);
  }
  return testNotice;
}

/**
 * Bridges PostgreSQL assignment_notices + activity_logs <-> NotificationBell,
 * Audio chimes, In-App Live Toast, Android LocalNotifications, Web/PWA Notifications,
 * and Browser Tab unread badges without duplicate firing on page reload.
 */
export function useAccountNoticeBridge(params: {
  projectId: string;
  actorMemberId: string | null;
  actorUserId?: string | null;
  serverNotices: ProjectNotice[];
  activities?: ProjectActivity[];
  v2Snapshot: WorkspaceSnapshot | null;
  onOpenTask: (taskId: string) => void;
  onLiveNotice?: (notice: AppNotice) => void;
}): void {
  const {
    projectId,
    actorMemberId,
    actorUserId = null,
    serverNotices,
    activities = [],
    v2Snapshot,
    onOpenTask,
    onLiveNotice,
  } = params;
  const hydratedScopeRef = useRef<string | null>(null);
  const seenActivityIdsRef = useRef<Set<string>>(new Set());
  const serverNoticesRef = useRef<ProjectNotice[]>(serverNotices);
  const syncingReadIdsRef = useRef<Set<string>>(new Set());
  const onOpenTaskRef = useRef(onOpenTask);
  const onLiveNoticeRef = useRef(onLiveNotice);

  useEffect(() => {
    serverNoticesRef.current = serverNotices;
  }, [serverNotices]);

  useEffect(() => {
    onOpenTaskRef.current = onOpenTask;
    onLiveNoticeRef.current = onLiveNotice;
  }, [onOpenTask, onLiveNotice]);

  // 1. Hydrate existing server notices silently once, then alert + chime on every new notice or activity
  useEffect(() => {
    if (!actorMemberId || !v2Snapshot) return;
    const scope = `${projectId}:${actorMemberId}`;
    const isInitialHydration = hydratedScopeRef.current !== scope;

    if (isInitialHydration) {
      hydratedScopeRef.current = scope;
      seenActivityIdsRef.current = new Set(activities.map((a) => a.id));

      const initialServerNotices = serverNotices
        .filter((n) => n.recipient_member_id === actorMemberId)
        .map((n) => mapServerNoticeToV2(n, v2Snapshot.workspace.code));

      if (initialServerNotices.length > 0) {
        notificationService.dispatchNotices(initialServerNotices, {
          deviceAlert: false,
          snapshot: v2Snapshot,
        });
      }
    } else {
      const myServerNotices = serverNotices
        .filter((n) => n.recipient_member_id === actorMemberId)
        .map((n) => mapServerNoticeToV2(n, v2Snapshot.workspace.code));

      const freshActivities = activities.filter((a) => !seenActivityIdsRef.current.has(a.id));
      for (const act of freshActivities) {
        seenActivityIdsRef.current.add(act.id);
      }

      const prefs = notificationPreferencesStore.get(projectId, actorMemberId);
      const activityNotices =
        prefs.activityAlertsEnabled && freshActivities.length > 0
          ? buildProjectActivityNotices({
              activities: freshActivities,
              serverNotices,
              snapshot: v2Snapshot,
              actorMemberId,
              actorUserId,
              includeSelfActions: prefs.selfActionFeedbackEnabled,
            })
          : [];

      const batch = [...myServerNotices, ...activityNotices];
      if (batch.length > 0) {
        const accepted = notificationService.dispatchNotices(batch, {
          deviceAlert: true,
          snapshot: v2Snapshot,
        });
        if (accepted.length > 0) {
          onLiveNoticeRef.current?.(accepted[0]!);
        }
      }
    }

    for (const srv of serverNotices) {
      if (srv.recipient_member_id === actorMemberId && srv.read_at) {
        notificationService.markNoticeRead(srv.id, projectId, actorMemberId);
      }
    }
  }, [projectId, actorMemberId, actorUserId, serverNotices, activities, v2Snapshot]);

  // 2. Sync local read actions from NotificationBell back to PostgreSQL assignment_notices
  useEffect(() => {
    if (!actorMemberId) return;
    return domainEventBus.on('notices:changed', ({ workspaceId, memberId, notices }) => {
      if (workspaceId !== projectId || memberId !== actorMemberId) return;
      const unreadOnServer = new Set(
        serverNoticesRef.current
          .filter((n) => n.recipient_member_id === actorMemberId && !n.read_at)
          .map((n) => n.id),
      );
      for (const localNotice of notices) {
        if (
          localNotice.read &&
          unreadOnServer.has(localNotice.id) &&
          !syncingReadIdsRef.current.has(localNotice.id)
        ) {
          syncingReadIdsRef.current.add(localNotice.id);
          void accountProjectRepository.markNoticeRead(localNotice.id).catch(() => {
            syncingReadIdsRef.current.delete(localNotice.id);
          });
        }
      }
    });
  }, [projectId, actorMemberId]);

  // 3. Browser tab title unread badge + OS notification click -> open task drawer
  useEffect(() => {
    const stopTabBadge = watchBrowserTabNotices(v2Snapshot, actorMemberId);
    const stopOpenListener = notificationService.subscribeNoticeOpens((noticeId, target) => {
      if (target?.workspaceId && target.workspaceId !== projectId) return;
      if (actorMemberId) {
        notificationService.markNoticeRead(noticeId, projectId, actorMemberId);
      }
      if (target?.taskId) {
        onOpenTaskRef.current(target.taskId);
      }
    });
    return () => {
      stopTabBadge();
      stopOpenListener();
    };
  }, [projectId, actorMemberId, v2Snapshot]);
}
