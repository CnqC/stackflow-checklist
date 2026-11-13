-- Account-based project operations. Disabled until the RLS cutover sets accounts_enabled.
-- This prevents account projects being exposed by the existing permissive legacy policies.

create table if not exists private.security_state (
  singleton boolean primary key default true check (singleton),
  accounts_enabled boolean not null default false,
  enabled_at timestamptz
);

insert into private.security_state (singleton, accounts_enabled)
values (true, false) on conflict (singleton) do nothing;
revoke all on private.security_state from public, anon, authenticated;

create or replace function private.require_account_projects_enabled()
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from private.security_state
    where singleton and accounts_enabled
  ) then
    raise exception 'Account projects are unavailable before the security cutover'
      using errcode = '55000';
  end if;
end;
$$;
revoke all on function private.require_account_projects_enabled() from public, anon, authenticated;

create or replace function public.create_account_project(
  p_code text,
  p_name text,
  p_description text default '',
  p_owner_user_id uuid default null
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  owner_id uuid;
  owner_name text;
  project_id uuid;
  normalized_code text := upper(btrim(p_code));
begin
  perform private.require_account_projects_enabled();
  if caller_id is null then
    raise exception 'Login required' using errcode = '42501';
  end if;
  if normalized_code is null or p_name is null
    or normalized_code !~ '^[A-Z0-9][A-Z0-9-]{1,31}$'
    or length(btrim(p_name)) not between 2 and 120 then
    raise exception 'Invalid project code or name';
  end if;

  if public.is_global_admin() then
    owner_id := p_owner_user_id;
    if owner_id is null or owner_id = caller_id then
      raise exception 'Global admin must select a separate project owner';
    end if;
  else
    if p_owner_user_id is not null and p_owner_user_id <> caller_id then
      raise exception 'Only a global admin may nominate another owner'
        using errcode = '42501';
    end if;
    owner_id := caller_id;
  end if;

  select coalesce(nullif(btrim(profile.display_name), ''), split_part(account.email, '@', 1))
  into owner_name
  from auth.users as account
  left join public.profiles as profile on profile.user_id = account.id
  where account.id = owner_id and account.email_confirmed_at is not null;
  if not found then raise exception 'Owner must have a verified account'; end if;
  if exists (select 1 from private.global_admins where user_id = owner_id) then
    raise exception 'Global admin cannot be a project owner';
  end if;

  insert into public.workspaces (
    code, name, description, pin_code, creator_user_id
  ) values (
    normalized_code, btrim(p_name), coalesce(btrim(p_description), ''),
    encode(gen_random_bytes(32), 'hex'), caller_id
  ) returning id into project_id;

  insert into public.members (workspace_id, user_id, name, access_role)
  values (project_id, owner_id, owner_name, 'owner');

  return project_id;
end;
$$;

revoke all on function public.create_account_project(text, text, text, uuid) from public, anon;
grant execute on function public.create_account_project(text, text, text, uuid) to authenticated;

create or replace function public.invite_account_member(
  p_workspace_id uuid,
  p_email text
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  normalized_email text := lower(btrim(p_email));
  invite_id uuid;
begin
  perform private.require_account_projects_enabled();
  if caller_id is null then raise exception 'Login required' using errcode = '42501'; end if;
  if not public.is_global_admin() and not exists (
    select 1 from public.members
    where workspace_id = p_workspace_id and user_id = caller_id and access_role = 'owner'
  ) then
    raise exception 'Only a project owner may invite members' using errcode = '42501';
  end if;
  if normalized_email is null or normalized_email !~ '^[^ @]+@[^ @]+\.[^ @]+$'
    or length(normalized_email) > 320 then
    raise exception 'Invalid invitation email';
  end if;
  if exists (
    select 1 from public.members as member
    join auth.users as account on account.id = member.user_id
    where member.workspace_id = p_workspace_id and lower(account.email) = normalized_email
  ) then
    raise exception 'Account is already a project member';
  end if;

  insert into public.project_invitations (
    workspace_id, invited_email, invited_by_user_id
  ) values (
    p_workspace_id, normalized_email, caller_id
  )
  on conflict (workspace_id, invited_email) where status = 'pending'
  do update set expires_at = now() + interval '7 days',
                invited_by_user_id = excluded.invited_by_user_id
  returning id into invite_id;

  return invite_id;
end;
$$;

revoke all on function public.invite_account_member(uuid, text) from public, anon;
grant execute on function public.invite_account_member(uuid, text) to authenticated;

create or replace function public.list_account_invitations()
returns table (
  invitation_id uuid,
  workspace_id uuid,
  workspace_code text,
  workspace_name text,
  expires_at timestamptz
)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  verified_email text;
begin
  perform private.require_account_projects_enabled();
  select lower(email) into verified_email
  from auth.users
  where id = (select auth.uid()) and email_confirmed_at is not null;
  if verified_email is null then
    raise exception 'Verified login required' using errcode = '42501';
  end if;
  return query
    select invitation.id, workspace.id, workspace.code, workspace.name,
           invitation.expires_at
    from public.project_invitations as invitation
    join public.workspaces as workspace on workspace.id = invitation.workspace_id
    where invitation.invited_email = verified_email
      and invitation.status = 'pending'
      and invitation.expires_at > now()
    order by invitation.created_at desc;
end;
$$;

revoke all on function public.list_account_invitations() from public, anon;
grant execute on function public.list_account_invitations() to authenticated;

create or replace function public.accept_account_invitation(p_invitation_id uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  verified_email text;
  invite public.project_invitations%rowtype;
  display_name text;
begin
  perform private.require_account_projects_enabled();
  select lower(email) into verified_email
  from auth.users
  where id = caller_id and email_confirmed_at is not null;
  if verified_email is null then
    raise exception 'Verified login required' using errcode = '42501';
  end if;
  if public.is_global_admin() then
    raise exception 'Global admin cannot join a project' using errcode = '42501';
  end if;

  select * into invite from public.project_invitations
  where id = p_invitation_id for update;
  if not found or invite.invited_email <> verified_email
    or invite.status <> 'pending' or invite.expires_at <= now() then
    raise exception 'Invitation is unavailable' using errcode = '42501';
  end if;

  perform 1 from public.workspaces where id = invite.workspace_id for update;
  if exists (
    select 1 from public.members
    where workspace_id = invite.workspace_id and user_id = caller_id
  ) then
    raise exception 'Already a project member';
  end if;

  select coalesce(nullif(btrim(profile.display_name), ''), split_part(verified_email, '@', 1))
  into display_name
  from public.profiles as profile where profile.user_id = caller_id;
  display_name := coalesce(display_name, split_part(verified_email, '@', 1));
  if exists (
    select 1 from public.members
    where workspace_id = invite.workspace_id and name = display_name
  ) then
    display_name := display_name || ' ' || left(caller_id::text, 8);
  end if;

  insert into public.members (workspace_id, user_id, name, access_role)
  values (invite.workspace_id, caller_id, display_name, 'member');
  update public.project_invitations
  set status = 'accepted', accepted_at = now() where id = invite.id;

  return invite.workspace_id;
end;
$$;

revoke all on function public.accept_account_invitation(uuid) from public, anon;
grant execute on function public.accept_account_invitation(uuid) to authenticated;

create or replace function public.update_account_project_metadata(
  p_workspace_id uuid,
  p_name text,
  p_description text
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  perform private.require_account_projects_enabled();
  if caller_id is null then raise exception 'Login required' using errcode = '42501'; end if;
  if not public.is_global_admin() and not exists (
    select 1 from public.members
    where workspace_id = p_workspace_id and user_id = caller_id and access_role = 'owner'
  ) then
    raise exception 'Only an owner or global admin may edit project information'
      using errcode = '42501';
  end if;
  if p_name is null or length(btrim(p_name)) not between 2 and 120
    or p_description is null or length(p_description) > 4000 then
    raise exception 'Invalid project information';
  end if;

  update public.workspaces
  set name = btrim(p_name), description = btrim(p_description), updated_at = now()
  where id = p_workspace_id;
  if not found then raise exception 'Project not found' using errcode = 'P0002'; end if;
end;
$$;

revoke all on function public.update_account_project_metadata(uuid, text, text)
  from public, anon;
grant execute on function public.update_account_project_metadata(uuid, text, text)
  to authenticated;
