-- Durable project activity for the account-based workspace.
create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name text not null,
  action_type text not null check (action_type in
    ('create_task', 'update_task', 'delete_task', 'check', 'uncheck',
     'create_stack', 'update_stack', 'delete_stack', 'create_subtask',
     'update_subtask', 'delete_subtask')),
  target_title text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index activity_logs_by_project on public.activity_logs(project_id, created_at desc);
revoke all on public.activity_logs from public, anon, authenticated;
alter table public.activity_logs enable row level security;
create policy activity_logs_read on public.activity_logs for select to authenticated
  using (public.can_read_project(project_id));
grant select on public.activity_logs to authenticated;

create function private.record_project_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target_project uuid;
  target_title text;
  action_name text;
  action_detail text := '';
  member_name text;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'authenticated'
    or (select auth.uid()) is null then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    target_project := old.project_id;
    target_title := old.title;
  else
    target_project := new.project_id;
    target_title := new.title;
  end if;
  if tg_table_name = 'tasks' then
    if tg_op = 'INSERT' then action_name := 'create_task';
    elsif tg_op = 'DELETE' then action_name := 'delete_task';
    elsif new.completed is distinct from old.completed then
      action_name := case when new.completed then 'check' else 'uncheck' end;
    else action_name := 'update_task';
    end if;
  elsif tg_table_name = 'stacks' then
    action_name := case tg_op when 'INSERT' then 'create_stack'
      when 'DELETE' then 'delete_stack' else 'update_stack' end;
  else
    action_name := case tg_op when 'INSERT' then 'create_subtask'
      when 'DELETE' then 'delete_subtask' else 'update_subtask' end;
  end if;
  if tg_op = 'UPDATE' and tg_table_name = 'tasks' then
    if new.status is distinct from old.status then
      action_detail := old.status || ' → ' || new.status;
    end if;
  end if;
  select display_name into member_name from public.project_members
    where project_id = target_project and user_id = (select auth.uid()) limit 1;
  insert into public.activity_logs(project_id, actor_user_id, actor_name,
    action_type, target_title, detail)
  values (target_project, (select auth.uid()), coalesce(member_name, 'Admin'),
    action_name, target_title, action_detail);
  return coalesce(new, old);
end;
$$;

create trigger task_activity after insert or update or delete on public.tasks
  for each row execute function private.record_project_activity();
create trigger stack_activity after insert or update or delete on public.stacks
  for each row execute function private.record_project_activity();
create trigger subtask_activity after insert or update or delete on public.subtasks
  for each row execute function private.record_project_activity();

alter publication supabase_realtime add table public.activity_logs;
