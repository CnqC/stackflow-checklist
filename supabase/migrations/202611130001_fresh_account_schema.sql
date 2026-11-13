-- StackFlow v3: fresh, account-based schema. Apply to an EMPTY Supabase project.
-- The old PIN schema is archived in supabase/legacy-schema.sql.

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.global_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9-]{1,31}$'),
  name text not null check (length(btrim(name)) between 2 and 120),
  description text not null default '',
  max_members int not null default 20 check (max_members between 3 and 20),
  created_by_user_id uuid references auth.users(id) on delete set null,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  display_name text not null,
  job_title text not null default '',
  access_role text not null default 'member' check (access_role in ('owner', 'member')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (project_id, user_id),
  unique (id, project_id)
);

create table public.project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  invited_email text not null check (invited_email = lower(btrim(invited_email))),
  access_role text not null default 'member' check (access_role in ('owner', 'member')),
  invited_by_user_id uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index project_one_pending_invite
  on public.project_invitations(project_id, invited_email) where status = 'pending';
create index project_invites_by_email
  on public.project_invitations(invited_email, status, expires_at);

create table public.stacks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 160),
  description text not null default '',
  color text not null default '#6366f1',
  position int not null default 0,
  sequential_lock boolean not null default false,
  collapsed boolean not null default false,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  stack_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 240),
  notes text not null default '',
  status text not null default 'todo' check (status in ('todo', 'doing', 'blocked', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  completed boolean not null default false,
  due_date date,
  position int not null default 0,
  created_by_member_id uuid,
  completed_by_member_id uuid,
  completed_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id),
  foreign key (stack_id, project_id) references public.stacks(id, project_id),
  foreign key (created_by_member_id, project_id) references public.project_members(id, project_id),
  foreign key (completed_by_member_id, project_id) references public.project_members(id, project_id)
);

create table public.task_assignees (
  task_id uuid not null,
  member_id uuid not null,
  project_id uuid not null,
  assigned_at timestamptz not null default now(),
  primary key (task_id, member_id),
  foreign key (task_id, project_id) references public.tasks(id, project_id) on delete cascade,
  foreign key (member_id, project_id) references public.project_members(id, project_id)
);

create table public.subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  project_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 240),
  position int not null default 0,
  assignee_member_id uuid,
  completed boolean not null default false,
  completed_by_member_id uuid,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (task_id, project_id) references public.tasks(id, project_id) on delete cascade,
  foreign key (assignee_member_id, project_id) references public.project_members(id, project_id),
  foreign key (completed_by_member_id, project_id) references public.project_members(id, project_id)
);

create index projects_by_creator on public.projects(created_by_user_id);
create index members_by_user on public.project_members(user_id, project_id) where active;
create index stacks_by_project on public.stacks(project_id, position);
create index tasks_by_stack on public.tasks(project_id, stack_id, position);
create index task_assignees_by_member on public.task_assignees(member_id, project_id);
create index subtasks_by_task on public.subtasks(project_id, task_id, position);

revoke all on public.profiles, public.projects, public.project_members,
  public.project_invitations, public.stacks, public.tasks,
  public.task_assignees, public.subtasks from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

create or replace function public.is_global_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.global_admins where user_id = (select auth.uid()));
$$;

create or replace function public.can_read_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (
    public.is_global_admin() or exists (
      select 1 from public.project_members
      where project_id = p_project_id and user_id = (select auth.uid()) and active
    )
  );
$$;

create or replace function public.can_write_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and not public.is_global_admin() and exists (
    select 1 from public.project_members
    where project_id = p_project_id and user_id = (select auth.uid()) and active
  );
$$;

create or replace function public.can_manage_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (
    public.is_global_admin() or exists (
      select 1 from public.project_members
      where project_id = p_project_id and user_id = (select auth.uid())
        and active and access_role = 'owner'
    )
  );
$$;

