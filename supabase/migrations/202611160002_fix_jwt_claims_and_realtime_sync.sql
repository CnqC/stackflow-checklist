-- StackFlow v3: Fix PostgREST v12 JWT role detection (request.jwt.claims JSON),
-- bidirectional status <-> completed sync, diff-based set_task_assignees without duplicate notices,
-- rich live activity details (including assignee names & link changes), and REPLICA IDENTITY FULL for Realtime DELETEs.

create or replace function private.enforce_task_write()
returns trigger language plpgsql set search_path = '' as $$
declare
  actor_id uuid;
  manager boolean;
  is_authed boolean := (select auth.uid()) is not null and coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), '')
  ) = 'authenticated';
begin
  if tg_op = 'DELETE' then
    if is_authed and not public.can_manage_task(old.id) then
      raise exception 'Only the task creator or project owner may delete it'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if not is_authed then
    if tg_op = 'UPDATE' then
      new.version := old.version + 1;
      new.updated_at := now();
    end if;
    return new;
  end if;

  actor_id := public.my_member_id(new.project_id);
  if actor_id is null then
    raise exception 'Project membership required' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.completed or new.status = 'done' then
      raise exception 'Create the task first, then let an assignee complete it'
        using errcode = '42501';
    end if;
    new.created_by_member_id := actor_id;
    new.completed_by_member_id := null;
    new.completed_at := null;
    new.version := 1;
    return new;
  end if;

  if new.project_id is distinct from old.project_id
    or new.created_by_member_id is distinct from old.created_by_member_id then
    raise exception 'Task ownership cannot be changed';
  end if;

  manager := public.can_manage_task(old.id);
  if not manager and (
    (to_jsonb(new) - 'completed' - 'status' - 'completed_by_member_id'
      - 'completed_at' - 'version' - 'updated_at')
    is distinct from
    (to_jsonb(old) - 'completed' - 'status' - 'completed_by_member_id'
      - 'completed_at' - 'version' - 'updated_at')
  ) then
    raise exception 'Only the task creator or project owner may edit details'
      using errcode = '42501';
  end if;

  if new.completed is distinct from old.completed then
    if not exists (
      select 1 from public.task_assignees
      where task_id = old.id and member_id = actor_id
    ) then
      raise exception 'Only an assigned member may complete this task'
        using errcode = '42501';
    end if;
    new.status := case
      when new.completed then 'done'
      when new.status is distinct from old.status and new.status <> 'done' then new.status
      else 'todo'
    end;
    new.completed_by_member_id := case when new.completed then actor_id else null end;
    new.completed_at := case when new.completed then now() else null end;
  elsif new.status is distinct from old.status and (new.status = 'done') is distinct from old.completed then
    if not exists (
      select 1 from public.task_assignees
      where task_id = old.id and member_id = actor_id
    ) then
      raise exception 'Only an assigned member may complete this task'
        using errcode = '42501';
    end if;
    new.completed := (new.status = 'done');
    new.completed_by_member_id := case when new.completed then actor_id else null end;
    new.completed_at := case when new.completed then now() else null end;
  else
    if not manager and new.status is distinct from old.status then
      raise exception 'Only the task creator or project owner may change status'
        using errcode = '42501';
    end if;
    if (new.status = 'done') is distinct from new.completed then
      raise exception 'Completed status must match task completion';
    end if;
    new.completed_by_member_id := old.completed_by_member_id;
    new.completed_at := old.completed_at;
  end if;

  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.enforce_assignee_write()
returns trigger language plpgsql set search_path = '' as $$
declare
  target_task_id uuid := case when tg_op = 'DELETE' then old.task_id else new.task_id end;
  is_authed boolean := (select auth.uid()) is not null and coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), '')
  ) = 'authenticated';
begin
  if is_authed and not public.can_manage_task(target_task_id) then
    raise exception 'Only the task creator or project owner may assign members'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if not exists (
    select 1 from public.project_members
    where id = new.member_id and project_id = new.project_id and active
  ) then
    raise exception 'Assignee must be an active project member' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function private.enforce_subtask_write()
returns trigger language plpgsql set search_path = '' as $$
declare
  actor_id uuid;
  allowed_member_id uuid;
  manager boolean;
  is_authed boolean := (select auth.uid()) is not null and coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), '')
  ) = 'authenticated';
