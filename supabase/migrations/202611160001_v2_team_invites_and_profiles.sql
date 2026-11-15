-- StackFlow v3 -> V2 App Parity: Multi-channel invitations (Email + Quick Join Code/Link),
-- Pending/Revoke/Decline invitation lifecycle, Member V2 Avatar Colors & Roles, and RLS.

alter table public.project_members
  add column if not exists avatar_color text not null default '#6366f1'
    check (avatar_color ~ '^#[0-9a-fA-F]{6}$');

alter table public.project_invitations
  add column if not exists invited_job_title text not null default ''
    check (length(invited_job_title) <= 80);

alter table public.project_invitations
  drop constraint if exists project_invitations_status_check;
alter table public.project_invitations
  add constraint project_invitations_status_check
  check (status in ('pending', 'accepted', 'revoked', 'declined'));

alter table public.activity_logs
  drop constraint if exists activity_logs_action_type_check;
alter table public.activity_logs
  add constraint activity_logs_action_type_check
  check (action_type in (
    'create_task', 'update_task', 'delete_task', 'check', 'uncheck',
    'create_stack', 'update_stack', 'delete_stack',
    'create_subtask', 'update_subtask', 'delete_subtask',
    'join_member'
  ));

create table public.project_join_links (
  project_id uuid primary key references public.projects(id) on delete cascade,
  join_code text not null unique check (join_code ~ '^SF-[A-Z0-9]{6,12}$'),
  enabled boolean not null default true,
  default_job_title text not null default '' check (length(default_job_title) <= 80),
  expires_at timestamptz,
  use_count int not null default 0 check (use_count >= 0),
  updated_by_user_id uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

revoke all on public.project_join_links from public, anon, authenticated;
alter table public.project_join_links enable row level security;

create policy project_join_links_manage_read on public.project_join_links
  for select to authenticated
  using (public.can_manage_project(project_id));

grant select on public.project_join_links to authenticated;

create or replace function private.generate_join_code()
returns text language plpgsql security definer set search_path = '' as $$
declare
  candidate text;
begin
  loop
    candidate := 'SF-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (
      select 1 from public.project_join_links where join_code = candidate
    );
  end loop;
  return candidate;
end;
$$;

