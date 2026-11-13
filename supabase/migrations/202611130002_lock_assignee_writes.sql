-- Keep assignment changes atomic through set_task_assignees(), which also bumps
-- the task version. Direct table writes would bypass that version check.
revoke insert, delete on public.task_assignees from authenticated;
