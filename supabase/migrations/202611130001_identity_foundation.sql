-- Additive identity schema. This migration does not change legacy access policies.
-- Apply only after a verified database backup. Never use this file as a cutover.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon;
grant select, insert, update on public.profiles to authenticated;

create policy "Users read own profile" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users create own profile" on public.profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Users update own profile" on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter table public.workspaces
  add column if not exists creator_user_id uuid references auth.users(id) on delete set null;

alter table public.members
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists access_role text not null default 'member';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'members_access_role_check'
      and conrelid = 'public.members'::regclass
  ) then
    alter table public.members
      add constraint members_access_role_check
      check (access_role in ('owner', 'member'));
  end if;
end $$;

create unique index if not exists members_one_account_per_project
  on public.members (workspace_id, user_id) where user_id is not null;
create index if not exists members_by_user on public.members (user_id, workspace_id)
  where user_id is not null;

create table if not exists private.global_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);

revoke all on private.global_admins from public, anon, authenticated;

create or replace function private.reject_admin_as_member()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.user_id is not null and exists (
    select 1 from private.global_admins where user_id = new.user_id
  ) then
    raise exception 'Global admin cannot be a project member';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reject_admin_as_member on public.members;
create trigger trg_reject_admin_as_member
  before insert or update of user_id on public.members
  for each row execute function private.reject_admin_as_member();

create or replace function private.reject_member_as_admin()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.members where user_id = new.user_id
  ) then
    raise exception 'Project member cannot become global admin';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reject_member_as_admin on private.global_admins;
create trigger trg_reject_member_as_admin
  before insert on private.global_admins
  for each row execute function private.reject_member_as_admin();

create or replace function public.is_global_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.global_admins
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_global_admin() from public, anon;
grant execute on function public.is_global_admin() to authenticated;

create table if not exists public.project_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invited_email text not null,
  invited_by_user_id uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invited_email_normalized check (
    invited_email = lower(btrim(invited_email)) and length(invited_email) between 3 and 320
  )
);

create unique index if not exists one_pending_invite_per_email_project
  on public.project_invitations (workspace_id, invited_email)
  where status = 'pending';
create index if not exists invitations_by_email
  on public.project_invitations (invited_email, status, expires_at);

alter table public.project_invitations enable row level security;
revoke all on public.project_invitations from anon, authenticated;

create table if not exists private.member_claim_audit (
  id bigint generated always as identity primary key,
  member_id uuid not null,
  workspace_id uuid not null,
  claimed_user_id uuid not null,
  claimed_by_user_id uuid not null,
  access_role text not null,
  claimed_at timestamptz not null default now()
);

revoke all on private.member_claim_audit from public, anon, authenticated;

create or replace function public.claim_legacy_member(
  p_member_id uuid,
  p_user_id uuid,
  p_access_role text default 'member'
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  claimed_member public.members%rowtype;
begin
  if (select auth.uid()) is null or not public.is_global_admin() then
    raise exception 'Only a global admin may claim legacy members';
  end if;
  if p_access_role not in ('owner', 'member') then
    raise exception 'Invalid project access role';
  end if;
  if not exists (
    select 1 from auth.users
    where id = p_user_id and email_confirmed_at is not null
  ) then
    raise exception 'Target account must have a verified email';
  end if;
  if exists (select 1 from private.global_admins where user_id = p_user_id) then
    raise exception 'Global admin cannot be a project member';
  end if;

  update public.members
  set user_id = p_user_id, access_role = p_access_role
  where id = p_member_id and user_id is null
  returning * into claimed_member;

  if not found then
    raise exception 'Legacy member is missing or already claimed';
  end if;

  insert into private.member_claim_audit (
    member_id, workspace_id, claimed_user_id, claimed_by_user_id, access_role
  ) values (
    claimed_member.id, claimed_member.workspace_id, p_user_id, auth.uid(), p_access_role
  );
end;
$$;

revoke all on function public.claim_legacy_member(uuid, uuid, text) from public, anon;
grant execute on function public.claim_legacy_member(uuid, uuid, text) to authenticated;

comment on table private.global_admins is
  'Server-managed global administrators. Never expose this table or insert them into members.';
comment on column public.members.user_id is
  'Verified Supabase Auth identity; null until a legacy member is claimed.';
comment on column public.members.access_role is
  'Project authorization role, distinct from the free-text job title in members.role.';
