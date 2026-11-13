-- Read-only production audit. Returns counts and policy definitions, not project data.
-- Run in Supabase SQL Editor before planning the account cutover.

select 'workspaces' as entity, count(*) as row_count from public.workspaces
union all select 'members', count(*) from public.members
union all select 'stacks', count(*) from public.stacks
union all select 'checklist_items', count(*) from public.checklist_items
union all select 'activity_logs', count(*) from public.activity_logs;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('workspaces', 'members', 'stacks', 'checklist_items', 'activity_logs')
order by tablename, policyname;

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('workspaces', 'members', 'stacks', 'checklist_items', 'activity_logs')
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

-- Run only after the additive identity migration exists.
-- select workspace_id, count(*) filter (where user_id is null) as unclaimed,
--        count(*) filter (where access_role = 'owner' and user_id is not null) as owners
-- from public.members group by workspace_id;
