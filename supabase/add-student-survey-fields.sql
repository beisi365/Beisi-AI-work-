-- ============================================================
-- 增量迁移：students 表新增「报名问卷」结构化字段
-- ------------------------------------------------------------
-- 背景：之前 Excel 的 9 列问卷被拼接塞进 4 个字段（self_intro / goal /
--       ai_baseline / notes），个人档案里看不到逐项，也无法外部编辑回写。
-- 本迁移把问卷拆成独立字段，使其可被：平台编辑 + Excel 导入/导出 双向同步。
--
-- 幂等：可重复执行，效果一致。
-- 执行位置：Supabase 控制台 → SQL Editor → 整段粘贴执行
-- ============================================================

-- 1) 加列（已存在则跳过；全部给默认值，不影响既有数据）
alter table public.students add column if not exists student_no         text not null default '';  -- 学号（Excel 学号列原文）
alter table public.students add column if not exists ai_experience     text not null default '';  -- AI 使用经验
alter table public.students add column if not exists priority_direction text not null default '';  -- 优先学习方向
alter table public.students add column if not exists open_answer       text not null default '';  -- 补充开放题
alter table public.students add column if not exists remark            text not null default '';  -- 备注

-- 2) 注释（便于后台表结构可读性）
comment on column public.students.student_no          is '学号：外部 Excel 主键，用于导入/导出对齐';
comment on column public.students.ai_experience       is '问卷：AI 使用经验';
comment on column public.students.priority_direction  is '问卷：优先学习方向';
comment on column public.students.open_answer         is '问卷：补充开放题';
comment on column public.students.remark              is '问卷：备注';

-- 3) 学号索引（导入时按学号定位，避免全表扫）
create index if not exists idx_students_student_no on public.students(student_no);

-- 4) 自校验：执行后应看到 5 行，且均为 text/'' 默认值
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'students'
  and column_name in ('student_no','ai_experience','priority_direction','open_answer','remark')
order by column_name;
