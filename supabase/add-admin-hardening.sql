-- ============================================================
-- 增量迁移：把 handle_new_user 触发器升级为「拒绝 admin 自助注册」
-- 适用：schema.sql 已跑过、云端正在运行的项目，直接在此 SQL Editor 执行即可。
-- 幂等：可重复执行，效果一致。
-- ============================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text := coalesce(new.raw_user_meta_data->>'role', 'student');
begin
  -- 安全管理员仅允许由运营通过 promote-to-admin.sql 显式授予，禁止自助提权
  if v_role = 'admin' then
    v_role := 'student';
  end if;
  insert into public.profiles (id, role, display_name, created_at)
  values (
    new.id,
    v_role,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    extract(epoch from now())::bigint * 1000
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 校验：列出当前所有 admin（应仅为你通过 promote-to-admin.sql 授予的账号）
select u.email, p.role
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'admin';
