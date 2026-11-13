-- Keep Stack creation atomic while preserving every field from the original form.
alter table public.stacks add column priority text not null default 'medium'
  constraint stacks_priority_valid check (priority in ('low', 'medium', 'high'));

create function public.create_stack(
  p_project_id uuid, p_title text, p_description text, p_color text,
  p_sequential_lock boolean, p_priority text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
  next_position int;
begin
  if not public.can_write_project(p_project_id) then
    raise exception 'Project membership required' using errcode = '42501';
  end if;
  if p_color not in ('#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6') then
    raise exception 'Invalid Stack color';
  end if;
  if p_priority not in ('low', 'medium', 'high') then
    raise exception 'Invalid Stack priority';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_project_id::text));
  select coalesce(max(position), -1) + 1 into next_position
    from public.stacks where project_id = p_project_id;
  insert into public.stacks(project_id, title, description, color, sequential_lock, priority, position)
    values (p_project_id, p_title, coalesce(p_description, ''), p_color,
      coalesce(p_sequential_lock, false), p_priority, next_position)
    returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.create_stack(uuid, text, text, text, boolean, text) from public, anon;
grant execute on function public.create_stack(uuid, text, text, text, boolean, text) to authenticated;
