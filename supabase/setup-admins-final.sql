-- ============================================================
-- 一次性执行：① 加固触发器拒绝自助 admin 注册  ② 把两个邮箱提为管理员
-- 执行位置：Supabase 控制台 → SQL Editor → 整段粘贴执行（幂等）
-- 前置：两个邮箱需先在 /login 各注册一个普通账号（教师或学员均可），否则会提示「未找到」跳过
-- ============================================================

-- ① 触发器加固：任何 role=admin 的自助注册一律降级为 student，关闭自助提权后门
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text := coalesce(new.raw_user_meta_data->>'role', 'student');
begin
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

-- ② 把两个运营邮箱提为管理员（已注册的提权，未注册的提示后跳过）
do $$
declare
  ADMIN_EMAILS text[] := array[
    '101808290@qq.com',
    '971535227@qq.com'
  ];
  em    text;
  v_uid uuid;
  done  int := 0;
begin
  foreach em in array ADMIN_EMAILS loop
    select id into v_uid from auth.users where lower(email) = lower(em);
    if v_uid is null then
      raise notice '⚠ 未找到邮箱 % 的账号，请先用该邮箱在 /login 注册后再执行', em;
      continue;
    end if;
    insert into public.profiles (id, role, display_name, created_at)
    values (v_uid, 'admin', split_part(em, '@', 1), extract(epoch from now())::bigint * 1000)
    on conflict (id) do update set role = 'admin';
    update public.profiles set role = 'admin', teacher_id = null, student_id = null where id = v_uid;
    done := done + 1;
    raise notice '已将 % 设为运营/管理员', em;
  end loop;
  raise notice '完成：共 % 个邮箱已提权', done;
end $$;

-- 校验：应能看到这两个邮箱 role=admin
select u.email, p.role, p.teacher_id, p.student_id
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'admin';
