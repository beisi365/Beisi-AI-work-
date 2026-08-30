-- ============================================================
-- 增量迁移：为已运行云端项目补建「教师排班」表 teacher_schedules
-- 适用：schema.sql 早期版本（2026-08-26 跑过）未含此表的项目
-- 幂等：可重复执行，效果一致。
-- 执行位置：Supabase 控制台 → SQL Editor → 整段粘贴执行
-- ============================================================

-- 1) 建表（已存在则跳过）
create table if not exists public.teacher_schedules (
  id text primary key,
  teacher_id text not null,
  schedule_date date not null,
  start_time text not null,   -- 'HH:MM'
  end_time text not null,     -- 'HH:MM'
  title text not null default '',
  location text not null default '',
  note text not null default '',
  created_at bigint not null default 0,
  updated_at bigint not null default 0,
  created_by text not null default ''
);

-- 2) 高频索引
create index if not exists idx_teacher_schedules_teacher_id on public.teacher_schedules(teacher_id);
create index if not exists idx_teacher_schedules_date on public.teacher_schedules(schedule_date);

-- 3) RLS 策略
alter table public.teacher_schedules enable row level security;

drop policy if exists teacher_schedules_read on public.teacher_schedules;
create policy teacher_schedules_read on public.teacher_schedules for select
  using (public.my_role() in ('teacher','admin'));

drop policy if exists teacher_schedules_write on public.teacher_schedules;
create policy teacher_schedules_write on public.teacher_schedules for all
  using (teacher_id = public.my_teacher_id() or public.my_role() = 'admin')
  with check (teacher_id = public.my_teacher_id() or public.my_role() = 'admin');

-- 4) 匿名只读策略（演示入口 ?demo=1 用：未登录用户可读）
drop policy if exists anon_select_teacher_schedules on public.teacher_schedules;
create policy anon_select_teacher_schedules on public.teacher_schedules for select
  to anon using (auth.uid() is null);

-- 5) 校验：表应可见、4 条策略应齐全
select tablename from pg_tables where schemaname = 'public' and tablename = 'teacher_schedules';
select policyname from pg_policies where schemaname = 'public' and tablename = 'teacher_schedules';
