-- Run after push.sql. Store these Vault secrets first:
--   stackflow_project_url: https://<project-ref>.supabase.co
--   stackflow_push_webhook_secret: same value as Edge Function PUSH_WEBHOOK_SECRET
create schema if not exists extensions;
create extension if not exists pg_net with schema extensions;

create or replace function public.dispatch_assignment_push_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  project_url text;
  webhook_secret text;
begin
  select decrypted_secret into project_url
  from vault.decrypted_secrets
  where name = 'stackflow_project_url';

  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets
  where name = 'stackflow_push_webhook_secret';

  if project_url is null or webhook_secret is null then
    raise exception 'StackFlow push webhook secrets are not configured';
  end if;

  perform net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/push-send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-stackflow-webhook-secret', webhook_secret
    ),
    body := jsonb_build_object(
      'type', tg_op,
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', to_jsonb(new),
      'old_record', null
    ),
    timeout_milliseconds := 10000
  );

  return new;
end;
$$;

revoke all on function public.dispatch_assignment_push_event() from public, anon, authenticated;

drop trigger if exists trg_dispatch_assignment_push_event on public.assignment_push_events;
create trigger trg_dispatch_assignment_push_event
after insert on public.assignment_push_events
for each row execute function public.dispatch_assignment_push_event();
