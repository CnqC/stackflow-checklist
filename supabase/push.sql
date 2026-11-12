-- Run after schema.sql. Push devices and events are private to Edge Functions.
create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  platform text not null check (platform in ('android', 'web')),
  token text not null,
  subscription jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, token)
);

create index if not exists idx_push_devices_member on public.push_devices(workspace_id, member_id);
alter table public.push_devices enable row level security;
revoke all on public.push_devices from anon, authenticated;

create table if not exists public.assignment_push_events (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  task_id uuid not null,
  kind text not null check (kind in ('task_assigned', 'subtask_assigned')),
  actor_name text not null,
  task_title text not null,
  subtask_title text,
  stack_id uuid not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text
);

create index if not exists idx_assignment_push_events_pending
  on public.assignment_push_events(created_at) where sent_at is null;
alter table public.assignment_push_events enable row level security;
revoke all on public.assignment_push_events from anon, authenticated;

create or replace function public.record_assignment_push_events()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  before_ids uuid[] := '{}';
  after_ids uuid[] := '{}';
  target_id uuid;
  sub jsonb;
  previous_sub jsonb;
  event_time text;
  actor text;
begin
  if tg_op = 'UPDATE' then
    before_ids := case
      when coalesce(array_length(old.assignee_ids, 1), 0) > 0 then old.assignee_ids
      when old.assignee_id is not null then array[old.assignee_id]
      else '{}'::uuid[] end;
  end if;
  after_ids := case
    when coalesce(array_length(new.assignee_ids, 1), 0) > 0 then new.assignee_ids
    when new.assignee_id is not null then array[new.assignee_id]
    else '{}'::uuid[] end;
  event_time := to_char(new.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  actor := coalesce(nullif(trim(new.updated_by_name), ''), 'Đồng đội');

  if not new.completed then
    foreach target_id in array after_ids loop
      if not target_id = any(before_ids) and exists (
        select 1 from public.members m where m.id = target_id and m.workspace_id = new.workspace_id
          and lower(trim(m.name)) <> lower(actor)
      ) then
        insert into public.assignment_push_events
          (id, workspace_id, member_id, task_id, kind, actor_name, task_title, stack_id, created_at)
        values
          ('notice:task:' || new.workspace_id || ':' || new.id || ':' || target_id || ':' || event_time,
           new.workspace_id, target_id, new.id, 'task_assigned', actor, new.title, new.stack_id, new.updated_at)
        on conflict (id) do nothing;
      end if;
    end loop;
  end if;

  for sub in select value from jsonb_array_elements(
    case when jsonb_typeof(new.subtasks) = 'array' then new.subtasks else '[]'::jsonb end
  ) loop
    if coalesce(sub->>'assigneeId', '') = '' or coalesce((sub->>'completed')::boolean, false) then
      continue;
    end if;
    begin
      target_id := (sub->>'assigneeId')::uuid;
    exception when invalid_text_representation then
      continue;
    end;
    if not exists (
      select 1 from public.members m where m.id = target_id and m.workspace_id = new.workspace_id
        and lower(trim(m.name)) <> lower(actor)
    ) then
      continue;
    end if;
    previous_sub := null;
    if tg_op = 'UPDATE' then
      select value into previous_sub from jsonb_array_elements(
        case when jsonb_typeof(old.subtasks) = 'array' then old.subtasks else '[]'::jsonb end
      ) where value->>'id' = sub->>'id' limit 1;
    end if;
    if previous_sub is null or previous_sub->>'assigneeId' is distinct from sub->>'assigneeId' then
      insert into public.assignment_push_events
        (id, workspace_id, member_id, task_id, kind, actor_name, task_title, subtask_title, stack_id, created_at)
      values
        ('notice:subtask:' || new.workspace_id || ':' || new.id || ':' || (sub->>'id') || ':' || target_id || ':' || event_time,
         new.workspace_id, target_id, new.id, 'subtask_assigned', actor, new.title,
         coalesce(sub->>'title', new.title), new.stack_id, new.updated_at)
      on conflict (id) do nothing;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_record_assignment_push_events on public.checklist_items;
create trigger trg_record_assignment_push_events
after insert or update of assignee_id, assignee_ids, subtasks on public.checklist_items
for each row execute function public.record_assignment_push_events();
