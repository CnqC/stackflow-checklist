-- The sequential Stack rule must be enforced in PostgreSQL, not only in the UI.
create function private.enforce_sequential_task_completion()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_setting('request.jwt.claim.role', true) = 'authenticated'
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

create trigger task_sequence_guard before update of completed on public.tasks
  for each row execute function private.enforce_sequential_task_completion();