create or replace function public.my_member_id(p_project_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.project_members
  where project_id = p_project_id and user_id = (select auth.uid()) and active;
$$;

create or replace function public.can_manage_task(p_task_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tasks as task
    where task.id = p_task_id
      and public.can_write_project(task.project_id)
      and (
        task.created_by_member_id = public.my_member_id(task.project_id)
        or exists (
          select 1 from public.project_members as member
          where member.project_id = task.project_id
            and member.user_id = (select auth.uid()) and member.active
            and member.access_role = 'owner'
        )
      )
  );
$$;

revoke all on function public.is_global_admin() from public, anon;
revoke all on function public.can_read_project(uuid) from public, anon;
revoke all on function public.can_write_project(uuid) from public, anon;
revoke all on function public.can_manage_project(uuid) from public, anon;
revoke all on function public.my_member_id(uuid) from public, anon;
revoke all on function public.can_manage_task(uuid) from public, anon;
grant execute on function public.is_global_admin() to authenticated;
grant execute on function public.can_read_project(uuid) to authenticated;
grant execute on function public.can_write_project(uuid) to authenticated;
grant execute on function public.can_manage_project(uuid) to authenticated;
grant execute on function public.my_member_id(uuid) to authenticated;
grant execute on function public.can_manage_task(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_invitations enable row level security;
alter table public.stacks enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.subtasks enable row level security;

create policy profiles_self_read on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy profiles_self_insert on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profiles_self_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy projects_read on public.projects for select to authenticated
  using (public.can_read_project(id));
create policy members_read on public.project_members for select to authenticated
  using (public.can_read_project(project_id));
create policy stacks_read on public.stacks for select to authenticated
  using (public.can_read_project(project_id));
create policy stacks_insert on public.stacks for insert to authenticated
  with check (public.can_write_project(project_id));
create policy stacks_update on public.stacks for update to authenticated
  using (public.can_write_project(project_id))
  with check (public.can_write_project(project_id));
create policy stacks_delete on public.stacks for delete to authenticated
  using (public.can_write_project(project_id) and public.can_manage_project(project_id));
create policy tasks_read on public.tasks for select to authenticated
  using (public.can_read_project(project_id));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.can_write_project(project_id));
create policy tasks_update on public.tasks for update to authenticated
  using (public.can_write_project(project_id))
  with check (public.can_write_project(project_id));
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.can_write_project(project_id));
create policy assignees_read on public.task_assignees for select to authenticated
  using (public.can_read_project(project_id));
create policy assignees_insert on public.task_assignees for insert to authenticated
  with check (public.can_write_project(project_id));
create policy assignees_delete on public.task_assignees for delete to authenticated
  using (public.can_write_project(project_id));
create policy subtasks_read on public.subtasks for select to authenticated
  using (public.can_read_project(project_id));
create policy subtasks_insert on public.subtasks for insert to authenticated
  with check (public.can_write_project(project_id));
create policy subtasks_update on public.subtasks for update to authenticated
  using (public.can_write_project(project_id))
  with check (public.can_write_project(project_id));
create policy subtasks_delete on public.subtasks for delete to authenticated
  using (public.can_write_project(project_id));

grant select, insert, update on public.profiles to authenticated;
grant select on public.projects, public.project_members, public.stacks,
  public.tasks, public.task_assignees, public.subtasks to authenticated;
grant insert, update, delete on public.stacks, public.tasks, public.subtasks to authenticated;
grant insert, delete on public.task_assignees to authenticated;

create or replace function private.bump_row_version()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.project_id is distinct from old.project_id then
    raise exception 'Project cannot be changed';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;
create trigger stack_version before update on public.stacks
  for each row execute function private.bump_row_version();

create or replace function private.enforce_task_write()
returns trigger language plpgsql set search_path = '' as $$
declare
  actor_id uuid;
  manager boolean;
