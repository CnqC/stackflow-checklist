-- =============================================================================
-- StackFlow Checklist — Supabase PostgreSQL + Realtime Schema (Schema v2)
-- Tối ưu cho nhóm dự án < 10 thành viên (Mã PIN dự án + Chọn tên thành viên)
-- Cách dùng: Mở Supabase Dashboard -> SQL Editor -> Dán toàn bộ file này -> Run
-- =============================================================================

create extension if not exists "pgcrypto";

-- 1. Bảng Workspaces (Phòng dự án bảo vệ bằng mã PIN)
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                 -- Mã phòng ngắn gọn, VD: "GAME-2026"
  name text not null,                        -- Tên dự án
  description text not null default '',
  pin_code text not null,                    -- Mã PIN 4-8 ký tự cho nhóm nội bộ <10 người
  max_members int not null default 10 check (max_members between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Bảng Members (Danh sách thành viên trong dự án — tối đa 10 người)
create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  role text not null default 'Member',       -- VD: Lead, Dev, Art, QA, PM
  color text not null default '#6366f1',
  avatar text not null default '',
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);

-- Trigger giới hạn cứng tối đa 10 thành viên mỗi dự án ngay ở tầng Database
create or replace function public.enforce_max_ten_members()
returns trigger
language plpgsql
as $$
declare
  current_count int;
  allowed_max int;
begin
  select count(*) into current_count
  from public.members
  where workspace_id = new.workspace_id;

  select coalesce(max_members, 10) into allowed_max
  from public.workspaces
  where id = new.workspace_id;

  if current_count >= allowed_max then
    raise exception 'Dự án chỉ cho phép tối đa % thành viên.', allowed_max;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_max_ten_members on public.members;
create trigger trg_enforce_max_ten_members
before insert on public.members
for each row execute function public.enforce_max_ten_members();

-- 3. Bảng Stacks (Các giai đoạn / tầng công việc để nhóm follow theo thứ tự)
create table if not exists public.stacks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  description text not null default '',
  color text not null default '#6366f1',
  position int not null default 0,
  sequential_lock boolean not null default false, -- Nếu bật: cần xong mục trên mới mở mục dưới
  collapsed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. Bảng Checklist Items (Các đầu việc trong từng Stack, hỗ trợ Multi-Assignee & Subtasks JSONB)
create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  stack_id uuid not null references public.stacks(id) on delete cascade,
  title text not null,
  notes text not null default '',
  status text not null default 'todo' check (status in ('todo', 'doing', 'blocked', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  completed boolean not null default false,
  assignee_id uuid references public.members(id) on delete set null,
  assignee_ids uuid[] not null default '{}',
  due_date text,
  position int not null default 0,
  subtasks jsonb not null default '[]'::jsonb,
  links jsonb not null default '[]'::jsonb,
  completed_by_id uuid references public.members(id) on delete set null,
  completed_by_name text,
  completed_at timestamptz,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Nâng cấp an toàn Schema v1 -> v2 cho bảng checklist_items hiện hữu
alter table public.checklist_items
  add column if not exists assignee_ids uuid[] not null default '{}';

update public.checklist_items
set assignee_ids = array[assignee_id]
where assignee_id is not null
  and coalesce(array_length(assignee_ids, 1), 0) = 0;

-- 5. Bảng Activity Logs (Nhật ký hoạt động trực tiếp của cả nhóm)
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid references public.members(id) on delete set null,
  actor_name text not null,
  actor_color text not null default '#6366f1',
  action_type text not null,
  target_title text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);

-- Indexes tối ưu tốc độ truy vấn
create index if not exists idx_workspaces_code on public.workspaces(code);
create index if not exists idx_members_workspace on public.members(workspace_id);
create index if not exists idx_stacks_workspace_pos on public.stacks(workspace_id, position);
create index if not exists idx_items_workspace_stack_pos on public.checklist_items(workspace_id, stack_id, position);
create index if not exists idx_items_assignee_ids on public.checklist_items using gin (assignee_ids);
create index if not exists idx_activity_workspace_created on public.activity_logs(workspace_id, created_at desc);

-- Bật Row Level Security (cho phép truy cập qua anon key với kiểm tra mã PIN ở ứng dụng)
alter table public.workspaces enable row level security;
alter table public.members enable row level security;
alter table public.stacks enable row level security;
alter table public.checklist_items enable row level security;
alter table public.activity_logs enable row level security;

drop policy if exists "Allow workspace access" on public.workspaces;
create policy "Allow workspace access" on public.workspaces for all using (true) with check (true);

drop policy if exists "Allow members access" on public.members;
create policy "Allow members access" on public.members for all using (true) with check (true);

drop policy if exists "Allow stacks access" on public.stacks;
create policy "Allow stacks access" on public.stacks for all using (true) with check (true);

drop policy if exists "Allow checklist_items access" on public.checklist_items;
create policy "Allow checklist_items access" on public.checklist_items for all using (true) with check (true);

drop policy if exists "Allow activity_logs access" on public.activity_logs;
create policy "Allow activity_logs access" on public.activity_logs for all using (true) with check (true);

-- Bật Realtime cho toàn bộ bảng để App & Web tự động đồng bộ tức thì (<100ms)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workspaces'
  ) then
    alter publication supabase_realtime add table public.workspaces;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'members'
  ) then
    alter publication supabase_realtime add table public.members;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stacks'
  ) then
    alter publication supabase_realtime add table public.stacks;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'checklist_items'
  ) then
    alter publication supabase_realtime add table public.checklist_items;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity_logs'
  ) then
    alter publication supabase_realtime add table public.activity_logs;
  end if;
end $$;
