-- Documents attached to an account-based task. Apply only after migrations 001-003.
create table public.task_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  task_id uuid not null,
  label text not null check (length(btrim(label)) between 1 and 160),
  url text not null check (url ~* '^https?://[^[:space:]]+$' and length(url) <= 2048),
  position int not null default 0,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (task_id, project_id) references public.tasks(id, project_id) on delete cascade
);

create index task_links_by_task on public.task_links(project_id, task_id, position);
revoke all on public.task_links from public, anon, authenticated;
alter table public.task_links enable row level security;

create policy task_links_read on public.task_links for select to authenticated
  using (public.can_read_project(project_id));
create policy task_links_insert on public.task_links for insert to authenticated
  with check (public.can_manage_task(task_id));
create policy task_links_update on public.task_links for update to authenticated
  using (public.can_manage_task(task_id))
  with check (public.can_manage_task(task_id));
create policy task_links_delete on public.task_links for delete to authenticated
  using (public.can_manage_task(task_id));
grant select, insert, update, delete on public.task_links to authenticated;

create trigger task_link_version before update on public.task_links
  for each row execute function private.bump_row_version();

-- Prevent changing a link's task or project, even when both happen to be writable.
create function private.enforce_task_link_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.project_id is distinct from old.project_id or new.task_id is distinct from old.task_id then
    raise exception 'Task link ownership cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger task_link_identity before update on public.task_links
  for each row execute function private.enforce_task_link_identity();

alter publication supabase_realtime add table public.task_links;
