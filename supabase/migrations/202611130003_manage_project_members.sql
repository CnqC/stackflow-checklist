-- Project owners and the global admin can maintain membership without granting
-- direct table writes to clients.
create unique index project_one_active_owner on public.project_members(project_id)
  where access_role = 'owner' and active;

create or replace function public.set_project_member_active(
  p_project_id uuid, p_member_id uuid, p_active boolean
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target public.project_members%rowtype;
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'Only owner or admin may manage members' using errcode = '42501';
  end if;
  select * into target from public.project_members
  where project_id = p_project_id and id = p_member_id for update;
  if not found then raise exception 'Member not found' using errcode = 'P0002'; end if;
  if p_active is null then raise exception 'Active state required'; end if;
  if target.access_role = 'owner' and not p_active then
    raise exception 'Transfer ownership before deactivating the owner';
  end if;
  if target.active is distinct from p_active then
    update public.project_members set active = p_active where id = p_member_id;
  end if;
end;
$$;

create or replace function public.transfer_project_owner(
  p_project_id uuid, p_new_owner_member_id uuid
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target public.project_members%rowtype;
begin
  if not public.can_manage_project(p_project_id) then
    raise exception 'Only owner or admin may transfer ownership' using errcode = '42501';
  end if;
  perform 1 from public.projects where id = p_project_id for update;
  select * into target from public.project_members
  where project_id = p_project_id and id = p_new_owner_member_id and active for update;
  if not found then raise exception 'New owner must be an active member'; end if;
  if target.access_role = 'owner' then return; end if;
  update public.project_members set access_role = 'member'
  where project_id = p_project_id and access_role = 'owner' and active;
  update public.project_members set access_role = 'owner'
  where id = p_new_owner_member_id;
  update public.project_invitations set status = 'revoked'
  where project_id = p_project_id and access_role = 'owner' and status = 'pending';
end;
$$;

revoke all on function public.set_project_member_active(uuid, uuid, boolean) from public, anon;
revoke all on function public.transfer_project_owner(uuid, uuid) from public, anon;
grant execute on function public.set_project_member_active(uuid, uuid, boolean) to authenticated;
grant execute on function public.transfer_project_owner(uuid, uuid) to authenticated;
