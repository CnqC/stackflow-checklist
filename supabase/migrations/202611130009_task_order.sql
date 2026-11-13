-- Reordering tasks affects sequential completion, so it is atomic and owner-controlled.
create function public.move_task(p_task_id uuid, p_direction text, p_expected_version bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target_project uuid;
  target_stack uuid;
  current_version bigint;
  ordered_ids uuid[];
  current_index int;
  adjacent_index int;
  swap_id uuid;
  item_id uuid;
  item_position int;
begin
  if p_direction not in ('up', 'down') then raise exception 'Invalid direction'; end if;
  select project_id, stack_id, version into target_project, target_stack, current_version
    from public.tasks where id = p_task_id;
  if target_project is null or not exists (
    select 1 from public.project_members where project_id = target_project
      and user_id = (select auth.uid()) and active and access_role = 'owner'
  ) then
    raise exception 'Only the project owner may reorder tasks' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(target_stack::text));
  select version into current_version from public.tasks where id = p_task_id;
  if current_version <> p_expected_version then
    raise exception 'Task changed on another device' using errcode = '40001';
  end if;
  select array_agg(id order by position, created_at, id) into ordered_ids
    from public.tasks where stack_id = target_stack and project_id = target_project;
  current_index := array_position(ordered_ids, p_task_id);
  adjacent_index := current_index + case when p_direction = 'up' then -1 else 1 end;
  if adjacent_index < 1 or adjacent_index > array_length(ordered_ids, 1) then return; end if;
  swap_id := ordered_ids[adjacent_index];
  ordered_ids[adjacent_index] := p_task_id;
  ordered_ids[current_index] := swap_id;
  for item_position in 1..array_length(ordered_ids, 1) loop
    item_id := ordered_ids[item_position];
    update public.tasks set position = item_position - 1
      where id = item_id and position is distinct from item_position - 1;
  end loop;
end;
$$;

revoke all on function public.move_task(uuid, text, bigint) from public, anon;
grant execute on function public.move_task(uuid, text, bigint) to authenticated;
