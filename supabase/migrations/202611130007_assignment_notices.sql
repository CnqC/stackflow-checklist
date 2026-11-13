-- Assignment inbox belongs to the recipient account and is shared across devices.
create table public.assignment_notices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  recipient_member_id uuid not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name text not null,
  kind text not null check (kind in ('task_assigned', 'subtask_assigned')),
  task_id uuid not null,
  task_title text not null,
  subtask_title text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  foreign key (recipient_member_id, project_id)
    references public.project_members(id, project_id),
  foreign key (task_id, project_id)
    references public.tasks(id, project_id) on delete cascade
);
create index assignment_notices_inbox on public.assignment_notices(recipient_member_id, created_at desc);
revoke all on public.assignment_notices from public, anon, authenticated;
alter table public.assignment_notices enable row level security;
create policy assignment_notices_read on public.assignment_notices for select to authenticated
  using (exists (
    select 1 from public.project_members as member
    where member.id = recipient_member_id and member.project_id = assignment_notices.project_id
      and member.user_id = (select auth.uid()) and member.active
  ));
grant select on public.assignment_notices to authenticated;

create function private.enqueue_assignment_notice()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  recipient uuid;
  target_project uuid;
  target_task uuid;
  target_title text;
  part_title text;
  notice_kind text;
  actor_name text;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'authenticated'
    or (select auth.uid()) is null then return new; end if;
  if tg_table_name = 'task_assignees' then
    recipient := new.member_id;
    target_project := new.project_id;
    target_task := new.task_id;
    notice_kind := 'task_assigned';
  else
    if tg_op = 'UPDATE' then
      if new.assignee_member_id is not distinct from old.assignee_member_id then
        return new;
      end if;
    end if;
    recipient := new.assignee_member_id;
    target_project := new.project_id;
    target_task := new.task_id;
    part_title := new.title;
    notice_kind := 'subtask_assigned';
  end if;
  if recipient is null then return new; end if;
  if exists (select 1 from public.project_members
    where id = recipient and user_id = (select auth.uid())) then return new; end if;
  select title into target_title from public.tasks where id = target_task;
  select display_name into actor_name from public.project_members
    where project_id = target_project and user_id = (select auth.uid()) limit 1;
  insert into public.assignment_notices(project_id, recipient_member_id,
    actor_user_id, actor_name, kind, task_id, task_title, subtask_title)
  values (target_project, recipient, (select auth.uid()), coalesce(actor_name, 'Thành viên'),
    notice_kind, target_task, target_title, part_title);
  return new;
end;
$$;
create trigger task_assignee_notice after insert on public.task_assignees
  for each row execute function private.enqueue_assignment_notice();
create trigger subtask_assignee_notice after insert or update of assignee_member_id on public.subtasks
  for each row execute function private.enqueue_assignment_notice();

create function public.mark_assignment_notice_read(p_notice_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  update public.assignment_notices as notice set read_at = coalesce(read_at, now())
  where notice.id = p_notice_id and exists (
    select 1 from public.project_members as member
    where member.id = notice.recipient_member_id
      and member.project_id = notice.project_id
      and member.user_id = (select auth.uid()) and member.active
  );
  if not found then raise exception 'Notice not found' using errcode = '42501'; end if;
end;
$$;
revoke all on function public.mark_assignment_notice_read(uuid) from public, anon;
grant execute on function public.mark_assignment_notice_read(uuid) to authenticated;

alter publication supabase_realtime add table public.assignment_notices;
