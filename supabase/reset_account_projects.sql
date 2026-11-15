-- Reset toàn bộ dữ liệu dự án mẫu/cũ trên Supabase tài khoản (xwzwsysekkizxmmjjjvn)
-- Bảo toàn 100% tài khoản Google đã xác thực (auth.users), hồ sơ (public.profiles)
-- và quyền quản trị toàn cục (private.global_admins).
begin;
  truncate table public.projects restart identity cascade;
commit;
