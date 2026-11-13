import React from 'react';
import { Activity, CheckCircle2, FolderPlus, PlusCircle, RefreshCw, RotateCcw, Trash2, UserPlus } from 'lucide-react';
import type { ActivityLog } from '../types/models';

interface ActivityPanelProps {
  activities: ActivityLog[];
}

function formatRelativeTime(iso: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 30) return 'Vừa xong';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;
  return `${Math.floor(diffSec / 86400)} ngày trước`;
}

function getActionBadge(type: ActivityLog['actionType']) {
  switch (type) {
    case 'check':
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    case 'uncheck':
      return <RotateCcw className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    case 'create_task':
      return <PlusCircle className="w-3.5 h-3.5 text-indigo-400 shrink-0" />;
    case 'create_stack':
      return <FolderPlus className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
    case 'join_member':
      return <UserPlus className="w-3.5 h-3.5 text-violet-400 shrink-0" />;
    case 'delete_task':
      return <Trash2 className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
    default:
      return <RefreshCw className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
  }
}

export const ActivityPanel: React.FC<ActivityPanelProps> = ({ activities }) => {
  return (
    <div className="rounded-2xl bg-slate-900/80 border border-slate-800/90 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
          <Activity className="w-4 h-4 text-indigo-400" />
          Hoạt động trực tiếp
        </h3>
        <span className="text-[11px] text-slate-500">{activities.length} gần nhất</span>
      </div>

      {activities.length === 0 ? (
        <p className="text-xs text-slate-500 py-6 text-center">
          Chưa có hoạt động nào được ghi nhận.
        </p>
      ) : (
        <ul className="space-y-3 max-h-[30rem] overflow-y-auto pr-1">
          {activities.map((act) => (
            <li
              key={act.id}
              className="flex items-start gap-2.5 text-xs pb-2.5 border-b border-slate-800/60 last:border-b-0 last:pb-0"
            >
              <span
                className="w-6 h-6 rounded-lg text-[10px] font-bold text-on-accent flex items-center justify-center shrink-0 mt-0.5"
                style={{ backgroundColor: act.actorColor }}
              >
                {act.actorName.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 text-slate-200">
                  {getActionBadge(act.actionType)}
                  <strong className="font-semibold text-foreground">{act.actorName}</strong>
                  <span className="text-slate-400 truncate">• {act.detail}</span>
                </div>
                <p className="text-slate-300 mt-0.5 break-words font-medium">
                  “{act.targetTitle}”
                </p>
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  {formatRelativeTime(act.createdAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