begin
  if tg_op = 'DELETE' then
    if is_authed and not public.can_manage_task(old.task_id) then
      raise exception 'Only the task creator or project owner may delete a subtask'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if not is_authed then
    if tg_op = 'UPDATE' then
      new.version := old.version + 1;
      new.updated_at := now();
    end if;
    return new;
  end if;

  actor_id := public.my_member_id(new.project_id);
  if actor_id is null then
    raise exception 'Project membership required' using errcode = '42501';
  end if;
  manager := public.can_manage_task(new.task_id);

  if tg_op = 'INSERT' then
    if not manager or new.completed then
      raise exception 'Only the task creator or owner may add an incomplete subtask'
        using errcode = '42501';
    end if;
    if new.assignee_member_id is not null and not exists (
      select 1 from public.project_members where id = new.assignee_member_id
        and project_id = new.project_id and active
    ) then
      raise exception 'Subtask assignee must be active' using errcode = '23514';
    end if;
    new.completed_by_member_id := null;
    new.version := 1;
    return new;
  end if;

  if new.project_id is distinct from old.project_id
    or new.task_id is distinct from old.task_id then
    raise exception 'Subtask cannot move to another task';
  end if;
  if new.assignee_member_id is distinct from old.assignee_member_id
    and new.assignee_member_id is not null and not exists (
      select 1 from public.project_members where id = new.assignee_member_id
        and project_id = new.project_id and active
    ) then
    raise exception 'Subtask assignee must be active' using errcode = '23514';
  end if;
  if not manager and (
    (to_jsonb(new) - 'completed' - 'completed_by_member_id'
      - 'version' - 'updated_at')
    is distinct from
    (to_jsonb(old) - 'completed' - 'completed_by_member_id'
      - 'version' - 'updated_at')
  ) then
    raise exception 'Only the task creator or owner may edit subtask details'
      using errcode = '42501';
  end if;

  if new.completed is distinct from old.completed then
    allowed_member_id := old.assignee_member_id;
    if allowed_member_id is not null and actor_id <> allowed_member_id then
      raise exception 'Only the subtask assignee may complete it' using errcode = '42501';
    end if;
    if allowed_member_id is null and not exists (
      select 1 from public.task_assignees
      where task_id = old.task_id and member_id = actor_id
    ) then
      raise exception 'Only a task assignee may complete this subtask'
        using errcode = '42501';
    end if;
    new.completed_by_member_id := case when new.completed then actor_id else null end;
  else
    new.completed_by_member_id := old.completed_by_member_id;
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.enforce_sequential_task_completion()
returns trigger language plpgsql set search_path = '' as $$
declare
  is_authed boolean := (select auth.uid()) is not null and coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), '')
  ) = 'authenticated';
begin
  if is_authed
    and new.completed and not old.completed
    and exists (select 1 from public.stacks where id = old.stack_id and sequential_lock)
    and exists (
      select 1 from public.tasks as previous
      where previous.stack_id = old.stack_id
        and previous.project_id = old.project_id
        and (previous.position, previous.created_at, previous.id)
          < (old.position, old.created_at, old.id)
        and not previous.completed
    ) then
    raise exception 'Complete preceding tasks in this Stack first'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists task_sequence_guard on public.tasks;
create trigger task_sequence_guard before update on public.tasks
  for each row execute function private.enforce_sequential_task_completion();

create or replace function private.record_project_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target_project uuid;
  target_title text;
  action_name text;
  action_detail text := coalesce(nullif(current_setting('stackflow.activity_detail', true), ''), '');
  stack_title text;
  member_name text;
  is_authed boolean := (select auth.uid()) is not null and coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), '')
  ) = 'authenticated';
