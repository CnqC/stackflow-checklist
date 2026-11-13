-- Atomic Stack creation and reordering for account projects.
create function public.create_stack(p_project_id uuid, p_title text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
  next_position int;
begin
  if not public.can_write_project(p_project_id) then
    raise exception 'Project membership required' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_project_id::text));
  select coalesce(max(position), -1) + 1 into next_position from public.stacks
    where project_id = p_project_id;
  insert into public.stacks(project_id, title, position)
    values (p_project_id, p_title, next_position) returning id into new_id;
  return new_id;
end;
$$;

create function public.move_stack(p_stack_id uuid, p_direction text, p_expected_version bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target_project uuid;
  current_version bigint;
  ordered_ids uuid[];
  current_index int;
  adjacent_index int;
  swap_id uuid;
  item_id uuid;
  item_position int;
begin
  if p_direction not in ('up', 'down') then
    raise exception 'Invalid direction';
  end if;
  select project_id, version into target_project, current_version from public.stacks
    where id = p_stack_id;
  if target_project is null or not public.can_write_project(target_project) then
    raise exception 'Project membership required' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(target_project::text));
  select version into current_version from public.stacks where id = p_stack_id;
  if current_version <> p_expected_version then
    raise exception 'Stack changed on another device' using errcode = '40001';
  end if;
  select array_agg(id order by position, created_at, id) into ordered_ids
    from public.stacks where project_id = target_project;
  current_index := array_position(ordered_ids, p_stack_id);
  adjacent_index := current_index + case when p_direction = 'up' then -1 else 1 end;
  if adjacent_index < 1 or adjacent_index > array_length(ordered_ids, 1) then return; end if;
  swap_id := ordered_ids[adjacent_index];
  ordered_ids[adjacent_index] := p_stack_id;
  ordered_ids[current_index] := swap_id;
  for item_position in 1..array_length(ordered_ids, 1) loop
    item_id := ordered_ids[item_position];
    update public.stacks set position = item_position - 1
      where id = item_id and position is distinct from item_position - 1;
  end loop;
end;
$$;

revoke all on function public.create_stack(uuid, text) from public, anon;
revoke all on function public.move_stack(uuid, text, bigint) from public, anon;
grant execute on function public.create_stack(uuid, text) to authenticated;
grant execute on function public.move_stack(uuid, text, bigint) to authenticated;
