-- Preserve V2 collaboration: active project members may edit task details.
-- Completion remains restricted to assignees by the task/subtask guards.
create or replace function public.can_manage_task(p_task_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tasks as task
    where task.id = p_task_id and public.can_write_project(task.project_id)
  );
$$;
