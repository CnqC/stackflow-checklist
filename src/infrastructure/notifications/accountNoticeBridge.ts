import { useEffect, useRef } from 'react';
import type { ProjectNotice } from '../../core/domain/accountProject';
import { domainEventBus } from '../../core/events/domainEventBus';
import type { AppNotice, WorkspaceSnapshot } from '../../types/models';
import { accountProjectRepository } from '../projects/accountProjectRepository';
import { watchBrowserTabNotices } from './browserTabTitle';
import { notificationService } from './notificationService';

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

/**
 * Bridges PostgreSQL assignment_notices <-> V2 NotificationBell, Sound,
 * Android Capacitor LocalNotifications, Desktop/Web ServiceWorker notifications,
 * and Browser Tab unread badges without duplicate firing.
 */
export function useAccountNoticeBridge(params: {
  projectId: string;
  actorMemberId: string | null;
  serverNotices: ProjectNotice[];
  v2Snapshot: WorkspaceSnapshot | null;
  onOpenTask: (taskId: string) => void;
}): void {
  const { projectId, actorMemberId, serverNotices, v2Snapshot, onOpenTask } = params;
  const hydratedProjectRef = useRef<string | null>(null);
  const serverNoticesRef = useRef<ProjectNotice[]>(serverNotices);
  const syncingReadIdsRef = useRef<Set<string>>(new Set());
  const onOpenTaskRef = useRef(onOpenTask);

  useEffect(() => {
    serverNoticesRef.current = serverNotices;
  }, [serverNotices]);

  useEffect(() => {
    onOpenTaskRef.current = onOpenTask;
  }, [onOpenTask]);

  // 1. Dispatch server notices into V2 notificationService (silent on first hydration, live alerts after)
  useEffect(() => {
    if (!actorMemberId || !v2Snapshot) return;
    const isInitialHydration = hydratedProjectRef.current !== `${projectId}:${actorMemberId}`;
    hydratedProjectRef.current = `${projectId}:${actorMemberId}`;

    const myNotices = serverNotices
      .filter((n) => n.recipient_member_id === actorMemberId)
      .map((n) => mapServerNoticeToV2(n, v2Snapshot.workspace.code));

    if (myNotices.length > 0) {
      notificationService.dispatchNotices(myNotices, {
        deviceAlert: !isInitialHydration,
        snapshot: v2Snapshot,
      });
    }

    // Keep local read state synchronized when another device marks a notice read on PostgreSQL
    for (const srv of serverNotices) {
      if (srv.recipient_member_id === actorMemberId && srv.read_at) {
        notificationService.markNoticeRead(srv.id, projectId, actorMemberId);
      }
    }
  }, [projectId, actorMemberId, serverNotices, v2Snapshot]);

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