begin
  if tg_op = 'DELETE' then
    if current_setting('request.jwt.claim.role', true) = 'authenticated'
      and not public.can_manage_task(old.id) then
      raise exception 'Only the task creator or project owner may delete it'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if current_setting('request.jwt.claim.role', true) is distinct from 'authenticated' then
    if tg_op = 'UPDATE' then
      new.version := old.version + 1;
      new.updated_at := now();
    end if;
    return new;
  end if;

  actor_id := public.my_member_id(new.project_id);
  if actor_id is null then raise exception 'Project membership required' using errcode = '42501'; end if;

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
    new.status := case when new.completed then 'done' else 'todo' end;
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
create trigger task_guard before insert or update or delete on public.tasks
  for each row execute function private.enforce_task_write();

create or replace function private.enforce_assignee_write()
returns trigger language plpgsql set search_path = '' as $$
declare
  target_task_id uuid;
begin
  target_task_id := case when tg_op = 'DELETE' then old.task_id else new.task_id end;
  if current_setting('request.jwt.claim.role', true) = 'authenticated'
    and not public.can_manage_task(target_task_id) then
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
create trigger assignee_guard before insert or delete on public.task_assignees
  for each row execute function private.enforce_assignee_write();

create or replace function private.enforce_subtask_write()
returns trigger language plpgsql set search_path = '' as $$
declare
  actor_id uuid;
  allowed_member_id uuid;
  manager boolean;
begin
  if tg_op = 'DELETE' then
    if current_setting('request.jwt.claim.role', true) = 'authenticated'
      and not public.can_manage_task(old.task_id) then
      raise exception 'Only the task creator or project owner may delete a subtask'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if current_setting('request.jwt.claim.role', true) is distinct from 'authenticated' then
    if tg_op = 'UPDATE' then
      new.version := old.version + 1;
      new.updated_at := now();
    end if;
    return new;
  end if;
  actor_id := public.my_member_id(new.project_id);
  if actor_id is null then raise exception 'Project membership required' using errcode = '42501'; end if;
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
create trigger subtask_guard before insert or update or delete on public.subtasks
  for each row execute function private.enforce_subtask_write();

create or replace function private.enforce_member_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  project_max int;
begin
  if exists (select 1 from private.global_admins where user_id = new.user_id) then
    raise exception 'Global admin cannot be a project member' using errcode = '42501';
  end if;
  if new.active and (tg_op = 'INSERT' or not old.active) then
    select max_members into project_max from public.projects
    where id = new.project_id for update;
    if (select count(*) from public.project_members
        where project_id = new.project_id and active) >= project_max then
      raise exception 'Project has reached its member limit';
    end if;
  end if;
  return new;
end;
$$;
create trigger member_limit before insert or update of active on public.project_members
  for each row execute function private.enforce_member_limit();

create or replace function private.enforce_admin_separation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.project_members where user_id = new.user_id) then
    raise exception 'Project member cannot become a global admin';
  end if;
  return new;
end;
$$;
create trigger admin_separation before insert on private.global_admins
  for each row execute function private.enforce_admin_separation();

