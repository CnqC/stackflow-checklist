-- Server-authoritative completion operations. Additive: legacy policies are unchanged.
-- Direct table writes must be revoked in the later security cutover.

alter table public.checklist_items
  add column if not exists version bigint not null default 1
  check (version > 0);

create or replace function public.toggle_account_task(
  p_item_id uuid,
  p_expected_version bigint
)
returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare
  item public.checklist_items%rowtype;
  actor public.members%rowtype;
  next_completed boolean;
  next_version bigint;
begin
  if (select auth.uid()) is null or public.is_global_admin() then
    raise exception 'A project member account is required' using errcode = '42501';
  end if;

  select * into item from public.checklist_items
  where id = p_item_id for update;
  if not found then raise exception 'Task not found' using errcode = 'P0002'; end if;

  select * into actor from public.members
  where workspace_id = item.workspace_id and user_id = (select auth.uid());
  if not found then
    raise exception 'Not a member of this project' using errcode = '42501';
  end if;
  if actor.id <> all(item.assignee_ids)
    and actor.id is distinct from item.assignee_id then
    raise exception 'Only an assignee may complete this task' using errcode = '42501';
  end if;
  if p_expected_version is distinct from item.version then
    raise exception 'Task version conflict' using errcode = '40001';
  end if;

  next_completed := not item.completed;
  update public.checklist_items
  set completed = next_completed,
      status = case when next_completed then 'done' else 'todo' end,
      completed_by_id = case when next_completed then actor.id else null end,
      completed_by_name = case when next_completed then actor.name else null end,
      completed_at = case when next_completed then now() else null end,
      updated_by_name = actor.name,
      updated_at = now(),
      version = item.version + 1
  where id = item.id returning version into next_version;

  insert into public.activity_logs (
    workspace_id, actor_id, actor_name, actor_color,
    action_type, target_title, detail
  ) values (
    item.workspace_id, actor.id, actor.name, actor.color,
    case when next_completed then 'check' else 'uncheck' end,
    item.title, case when next_completed then 'Hoàn thành task' else 'Mở lại task' end
  );

  return next_version;
end;
$$;

revoke all on function public.toggle_account_task(uuid, bigint) from public, anon;
grant execute on function public.toggle_account_task(uuid, bigint) to authenticated;

create or replace function public.toggle_account_subtask(
  p_item_id uuid,
  p_subtask_id text,
  p_expected_version bigint
)
returns bigint
language plpgsql security definer
set search_path = ''
as $$
declare
  item public.checklist_items%rowtype;
  actor public.members%rowtype;
  subtask jsonb;
  subtask_index bigint;
  assigned_member_id text;
  next_completed boolean;
  next_version bigint;
begin
  if (select auth.uid()) is null or public.is_global_admin() then
    raise exception 'A project member account is required' using errcode = '42501';
  end if;

  select * into item from public.checklist_items
  where id = p_item_id for update;
  if not found then raise exception 'Task not found' using errcode = 'P0002'; end if;

  select * into actor from public.members
  where workspace_id = item.workspace_id and user_id = (select auth.uid());
  if not found then
    raise exception 'Not a member of this project' using errcode = '42501';
  end if;

  select value, ordinality into subtask, subtask_index
  from jsonb_array_elements(item.subtasks) with ordinality
  where value->>'id' = p_subtask_id;
  if not found then raise exception 'Subtask not found' using errcode = 'P0002'; end if;

  assigned_member_id := nullif(subtask->>'assigneeId', '');
  if assigned_member_id is not null and assigned_member_id <> actor.id::text then
    raise exception 'Only the subtask assignee may complete it' using errcode = '42501';
  end if;
  if assigned_member_id is null and actor.id <> all(item.assignee_ids)
    and actor.id is distinct from item.assignee_id then
    raise exception 'Only a task assignee may complete this subtask' using errcode = '42501';
  end if;
  if p_expected_version is distinct from item.version then
    raise exception 'Task version conflict' using errcode = '40001';
  end if;

  next_completed := not coalesce((subtask->>'completed')::boolean, false);
  subtask := jsonb_set(subtask, '{completed}', to_jsonb(next_completed), true);
  subtask := jsonb_set(subtask, '{completedById}',
    case when next_completed then to_jsonb(actor.id::text) else 'null'::jsonb end, true);
  subtask := jsonb_set(subtask, '{completedByName}',
    case when next_completed then to_jsonb(actor.name) else 'null'::jsonb end, true);

  update public.checklist_items
  set subtasks = jsonb_set(item.subtasks, array[(subtask_index - 1)::text], subtask, false),
      updated_by_name = actor.name,
      updated_at = now(),
      version = item.version + 1
  where id = item.id returning version into next_version;

  insert into public.activity_logs (
    workspace_id, actor_id, actor_name, actor_color,
    action_type, target_title, detail
  ) values (
    item.workspace_id, actor.id, actor.name, actor.color,
    case when next_completed then 'check' else 'uncheck' end,
    item.title, coalesce(subtask->>'title', '')
  );

  return next_version;
end;
$$;

revoke all on function public.toggle_account_subtask(uuid, text, bigint) from public, anon;
grant execute on function public.toggle_account_subtask(uuid, text, bigint) to authenticated;