begin
  perform set_config('stackflow.activity_detail', '', true);
  if not is_authed then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    target_project := old.project_id;
    if tg_table_name = 'task_links' then
      select title into target_title from public.tasks where id = old.task_id;
      target_title := coalesce(target_title, old.label);
    else
      target_title := old.title;
    end if;
  else
    target_project := new.project_id;
    if tg_table_name = 'task_links' then
      select title into target_title from public.tasks where id = new.task_id;
      target_title := coalesce(target_title, new.label);
    else
      target_title := new.title;
    end if;
  end if;

  if tg_table_name = 'tasks' then
    if tg_op = 'INSERT' then
      action_name := 'create_task';
      if action_detail = '' then
        select title into stack_title from public.stacks where id = new.stack_id;
        if stack_title is not null then action_detail := 'Trong ' || stack_title; end if;
      end if;
    elsif tg_op = 'DELETE' then
      action_name := 'delete_task';
    elsif new.completed is distinct from old.completed then
      action_name := case when new.completed then 'check' else 'uncheck' end;
      if action_detail = '' then
        action_detail := case when new.completed then 'Đã đánh dấu hoàn thành' else 'Mở lại đầu việc' end;
      end if;
    else
      action_name := 'update_task';
      if action_detail = '' then
        if new.status is distinct from old.status then
          action_detail := old.status || ' → ' || new.status;
        elsif new.title is distinct from old.title then
          action_detail := 'Đổi tên công việc';
        elsif new.notes is distinct from old.notes then
          action_detail := 'Cập nhật ghi chú chi tiết';
        elsif new.due_date is distinct from old.due_date then
          action_detail := 'Cập nhật hạn chót';
        elsif new.priority is distinct from old.priority then
          action_detail := 'Đổi mức ưu tiên';
        elsif new.stack_id is distinct from old.stack_id then
          select title into stack_title from public.stacks where id = new.stack_id;
          action_detail := coalesce('Chuyển sang ' || stack_title, 'Chuyển Stack');
        end if;
      end if;
    end if;
  elsif tg_table_name = 'stacks' then
    action_name := case tg_op when 'INSERT' then 'create_stack'
      when 'DELETE' then 'delete_stack' else 'update_stack' end;
  elsif tg_table_name = 'subtasks' then
    action_name := case tg_op when 'INSERT' then 'create_subtask'
      when 'DELETE' then 'delete_subtask' else 'update_subtask' end;
    if tg_op = 'UPDATE' and action_detail = '' and new.completed is distinct from old.completed then
      action_detail := case when new.completed then 'Hoàn thành phần việc nhỏ' else 'Mở lại phần việc nhỏ' end;
    end if;
  else
    action_name := 'update_task';
    if action_detail = '' then
      action_detail := case tg_op
        when 'INSERT' then 'Đính kèm tài liệu: ' || new.label
        when 'DELETE' then 'Gỡ tài liệu: ' || old.label
        else 'Cập nhật tài liệu: ' || new.label
      end;
    end if;
  end if;

  select display_name into member_name from public.project_members
    where project_id = target_project and user_id = (select auth.uid()) limit 1;

  insert into public.activity_logs(project_id, actor_user_id, actor_name,
    action_type, target_title, detail)
  values (target_project, (select auth.uid()), coalesce(member_name, 'Thành viên'),
    action_name, coalesce(target_title, 'Công việc'), action_detail);
  return coalesce(new, old);
end;
$$;

drop trigger if exists task_link_activity on public.task_links;
create trigger task_link_activity after insert or update or delete on public.task_links
  for each row execute function private.record_project_activity();

create or replace function private.enqueue_assignment_notice()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  recipient uuid;
  target_project uuid;
  target_task uuid;
  target_title text;
  part_title text;
  notice_kind text;
  actor_name text;
  is_authed boolean := (select auth.uid()) is not null and coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), '')
  ) = 'authenticated';
begin
  if not is_authed then return new; end if;

  if tg_table_name = 'task_assignees' then
    recipient := new.member_id;
    target_project := new.project_id;
    target_task := new.task_id;
    notice_kind := 'task_assigned';
  else
    if tg_op = 'UPDATE' then
      if new.assignee_member_id is not distinct from old.assignee_member_id then
        return new;
      end if;
    end if;
    recipient := new.assignee_member_id;
    target_project := new.project_id;
    target_task := new.task_id;
    part_title := new.title;
    notice_kind := 'subtask_assigned';
  end if;

  if recipient is null then return new; end if;
  if exists (select 1 from public.project_members
    where id = recipient and user_id = (select auth.uid())) then return new; end if;

  select title into target_title from public.tasks where id = target_task;
  select display_name into actor_name from public.project_members
    where project_id = target_project and user_id = (select auth.uid()) limit 1;

  insert into public.assignment_notices(project_id, recipient_member_id,
    actor_user_id, actor_name, kind, task_id, task_title, subtask_title)
  values (target_project, recipient, (select auth.uid()), coalesce(actor_name, 'Thành viên'),
    notice_kind, target_task, coalesce(target_title, 'Công việc'), part_title);
  return new;
end;
$$;