create or replace function public.create_project(
  p_code text, p_name text, p_description text default '', p_owner_email text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := (select auth.uid());
  owner_id uuid;
  owner_name text;
  project_id uuid;
  normalized_code text := upper(btrim(p_code));
  normalized_owner_email text := lower(btrim(p_owner_email));
begin
  if caller_id is null then raise exception 'Login required' using errcode = '42501'; end if;
  if not exists (
    select 1 from auth.users where id = caller_id and email_confirmed_at is not null
  ) then
    raise exception 'Verified Google account required' using errcode = '42501';
  end if;
  if normalized_code is null or normalized_code !~ '^[A-Z0-9][A-Z0-9-]{1,31}$'
    or p_name is null or length(btrim(p_name)) not between 2 and 120 then
    raise exception 'Invalid project code or name';
  end if;
  if public.is_global_admin() then
    if normalized_owner_email is null or normalized_owner_email = '' then
      raise exception 'Global admin must name an owner email';
    end if;
    select id into owner_id from auth.users
    where lower(email) = normalized_owner_email and email_confirmed_at is not null;
  else
    if p_owner_email is not null then
      raise exception 'Only global admin may nominate another owner' using errcode = '42501';
    end if;
    owner_id := caller_id;
  end if;

  insert into public.projects(code, name, description, created_by_user_id)
  values (normalized_code, btrim(p_name), coalesce(btrim(p_description), ''), caller_id)
  returning id into project_id;

  if owner_id is not null then
    select coalesce(nullif(btrim(raw_user_meta_data->>'full_name'), ''),
                    split_part(email, '@', 1))
    into owner_name from auth.users where id = owner_id;
    insert into public.project_members(project_id, user_id, display_name, access_role)
    values (project_id, owner_id, owner_name, 'owner');
  else
    insert into public.project_invitations(
      project_id, invited_email, access_role, invited_by_user_id
    ) values (project_id, normalized_owner_email, 'owner', caller_id);
  end if;
  return project_id;
end;
$$;

create or replace function public.invite_project_member(p_project_id uuid, p_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  normalized_email text := lower(btrim(p_email));
  invite_id uuid;
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'Only an owner or admin may invite' using errcode = '42501';
  end if;
  if normalized_email is null or normalized_email !~ '^[^ @]+@[^ @]+\.[^ @]+$'
    or length(normalized_email) > 320 then
    raise exception 'Invalid email';
  end if;
  if exists (
    select 1 from public.project_members as member
    join auth.users as account on account.id = member.user_id
    where member.project_id = p_project_id and lower(account.email) = normalized_email
  ) then raise exception 'Account is already a member'; end if;

  insert into public.project_invitations(project_id, invited_email, invited_by_user_id)
  values (p_project_id, normalized_email, auth.uid())
  on conflict (project_id, invited_email) where status = 'pending'
  do update set expires_at = now() + interval '7 days',
                invited_by_user_id = excluded.invited_by_user_id
  returning id into invite_id;
  return invite_id;
end;
$$;

create or replace function public.list_my_invitations()
returns table(invitation_id uuid, project_id uuid, project_code text,
              project_name text, expires_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  verified_email text;
begin
  select lower(email) into verified_email from auth.users
  where id = (select auth.uid()) and email_confirmed_at is not null;
  if verified_email is null then
    raise exception 'Verified Google account required' using errcode = '42501';
  end if;
  return query select invitation.id, project.id, project.code,
                      project.name, invitation.expires_at
    from public.project_invitations as invitation
    join public.projects as project on project.id = invitation.project_id
    where invitation.invited_email = verified_email
      and invitation.status = 'pending' and invitation.expires_at > now()
    order by invitation.created_at desc;
end;
$$;

create or replace function public.accept_project_invitation(p_invitation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := (select auth.uid());
  verified_email text;
  invite public.project_invitations%rowtype;
  account_name text;
begin
  if public.is_global_admin() then
    raise exception 'Global admin cannot join project roster' using errcode = '42501';
  end if;
  select lower(email), coalesce(nullif(btrim(raw_user_meta_data->>'full_name'), ''),
                                split_part(email, '@', 1))
  into verified_email, account_name from auth.users
  where id = account_id and email_confirmed_at is not null;
  if verified_email is null then
    raise exception 'Verified Google account required' using errcode = '42501';
  end if;
  select * into invite from public.project_invitations
  where id = p_invitation_id for update;
  if not found or invite.invited_email <> verified_email
    or invite.status <> 'pending' or invite.expires_at <= now() then
    raise exception 'Invitation unavailable' using errcode = '42501';
  end if;
  if exists (select 1 from public.project_members
    where project_id = invite.project_id and user_id = account_id) then
    raise exception 'Already a project member';
  end if;
  insert into public.project_members(project_id, user_id, display_name, access_role)
  values (invite.project_id, account_id, account_name, invite.access_role);
  update public.project_invitations set status = 'accepted', accepted_at = now()
  where id = invite.id;
  return invite.project_id;
end;
$$;

create or replace function public.update_project_info(
  p_project_id uuid, p_name text, p_description text, p_expected_version bigint
)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  next_version bigint;
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'Only owner or admin may edit project information' using errcode = '42501';
  end if;
  if p_name is null or length(btrim(p_name)) not between 2 and 120
    or p_description is null or length(p_description) > 4000 then
    raise exception 'Invalid project information';
  end if;
  update public.projects
  set name = btrim(p_name), description = btrim(p_description),
      version = version + 1, updated_at = now()
  where id = p_project_id and version = p_expected_version
  returning version into next_version;
  if next_version is null then
    raise exception 'Project version conflict' using errcode = '40001';
  end if;
  return next_version;
end;
$$;

revoke all on function public.create_project(text, text, text, text) from public, anon;
revoke all on function public.invite_project_member(uuid, text) from public, anon;
revoke all on function public.list_my_invitations() from public, anon;
revoke all on function public.accept_project_invitation(uuid) from public, anon;
revoke all on function public.update_project_info(uuid, text, text, bigint) from public, anon;
grant execute on function public.create_project(text, text, text, text) to authenticated;
grant execute on function public.invite_project_member(uuid, text) to authenticated;
grant execute on function public.list_my_invitations() to authenticated;
grant execute on function public.accept_project_invitation(uuid) to authenticated;
grant execute on function public.update_project_info(uuid, text, text, bigint) to authenticated;

create or replace function public.create_task_with_assignees(
  p_project_id uuid, p_stack_id uuid, p_title text, p_notes text,
  p_priority text, p_due_date date, p_assignee_member_ids uuid[]
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_task_id uuid;
  requested_count int;
  valid_count int;
begin
  if not public.can_write_project(p_project_id) then
    raise exception 'Project membership required' using errcode = '42501';
  end if;
  if p_assignee_member_ids is null then p_assignee_member_ids := '{}'::uuid[]; end if;
  select count(distinct member_id) into requested_count
  from unnest(p_assignee_member_ids) as chosen(member_id);
  select count(*) into valid_count from public.project_members
  where id = any(p_assignee_member_ids) and project_id = p_project_id and active;
  if requested_count <> valid_count then
    raise exception 'Assignees must be active project members';
  end if;
  insert into public.tasks(project_id, stack_id, title, notes, priority, due_date)
  values (p_project_id, p_stack_id, p_title, coalesce(p_notes, ''),
          coalesce(p_priority, 'medium'), p_due_date)
  returning id into new_task_id;
  insert into public.task_assignees(task_id, member_id, project_id)
  select new_task_id, member_id, p_project_id
  from (select distinct member_id from unnest(p_assignee_member_ids) as chosen(member_id)) as selected;
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
  select count(*) into valid_count from public.project_members
  where id = any(p_assignee_member_ids) and project_id = task_row.project_id and active;
  if requested_count <> valid_count then
    raise exception 'Assignees must be active project members';
  end if;
  delete from public.task_assignees where task_id = p_task_id;
  insert into public.task_assignees(task_id, member_id, project_id)
  select p_task_id, member_id, task_row.project_id
  from (select distinct member_id from unnest(p_assignee_member_ids) as chosen(member_id)) as selected;
  update public.tasks set updated_at = now() where id = p_task_id
  returning version into next_version;
  return next_version;
end;
$$;

revoke all on function public.create_task_with_assignees(uuid, uuid, text, text, text, date, uuid[])
  from public, anon;
revoke all on function public.set_task_assignees(uuid, bigint, uuid[])
  from public, anon;
grant execute on function public.create_task_with_assignees(uuid, uuid, text, text, text, date, uuid[])
  to authenticated;
grant execute on function public.set_task_assignees(uuid, bigint, uuid[])
  to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array['projects', 'project_members', 'stacks',
    'tasks', 'task_assignees', 'subtasks'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
