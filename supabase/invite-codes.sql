-- 邀请码注册（站点发布公网后的注册门槛）
--
-- 背景：站点要发布到公网，注册不能完全敞开（任何人拿到链接都能自建账号），
-- 也不能完全关死 —— 花名册里没有学员邮箱，运营无法批量建号，
-- 编造邮箱学员也记不住。折中方案：邀请码。
--
-- 安全设计（三条，缺一不可）：
--  1. anon / authenticated 对 invite_codes 表没有任何 select 权限，
--     前端拿不到码表内容，只能调 redeem_invite() 逐个"试"——
--     这是邀请码绝不写死在前端代码里的原因（dist 公开，devtools 一眼看穿）。
--  2. redeem_invite 是 SECURITY DEFINER，以属主身份绕过 RLS 读写码表。
--  3. 校验失败一律返回 false，不区分"码不存在 / 已用完 / 角色不符"，
--     避免被拿来枚举有效邀请码。
--  4. 校验与消耗在同一事务内用行锁（for update）完成，防止并发注册超发同一个码。

create table if not exists public.invite_codes (
  code        text primary key,
  role        text not null check (role in ('teacher', 'student')),
  max_uses    int not null default 1,
  used_count  int not null default 0,
  expires_at  timestamptz,
  note        text,
  created_at  timestamptz not null default now()
);

alter table public.invite_codes enable row level security;

-- 关键一步：收回所有表权限，让码表不可被枚举
revoke all on public.invite_codes from anon, authenticated;

create or replace function public.redeem_invite(p_code text, p_role text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.invite_codes;
begin
  if p_code is null or btrim(p_code) = '' then
    return false;
  end if;

  -- 行锁：并发注册时不会把同一个码发出去两次
  select * into v_row
  from public.invite_codes
  where code = btrim(p_code)
  for update;

  if not found then
    return false;
  end if;

  if v_row.role <> p_role then
    return false;
  end if;

  if v_row.used_count >= v_row.max_uses then
    return false;
  end if;

  if v_row.expires_at is not null and v_row.expires_at < now() then
    return false;
  end if;

  update public.invite_codes
  set used_count = used_count + 1
  where code = btrim(p_code);

  return true;
end;
$$;

-- 注册发生在登录之前（此时 auth.uid() 为 null），所以必须授权给 anon
grant execute on function public.redeem_invite(text, text) to anon, authenticated;


-- ============================================================
-- 运营操作：生成邀请码
-- 在 Supabase 后台 SQL Editor 单独执行下面这段，把结果复制出来分发
-- ============================================================

-- 生成 30 个学员邀请码（一次性使用，90 天内有效）
-- insert into public.invite_codes (code, role, max_uses, expires_at, note)
-- select
--   'NS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
--   'student',
--   1,
--   now() + interval '90 days',
--   '2026 秋季 AI 赋能课'
-- from generate_series(1, 30)
-- returning code, role, expires_at;

-- 生成 8 个教师邀请码
-- insert into public.invite_codes (code, role, max_uses, expires_at, note)
-- select
--   'NT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
--   'teacher',
--   1,
--   now() + interval '90 days',
--   '2026 秋季 AI 赋能课 · 教师'
-- from generate_series(1, 8)
-- returning code, role, expires_at;

-- 查看发放情况（谁领了、还剩多少）
-- select code, role, used_count, max_uses, expires_at, note
-- from public.invite_codes order by created_at desc;

-- 作废某个码（例如发错人）
-- delete from public.invite_codes where code = 'NS-XXXXXXXXXX';