create or replace function private.pick_member_color(p_project_id uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  palette text[] := array[
    '#6366f1', '#10b981', '#0ea5e9', '#f59e0b', '#ec4899',
    '#8b5cf6', '#14b8a6', '#f97316', '#ef4444', '#84cc16'
  ];
  member_count int;
begin
  select count(*)::int into member_count
  from public.project_members where project_id = p_project_id;
  return palette[(member_count % array_length(palette, 1)) + 1];
end;
$$;

revoke all on function private.generate_join_code() from public, anon, authenticated;
revoke all on function private.pick_member_color(uuid) from public, anon, authenticated;

insert into public.project_join_links(project_id, join_code, enabled)
select p.id, private.generate_join_code(), true
from public.projects as p
where not exists (
  select 1 from public.project_join_links as link where link.project_id = p.id
);

drop function if exists public.create_project(text, text, text, text);
create or replace function public.create_project(
  p_code text,
  p_name text,
  p_description text default '',
  p_owner_email text default null,
  p_job_title text default '',
  p_avatar_color text default '#6366f1'
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := (select auth.uid());
  owner_id uuid;
  owner_name text;
  project_id uuid;
  normalized_code text := upper(btrim(p_code));
  normalized_owner_email text := lower(btrim(p_owner_email));
  clean_role text := coalesce(btrim(p_job_title), '');
  chosen_color text := coalesce(nullif(btrim(p_avatar_color), ''), '#6366f1');
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
  if length(clean_role) > 80 or chosen_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Invalid member profile configuration';
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

  insert into public.project_join_links(project_id, join_code, enabled, updated_by_user_id)
  values (project_id, private.generate_join_code(), true, caller_id);

  if owner_id is not null then
    select coalesce(
      (select nullif(btrim(display_name), '') from public.profiles where user_id = owner_id),
      nullif(btrim(raw_user_meta_data->>'full_name'), ''),
      split_part(email, '@', 1)
    )
    into owner_name from auth.users where id = owner_id;

    insert into public.project_members(
      project_id, user_id, display_name, job_title, access_role, avatar_color
    ) values (
      project_id, owner_id, owner_name, clean_role, 'owner', chosen_color
    );

    insert into public.profiles(user_id, display_name, updated_at)
    values (owner_id, owner_name, now())
    on conflict (user_id) do nothing;
  else
    insert into public.project_invitations(
      project_id, invited_email, invited_job_title, access_role, invited_by_user_id
    ) values (project_id, normalized_owner_email, clean_role, 'owner', caller_id);
  end if;
  return project_id;
end;
$$;

drop function if exists public.invite_project_member(uuid, text);
create or replace function public.invite_project_member(
  p_project_id uuid,
  p_email text,
  p_job_title text default ''
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  normalized_email text := lower(btrim(p_email));
  clean_role text := coalesce(btrim(p_job_title), '');
  invite_id uuid;
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'Only an owner or admin may invite' using errcode = '42501';
  end if;
  if normalized_email is null or normalized_email !~ '^[^ @]+@[^ @]+\.[^ @]+$'
    or length(normalized_email) > 320 then
    raise exception 'Invalid email';
  end if;
  if length(clean_role) > 80 then
    raise exception 'Invalid job title';
  end if;
  if exists (
    select 1 from public.project_members as member
    join auth.users as account on account.id = member.user_id
    where member.project_id = p_project_id
      and lower(account.email) = normalized_email
      and member.active
  ) then
    raise exception 'Account is already a member';
  end if;

  insert into public.project_invitations(
    project_id, invited_email, invited_job_title, invited_by_user_id
  )
  values (p_project_id, normalized_email, clean_role, (select auth.uid()))
  on conflict (project_id, invited_email) where status = 'pending'
  do update set expires_at = now() + interval '7 days',
                invited_job_title = excluded.invited_job_title,
                invited_by_user_id = excluded.invited_by_user_id
  returning id into invite_id;
  return invite_id;
end;
$$;

drop function if exists public.list_my_invitations();
create or replace function public.list_my_invitations()
returns table(
  invitation_id uuid,
  project_id uuid,
  project_code text,
  project_name text,
  invited_job_title text,
  expires_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare
  verified_email text;
begin
  select lower(email) into verified_email from auth.users
  where id = (select auth.uid()) and email_confirmed_at is not null;
  if verified_email is null then
    raise exception 'Verified Google account required' using errcode = '42501';
  end if;
  return query
    select invitation.id, project.id, project.code,
           project.name, invitation.invited_job_title, invitation.expires_at
    from public.project_invitations as invitation
    join public.projects as project on project.id = invitation.project_id
    where invitation.invited_email = verified_email
      and invitation.status = 'pending'
      and invitation.expires_at > now()
    order by invitation.created_at desc;
end;
$$;

create or replace function public.list_project_pending_invitations(p_project_id uuid)
returns table(
  id uuid,
  invited_email text,
  invited_job_title text,
  access_role text,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'Only owner or admin may view pending invitations' using errcode = '42501';
  end if;
  return query
    select inv.id, inv.invited_email, inv.invited_job_title,
           inv.access_role, inv.expires_at, inv.created_at
    from public.project_invitations as inv
    where inv.project_id = p_project_id
      and inv.status = 'pending'
      and inv.expires_at > now()
    order by inv.created_at desc;
end;
$$;

create or replace function public.revoke_project_invitation(p_invitation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  invite public.project_invitations%rowtype;
begin
  select * into invite from public.project_invitations
  where id = p_invitation_id for update;
  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if not public.can_manage_project(invite.project_id) then
    raise exception 'Only owner or admin may revoke invitations' using errcode = '42501';
  end if;
  if invite.status = 'pending' then
    update public.project_invitations set status = 'revoked' where id = invite.id;
  end if;
end;
$$;

create or replace function public.decline_project_invitation(p_invitation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  verified_email text;
  invite public.project_invitations%rowtype;
begin
  select lower(email) into verified_email from auth.users
  where id = (select auth.uid()) and email_confirmed_at is not null;
  if verified_email is null then
    raise exception 'Verified Google account required' using errcode = '42501';
  end if;
  select * into invite from public.project_invitations
  where id = p_invitation_id for update;
  if not found or invite.invited_email <> verified_email or invite.status <> 'pending' then
    raise exception 'Invitation unavailable' using errcode = '42501';
  end if;
  update public.project_invitations set status = 'declined' where id = invite.id;
end;
$$;

create or replace function public.accept_project_invitation(p_invitation_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  account_id uuid := (select auth.uid());
  verified_email text;
  invite public.project_invitations%rowtype;
  existing_member public.project_members%rowtype;
  account_name text;
  project_title text;
begin
  if public.is_global_admin() then
    raise exception 'Global admin cannot join project roster' using errcode = '42501';
  end if;
  select lower(email), coalesce(
    (select nullif(btrim(display_name), '') from public.profiles where user_id = account_id),
    nullif(btrim(raw_user_meta_data->>'full_name'), ''),
    split_part(email, '@', 1)
  )
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

  select * into existing_member from public.project_members
  where project_id = invite.project_id and user_id = account_id for update;

  if found then
    if existing_member.active then
      raise exception 'Already a project member';
    end if;
    update public.project_members
    set active = true,
        access_role = invite.access_role,
        job_title = coalesce(nullif(btrim(invite.invited_job_title), ''), existing_member.job_title)
    where id = existing_member.id;
  else
    insert into public.project_members(
      project_id, user_id, display_name, job_title, access_role, avatar_color
    ) values (
      invite.project_id,
      account_id,
      account_name,
      coalesce(btrim(invite.invited_job_title), ''),
      invite.access_role,
      private.pick_member_color(invite.project_id)
    );
  end if;

  update public.project_invitations
  set status = 'accepted', accepted_at = now()
  where id = invite.id;

  select name into project_title from public.projects where id = invite.project_id;
  insert into public.activity_logs(
    project_id, actor_user_id, actor_name, action_type, target_title, detail
  ) values (
    invite.project_id, account_id, account_name, 'join_member',
    coalesce(project_title, 'Dự án'), 'Tham gia qua lời mời Email'
  );

  return invite.project_id;
end;
$$;

create or replace function public.get_project_join_link(p_project_id uuid)
returns table(
  project_id uuid,
  join_code text,
  enabled boolean,
  default_job_title text,
  expires_at timestamptz,
  use_count int
)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'Only owner or admin may view join link' using errcode = '42501';
  end if;
  if not exists (select 1 from public.projects where id = p_project_id) then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;

  insert into public.project_join_links(project_id, join_code, enabled, updated_by_user_id)
  values (p_project_id, private.generate_join_code(), true, (select auth.uid()))
  on conflict on constraint project_join_links_pkey do nothing;

  return query
    select link.project_id, link.join_code, link.enabled,
           link.default_job_title, link.expires_at, link.use_count
    from public.project_join_links as link
    where link.project_id = p_project_id;
end;
$$;

create or replace function public.configure_project_join_link(
  p_project_id uuid,
  p_enabled boolean,
  p_regenerate boolean default false,
  p_default_job_title text default null,
  p_expires_in_days int default null
)
returns table(
  project_id uuid,
  join_code text,
  enabled boolean,
  default_job_title text,
  expires_at timestamptz,
  use_count int
)
language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'Only owner or admin may configure join link' using errcode = '42501';
  end if;
  if p_default_job_title is not null and length(btrim(p_default_job_title)) > 80 then
    raise exception 'Default job title too long';
  end if;

  insert into public.project_join_links(project_id, join_code, enabled, updated_by_user_id)
  values (p_project_id, private.generate_join_code(), coalesce(p_enabled, true), (select auth.uid()))
  on conflict on constraint project_join_links_pkey do nothing;

  update public.project_join_links as link
  set enabled = coalesce(p_enabled, link.enabled),
      join_code = case when coalesce(p_regenerate, false) then private.generate_join_code() else link.join_code end,
      default_job_title = case
        when p_default_job_title is null then link.default_job_title
        else btrim(p_default_job_title)
      end,
      expires_at = case
        when p_expires_in_days is null then link.expires_at
        when p_expires_in_days <= 0 then null
        else now() + make_interval(days => p_expires_in_days)
      end,
      updated_by_user_id = (select auth.uid()),
      updated_at = now()
  where link.project_id = p_project_id;

  return query
    select link.project_id, link.join_code, link.enabled,
           link.default_job_title, link.expires_at, link.use_count
    from public.project_join_links as link
    where link.project_id = p_project_id;
end;
$$;

create or replace function public.preview_project_by_join_code(p_join_code text)
returns table(
  project_id uuid,
  project_code text,
  project_name text,
  default_job_title text,
  already_member boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  caller_id uuid := (select auth.uid());
  normalized_code text := upper(btrim(p_join_code));
begin
  if caller_id is null or public.is_global_admin() then
    raise exception 'Member account required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from auth.users where id = caller_id and email_confirmed_at is not null
  ) then
    raise exception 'Verified Google account required' using errcode = '42501';
  end if;

  return query
    select proj.id, proj.code, proj.name, link.default_job_title,
           exists (
             select 1 from public.project_members as m
             where m.project_id = proj.id and m.user_id = caller_id and m.active
           )
    from public.project_join_links as link
    join public.projects as proj on proj.id = link.project_id
    where link.join_code = normalized_code
      and link.enabled
      and (link.expires_at is null or link.expires_at > now());
end;
$$;

create or replace function public.join_project_by_code(
  p_join_code text,
  p_job_title text default ''
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := (select auth.uid());
  verified_email text;
  account_name text;
  normalized_code text := upper(btrim(p_join_code));
  clean_role text := coalesce(btrim(p_job_title), '');
  link_row public.project_join_links%rowtype;
  existing_member public.project_members%rowtype;
  project_title text;
begin
  if caller_id is null or public.is_global_admin() then
    raise exception 'Global admin cannot join project roster' using errcode = '42501';
  end if;
  if length(clean_role) > 80 then
    raise exception 'Invalid job title';
  end if;

  select lower(email), coalesce(
    (select nullif(btrim(display_name), '') from public.profiles where user_id = caller_id),
    nullif(btrim(raw_user_meta_data->>'full_name'), ''),
    split_part(email, '@', 1)
  )
  into verified_email, account_name from auth.users
  where id = caller_id and email_confirmed_at is not null;

  if verified_email is null then
    raise exception 'Verified Google account required' using errcode = '42501';
  end if;

  select * into link_row from public.project_join_links
  where join_code = normalized_code for update;

  if not found or not link_row.enabled
    or (link_row.expires_at is not null and link_row.expires_at <= now()) then
    raise exception 'Join code unavailable or expired' using errcode = '42501';
  end if;

  select * into existing_member from public.project_members
  where project_id = link_row.project_id and user_id = caller_id for update;

  if found then
    if existing_member.active then
      return link_row.project_id;
    end if;
    raise exception 'Member access is currently paused by project owner' using errcode = '42501';
  end if;

  insert into public.project_members(
    project_id, user_id, display_name, job_title, access_role, avatar_color
  ) values (
    link_row.project_id,
    caller_id,
    account_name,
    coalesce(nullif(clean_role, ''), link_row.default_job_title, ''),
    'member',
    private.pick_member_color(link_row.project_id)
  );

  update public.project_join_links
  set use_count = use_count + 1, updated_at = now()
  where project_id = link_row.project_id;

  update public.project_invitations
  set status = 'accepted', accepted_at = now()
  where project_id = link_row.project_id
    and invited_email = verified_email
    and status = 'pending';

  select name into project_title from public.projects where id = link_row.project_id;
  insert into public.activity_logs(
    project_id, actor_user_id, actor_name, action_type, target_title, detail
  ) values (
    link_row.project_id, caller_id, account_name, 'join_member',
    coalesce(project_title, 'Dự án'), 'Tham gia qua mã mời ' || link_row.join_code
  );

  return link_row.project_id;
end;
$$;

create or replace function public.update_my_project_profile(
  p_project_id uuid,
  p_display_name text,
  p_job_title text default '',
  p_avatar_color text default '#6366f1'
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  caller_id uuid := (select auth.uid());
  clean_name text := btrim(p_display_name);
  clean_role text := coalesce(btrim(p_job_title), '');
  clean_color text := coalesce(nullif(btrim(p_avatar_color), ''), '#6366f1');
begin
  if not public.can_write_project(p_project_id) then
    raise exception 'Active project membership required' using errcode = '42501';
  end if;
  if clean_name is null or length(clean_name) not between 1 and 80 then
    raise exception 'Invalid display name';
  end if;
  if length(clean_role) > 80 or clean_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Invalid member profile';
  end if;

  update public.project_members
  set display_name = clean_name,
      job_title = clean_role,
      avatar_color = clean_color
  where project_id = p_project_id and user_id = caller_id and active;

  insert into public.profiles(user_id, display_name, updated_at)
  values (caller_id, clean_name, now())
  on conflict (user_id) do update
    set display_name = excluded.display_name,
        updated_at = now();
end;
$$;

create or replace function public.update_project_member_role(
  p_project_id uuid,
  p_member_id uuid,
  p_job_title text default ''
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  clean_role text := coalesce(btrim(p_job_title), '');
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'Only owner or admin may update member role' using errcode = '42501';
  end if;
  if length(clean_role) > 80 then
    raise exception 'Invalid job title';
  end if;
  update public.project_members
  set job_title = clean_role
  where project_id = p_project_id and id = p_member_id;
  if not found then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.create_project(text, text, text, text, text, text) from public, anon;
revoke all on function public.invite_project_member(uuid, text, text) from public, anon;
revoke all on function public.list_my_invitations() from public, anon;
revoke all on function public.list_project_pending_invitations(uuid) from public, anon;
revoke all on function public.revoke_project_invitation(uuid) from public, anon;
revoke all on function public.decline_project_invitation(uuid) from public, anon;
revoke all on function public.accept_project_invitation(uuid) from public, anon;
revoke all on function public.get_project_join_link(uuid) from public, anon;
revoke all on function public.configure_project_join_link(uuid, boolean, boolean, text, int) from public, anon;
revoke all on function public.preview_project_by_join_code(text) from public, anon;
revoke all on function public.join_project_by_code(text, text) from public, anon;
revoke all on function public.update_my_project_profile(uuid, text, text, text) from public, anon;
revoke all on function public.update_project_member_role(uuid, uuid, text) from public, anon;

grant execute on function public.create_project(text, text, text, text, text, text) to authenticated;
grant execute on function public.invite_project_member(uuid, text, text) to authenticated;
grant execute on function public.list_my_invitations() to authenticated;
grant execute on function public.list_project_pending_invitations(uuid) to authenticated;
grant execute on function public.revoke_project_invitation(uuid) to authenticated;
grant execute on function public.decline_project_invitation(uuid) to authenticated;
grant execute on function public.accept_project_invitation(uuid) to authenticated;
grant execute on function public.get_project_join_link(uuid) to authenticated;
grant execute on function public.configure_project_join_link(uuid, boolean, boolean, text, int) to authenticated;
grant execute on function public.preview_project_by_join_code(text) to authenticated;
grant execute on function public.join_project_by_code(text, text) to authenticated;
grant execute on function public.update_my_project_profile(uuid, text, text, text) to authenticated;
grant execute on function public.update_project_member_role(uuid, uuid, text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'project_join_links'
  ) then
    alter publication supabase_realtime add table public.project_join_links;
  end if;
end $$;
