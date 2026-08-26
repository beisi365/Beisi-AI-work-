-- 修复 RLS 递归爆栈：将 7 个辅助函数改为 SECURITY DEFINER，
-- 使其内部查询绕过 RLS，打断「策略调用本函数 → 再触发策略」的无限递归。
-- 用法：在 Supabase SQL Editor 内 全选粘贴 → Run。可重复执行（create or replace 幂等）。

create or replace function public.auth_user_id() returns text
language sql stable security definer set search_path = public as $$
  select nullif(auth.uid()::text, '')::text
$$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select p.role from public.profiles p where p.id = auth.uid()
$$;

create or replace function public.my_student_id() returns text
language sql stable security definer set search_path = public as $$
  select p.student_id from public.profiles p where p.id = auth.uid()
$$;

create or replace function public.my_teacher_id() returns text
language sql stable security definer set search_path = public as $$
  select p.teacher_id from public.profiles p where p.id = auth.uid()
$$;

create or replace function public.teaches_student(sid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.enrollments e
    join public.classes c on c.id = e.class_id
    where e.student_id = sid and c.teacher_id = public.my_teacher_id()
  )
$$;

create or replace function public.teaches_class(cid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.classes c where c.id = cid and c.teacher_id = public.my_teacher_id()
  )
$$;

create or replace function public.enrolled_in_class(cid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.enrollments e
    where e.class_id = cid and e.student_id = public.my_student_id()
  )
$$;
