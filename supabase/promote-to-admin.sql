-- ============================================================
-- 运营 / 管理员（admin）账号：按「指定邮箱」显式授权
-- 执行位置：Supabase 控制台 → SQL Editor → 粘贴执行（幂等，可重复跑）
--
-- 安全模型（与前端 + 触发器三层一致）：
--   1. 前端注册页已移除「运营/管理员」选项，普通用户无法自助选 admin；
--   2. 云端 handle_new_user 触发器拒绝任何 role=admin 的自助注册（强制降级 student）；
--   3. 本脚本是 admin 的唯一合法来源：仅把「指定邮箱」的账号提为 admin。
--   → 别人无论怎么注册都进不了管理员，只有你掌握的那一个邮箱可以。
--
-- 步骤：
--   a. 先用任意身份（教师/学员）在 /login 分别用这两个邮箱各注册一个账号；
--   b. 在 SQL Editor 执行本文件 → 两个邮箱均成为运营管理员；
--   c. 之后在 /login 用任一邮箱登录，即为管理员视角（可统管全部 5 位老师）。
-- ============================================================

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

    -- 确保 profile 存在（极端情况下触发器未建时兜底）
    insert into public.profiles (id, role, display_name, created_at)
    values (v_uid, 'admin', split_part(em, '@', 1), extract(epoch from now())::bigint * 1000)
    on conflict (id) do update set role = 'admin';

    -- 管理员不绑定具体教师/学员记录
    update public.profiles set role = 'admin', teacher_id = null, student_id = null where id = v_uid;

    done := done + 1;
    raise notice '已将 % 设为运营/管理员', em;
  end loop;
  raise notice '完成：共 % 个邮箱已提权', done;
end $$;

-- 校验：确认结果（应能看到这两个邮箱 role=admin）
select u.email, p.role, p.teacher_id, p.student_id, p.display_name
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'admin';

-- ============================================================
-- 撤销 / 降级（可选，运营执行）：把指定邮箱改回普通教师
-- ============================================================
-- do $$
-- declare
--   ADMIN_EMAIL text := '101808290@qq.com';
--   v_uid uuid;
-- begin
--   select id into v_uid from auth.users where lower(email) = lower(ADMIN_EMAIL);
--   if v_uid is not null then
--     update public.profiles set role = 'teacher' where id = v_uid;
--     raise notice '已将 % 降级为教师', ADMIN_EMAIL;
--   end if;
-- end $$;
