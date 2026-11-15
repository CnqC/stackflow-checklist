import { Check, ChevronDown, ChevronRight, Lock, Unlock } from 'lucide-react';
import type { ProjectData, ProjectStack, ProjectTask } from '../../core/domain/accountProject';
import { STACK_PRIORITY_LABELS } from '../../core/domain/accountStack';
import { accountProjectRepository } from '../../infrastructure/projects/accountProjectRepository';

interface Props {
  stacks: ProjectStack[];
  data: ProjectData;
  visibleTasks: (stackId: string) => ProjectTask[];
  mutate: (action: () => Promise<unknown>) => Promise<boolean>;
}

export function AdminObserverStackList({ stacks, data, visibleTasks, mutate }: Props) {
  const memberName = (memberId: string | null) =>
    data.members.find((m) => m.id === memberId)?.display_name ?? 'Chưa giao';

  return (
    <>
      {stacks.map((stack) => {
        const stackTasks = data.tasks.filter((task) => task.stack_id === stack.id);
        const pct = stackTasks.length
          ? Math.round((stackTasks.filter((t) => t.completed).length / stackTasks.length) * 100)
          : 0;
        const shown = visibleTasks(stack.id);
        return (
          <section
            key={stack.id}
            id={`stack-${stack.id}`}
            className="scroll-mt-4 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900/80 p-4 shadow-lg shadow-black/20"
            style={{ borderTopColor: stack.color, borderTopWidth: 3 }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => void mutate(() => accountProjectRepository.updateStack(stack.id, stack.version, { collapsed: !stack.collapsed }))}
                className="flex min-w-0 items-center gap-2 text-left text-foreground"
              >
                {stack.collapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                <span>
                  <span className="block font-bold">{stack.title}</span>
                  <span className="mt-1 block text-xs text-slate-400">{stack.description || `${stackTasks.length} việc`}</span>
                </span>
              </button>
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <span className="rounded-lg border border-slate-700 px-2 py-1">Ưu tiên {STACK_PRIORITY_LABELS[stack.priority].toLowerCase()}</span>
                <span className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1">
                  {stack.sequential_lock ? <Lock className="h-3.5 w-3.5 text-amber-400" /> : <Unlock className="h-3.5 w-3.5" />}
                  {stack.sequential_lock ? 'Tuần tự' : 'Tự do'}
                </span>
              </div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-900">
              <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
            </div>
            {!stack.collapsed && (
              <div className="mt-4 space-y-2">
                {shown.map((task) => {
                  const assignees = data.assignees.filter((e) => e.task_id === task.id).map((e) => memberName(e.member_id));
                  return (
                    <article key={task.id} id={`task-${task.id}`} className="flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-900/80 p-3">
                      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${task.completed ? 'border-emerald-400 bg-emerald-500 text-white' : 'border-slate-600'}`}>
                        {task.completed && <Check className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-semibold ${task.completed ? 'text-slate-400 line-through' : 'text-foreground'}`}>{task.title}</p>
                        {task.notes && <p className="mt-1 text-xs text-slate-400">{task.notes}</p>}
                        <p className="mt-1.5 text-[11px] text-slate-400">{assignees.length ? assignees.join(', ') : 'Chưa giao'}</p>
                      </div>
                    </article>
                  );
                })}
                {shown.length === 0 && stackTasks.length > 0 && <p className="text-xs text-slate-400">Không có việc phù hợp bộ lọc.</p>}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