create or replace function public.create_task_with_assignees(
  p_project_id uuid, p_stack_id uuid, p_title text, p_notes text,
  p_priority text, p_due_date date, p_assignee_member_ids uuid[]
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_task_id uuid;
  requested_count int;
  valid_count int;
  next_position int;
  stack_title text;
  assignee_names text;
  activity_detail text := '';
begin
  if not public.can_write_project(p_project_id) then
    raise exception 'Project membership required' using errcode = '42501';
  end if;
  if p_assignee_member_ids is null then p_assignee_member_ids := '{}'::uuid[]; end if;

  select count(distinct member_id) into requested_count
  from unnest(p_assignee_member_ids) as chosen(member_id);

  select count(*), string_agg(display_name, ', ' order by display_name)
  into valid_count, assignee_names
  from public.project_members
  where id = any(p_assignee_member_ids) and project_id = p_project_id and active;

  if requested_count <> valid_count then
    raise exception 'Assignees must be active project members';
  end if;

  select title into stack_title from public.stacks
  where id = p_stack_id and project_id = p_project_id;

  select coalesce(max(position), -1) + 1 into next_position
  from public.tasks where stack_id = p_stack_id and project_id = p_project_id;

  if stack_title is not null and assignee_names is not null then
    activity_detail := 'Trong ' || stack_title || ' · Giao cho: ' || assignee_names;
  elsif assignee_names is not null then
    activity_detail := 'Giao cho: ' || assignee_names;
  elsif stack_title is not null then
    activity_detail := 'Trong ' || stack_title;
  end if;
  perform set_config('stackflow.activity_detail', activity_detail, true);

  insert into public.tasks(project_id, stack_id, title, notes, priority, due_date, position)
  values (p_project_id, p_stack_id, p_title, coalesce(p_notes, ''),
          coalesce(p_priority, 'medium'), p_due_date, next_position)
  returning id into new_task_id;

  insert into public.task_assignees(task_id, member_id, project_id)
  select new_task_id, member_id, p_project_id
  from (select distinct member_id from unnest(p_assignee_member_ids) as chosen(member_id)) as selected
  on conflict (task_id, member_id) do nothing;

  return new_task_id;
end;
$$;

create or replace function public.set_task_assignees(
  p_task_id uuid, p_expected_version bigint, p_assignee_member_ids uuid[]
)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  task_row public.tasks%rowtype;
  requested_count int;
  valid_count int;
  assignee_names text;
  next_version bigint;
begin
  select * into task_row from public.tasks where id = p_task_id for update;
  if not found then raise exception 'Task not found' using errcode = 'P0002'; end if;
  if not public.can_manage_task(p_task_id) then
    raise exception 'Only creator or owner may assign' using errcode = '42501';
  end if;
  if task_row.version is distinct from p_expected_version then
    raise exception 'Task version conflict' using errcode = '40001';
  end if;
  if p_assignee_member_ids is null then p_assignee_member_ids := '{}'::uuid[]; end if;

  select count(distinct member_id) into requested_count
  from unnest(p_assignee_member_ids) as chosen(member_id);

  select count(*), string_agg(display_name, ', ' order by display_name)
  into valid_count, assignee_names
  from public.project_members
  where id = any(p_assignee_member_ids) and project_id = task_row.project_id and active;

  if requested_count <> valid_count then
    raise exception 'Assignees must be active project members';
  end if;

  delete from public.task_assignees
  where task_id = p_task_id
    and not (member_id = any(p_assignee_member_ids));

  insert into public.task_assignees(task_id, member_id, project_id)
  select p_task_id, member_id, task_row.project_id
  from (select distinct member_id from unnest(p_assignee_member_ids) as chosen(member_id)) as selected
  on conflict (task_id, member_id) do nothing;

  perform set_config(
    'stackflow.activity_detail',
    case when assignee_names is not null then 'Phân công: ' || assignee_names else 'Đã bỏ phân công' end,
    true
  );

  update public.tasks set updated_at = now() where id = p_task_id
  returning version into next_version;
  return next_version;
end;
$$;

alter table public.projects replica identity full;
alter table public.project_members replica identity full;
alter table public.stacks replica identity full;
alter table public.tasks replica identity full;
alter table public.task_assignees replica identity full;
alter table public.subtasks replica identity full;
alter table public.task_links replica identity full;
alter table public.activity_logs replica identity full;
alter table public.assignment_notices replica identity full;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'projects', 'project_members', 'stacks', 'tasks', 'task_assignees',
    'subtasks', 'task_links', 'activity_logs', 'assignment_notices'
  ] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
