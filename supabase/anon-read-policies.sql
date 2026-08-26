-- ============================================================
-- 匿名只读策略（A 演示身份入口）
-- 用途：?demo=1 / ?demo=student 演示模式可读云端真实数据（免登录浏览）
-- 设计关键：using (auth.uid() IS NULL) —— 仅「未登录的匿名访问」可读；
--          登录后的真实用户（学员/教师）仍走各自原有 RLS 隔离策略，
--          多用户数据隔离不受影响。
-- 幂等：drop policy if exists + create，可重复运行。
-- 执行：Supabase → SQL Editor → 全选粘贴 → Run
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array[
    'users','teachers','classes','courses','lessons','students',
    'enrollments','class_sessions','attendance','assignments',
    'submissions','work_versions','learning_records',
    'ability_assessments','teacher_reviews','files','ai_analysis','concerns'
  ]
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      'anon_select_' || t, t
    );
    execute format(
      'create policy %I on public.%I for select using (auth.uid() IS NULL)',
      'anon_select_' || t, t
    );
  end loop;
end $$;

-- 验证：应返回 18 行
select count(*) as anon_select_policies
from pg_policies
where policyname like 'anon_select_%';
