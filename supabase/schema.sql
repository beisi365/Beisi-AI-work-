-- ============================================================
-- AI 培训学习工作台 · Supabase 多用户地基 Schema (v0.1)
-- 目标：把现有 21 张表映射为 Postgres，并用 RLS 实现
--       「教师仅见自己班 / 学员仅见自己」的行级隔离。
-- 时间戳沿用应用层的毫秒 epoch（bigint），不依赖 DB 默认值。
-- 所有「JSON」字段在 TS 里其实是字符串（已 JSON.stringify），故存 text；
-- 真正的字符串数组（teacher_tags / example_files）用 text[]。
-- ⚠️ 本文件为第一版，结构准确；RLS 需在拿到 Project 后实跑校验。
-- ============================================================

-- 1. users 用户表（应用层逻辑用户目录；鉴权身份由 auth.users + profiles 承载）
create table if not exists public.users (
  id text primary key,
  role text not null,
  name text not null default '',
  account text not null default '',
  avatar text not null default '',
  created_at bigint not null default 0,
  updated_at bigint not null default 0
);

-- 2. students 学员表（无 class_id，经 enrollments 关联）
create table if not exists public.students (
  id text primary key,
  user_id text,
  nickname text not null default '',
  age_range text not null default '',
  occupation text not null default '',
  contact text not null default '',
  enroll_date text not null default '',
  goal text not null default '',
  weekly_hours integer not null default 0,
  devices text not null default '',
  os text not null default '',
  office_software text not null default '',
  ai_tools_used text not null default '',
  can_self_service boolean not null default false,
  uses_paid_ai boolean not null default false,
  notes text not null default '',
  self_intro text not null default '',
  ai_baseline text,
  teacher_tags text[] not null default '{}',
  teacher_observation text,
  learning_suggestion text,
  archived_at text,
  created_at bigint not null default 0,
  updated_at bigint not null default 0,
  created_by text not null default ''
);

-- 3. teachers 教师表
create table if not exists public.teachers (
  id text primary key,
  user_id text,
  name text not null default '',
  title text,
  bio text not null default '',
  subjects text not null default '',
  created_at bigint not null default 0,
  updated_at bigint not null default 0
);

-- 4. classes 班级表
create table if not exists public.classes (
  id text primary key,
  name text not null default '',
  course_id text not null default '',
  teacher_id text not null default '',
  start_date text not null default '',
  end_date text not null default '',
  schedule text not null default '',
  capacity integer not null default 0,
  status text not null default '',
  created_at bigint not null default 0,
  updated_at bigint not null default 0,
  created_by text not null default ''
);

-- 5. enrollments 报名关系表
create table if not exists public.enrollments (
  id text primary key,
  student_id text not null,
  class_id text not null,
  enroll_date text not null default '',
  status text not null default '',
  created_at bigint not null default 0,
  updated_at bigint not null default 0
);

-- 6. courses 课程表
create table if not exists public.courses (
  id text primary key,
  title text not null default '',
  description text not null default '',
  total_lessons integer not null default 0,
  target_audience text not null default '',
  created_at bigint not null default 0,
  updated_at bigint not null default 0
);

-- 7. lessons 课次
create table if not exists public.lessons (
  id text primary key,
  course_id text not null,
  seq integer not null default 0,
  title text not null default '',
  objectives text not null default '',
  est_time text not null default '',
  prereq text not null default '',
  content text not null default '',
  lecture_notes text not null default '',
  steps text not null default '',
  example_files text[] not null default '{}',
  exercise text not null default '',
  homework text not null default '',
  tools text not null default '',
  faq text not null default '',
  completion_criteria text not null default '',
  ability_dimension text not null default '',
  created_at bigint not null default 0,
  updated_at bigint not null default 0
);

-- 8. class_sessions 实际授课场次
create table if not exists public.class_sessions (
  id text primary key,
  class_id text not null,
  lesson_id text not null,
  teacher_id text not null,
  scheduled_start bigint not null default 0,
  scheduled_end bigint not null default 0,
  actual_start bigint,
  actual_end bigint,
  location text not null default '',
  delivery_mode text not null default '',
  status text not null default '',
  created_at bigint not null default 0,
  updated_at bigint not null default 0
);

-- 9. attendance 出勤表
create table if not exists public.attendance (
  id text primary key,
  class_session_id text not null,
  student_id text not null,
  status text not null default '',
  time bigint not null default 0,
  note text not null default '',
  created_at bigint not null default 0,
  updated_at bigint not null default 0,
  created_by text not null default ''
);

-- 10. assignments 作业表
create table if not exists public.assignments (
  id text primary key,
  lesson_id text not null,
  class_id text not null,
  class_session_id text,
  title text not null default '',
  requirements text not null default '',
  due_date text not null default '',
  rubric text not null default '',
  created_at bigint not null default 0,
  updated_at bigint not null default 0,
  created_by text not null default ''
);

-- 11. submissions 作业提交表
create table if not exists public.submissions (
  id text primary key,
  assignment_id text not null,
  student_id text not null,
  status text not null default '',
  tools text not null default '',
  prompts text not null default '',
  public_allowed boolean not null default false,
  final_version_id text,
  ai_review_id text,
  teacher_review_id text,
  created_at bigint not null default 0,
  updated_at bigint not null default 0,
  created_by text not null default ''
);

-- 12. work_versions 作品版本表
create table if not exists public.work_versions (
  id text primary key,
  submission_id text not null,
  student_id text not null,
  version_no integer not null default 0,
  content text not null default '',
  snapshot_file_id text,
  is_final boolean not null default false,
  created_at bigint not null default 0,
  updated_at bigint not null default 0
);

-- 13. learning_records 学习记录表
create table if not exists public.learning_records (
  id text primary key,
  student_id text not null,
  class_session_id text not null,
  submission_id text,
  prep text not null default '',
  exercise_completion text not null default '',
  tools text not null default '',
  key_prompts text not null default '',
  problems text not null default '',
  need_help boolean not null default false,
  teacher_observation text not null default '',
  ai_analysis_ref text,
  next_suggestion text not null default '',
  created_at bigint not null default 0,
  updated_at bigint not null default 0,
  created_by text not null default ''
);

-- 14. ability_assessments 能力评估快照表
create table if not exists public.ability_assessments (
  id text primary key,
  student_id text not null,
  dimension text not null default '',
  level text not null default '',
  source text not null default '',
  evidence_id text,
  ai_suggested_level text,
  teacher_confirmed_level text,
  status text not null default '',
  evidence_text text,
  assessment_group_id text,
  assessed_at bigint not null default 0,
  created_at bigint not null default 0,
  updated_at bigint not null default 0,
  created_by text not null default ''
);

-- 15. teacher_reviews 教师评价表
create table if not exists public.teacher_reviews (
  id text primary key,
  student_id text not null,
  ref_lesson_id text,
  teacher_id text not null,
  tags text not null default '',
  ai_draft text not null default '',
  teacher_text text not null default '',
  status text not null default '',
  created_by text not null default '',
  confirmed_at bigint,
  created_at bigint not null default 0,
  updated_at bigint not null default 0
);

-- 16. ai_analysis AI 分析记录表
create table if not exists public.ai_analysis (
  id text primary key,
  ref_type text not null default '',
  ref_id text not null default '',
  content text not null default '',
  confidence float not null default 0,
  is_confirmed boolean not null default false,
  created_at bigint not null default 0,
  updated_at bigint not null default 0
);

-- 17. communications 沟通记录表
create table if not exists public.communications (
  id text primary key,
  type text not null default '',
  student_id text not null,
  teacher_id text not null,
  time bigint not null default 0,
  content text not null default '',
  follow_up text not null default '',
  owner text not null default '',
  attachment_id text,
  created_at bigint not null default 0,
  updated_at bigint not null default 0,
  created_by text not null default ''
);

-- 18. concerns 关注事项表
create table if not exists public.concerns (
  id text primary key,
  student_id text not null,
  type text not null default '',
  trigger_reason text not null default '',
  evidence text not null default '',
  suggested_action text not null default '',
  owner text not null default '',
  due text,
  status text not null default '',
  confirmed_by text,
  confirmed_at bigint,
  resolved_at bigint,
  result text not null default '',
  created_at bigint not null default 0,
  updated_at bigint not null default 0
);

-- 19. todos 待办事项表
create table if not exists public.todos (
  id text primary key,
  owner_type text not null default '',
  owner_id text not null default '',
  title text not null default '',
  related_student_id text,
  due text,
  status text not null default '',
  created_at bigint not null default 0,
  updated_at bigint not null default 0
);

-- 20. files 文件与附件表（仅元数据，不存 base64）
create table if not exists public.files (
  id text primary key,
  name text not null default '',
  owner_type text not null default '',
  owner_id text not null default '',
  mime text not null default '',
  size integer not null default 0,
  mock_url text not null default '',
  meta text not null default '',
  created_at bigint not null default 0,
  updated_at bigint not null default 0
);

-- 21. operation_logs 操作日志表
create table if not exists public.operation_logs (
  id text primary key,
  user_id text not null default '',
  action text not null default '',
  target text not null default '',
  changes text not null default '',
  created_at bigint not null default 0
);

-- ============================================================
-- profiles：Supabase Auth 身份 ↔ 应用角色/归属 映射（RLS 核心）
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('teacher','student','admin')),
  student_id text,
  teacher_id text,
  display_name text not null default '',
  created_at bigint not null default 0
);

-- ============================================================
-- 自动建 profile 触发器：新 auth 用户注册即建 profiles 行（默认 student）
-- 解决「注册后无 session（邮箱确认未过）导致客户端写 profiles 被 RLS 拒绝」的时序坑
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, display_name, created_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'student'),
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

-- ============================================================
-- claim_identity：登录后认领 / 创建自己的 student / teacher 记录
-- - 不传 p_bind_id：创建属于自己的新记录（id = stu_ / tch_ + auth uid）
-- - 传 p_bind_id：认领已存在且未认领的 seed 记录（user_id 为空方可认领）
-- SECURITY DEFINER 绕过 RLS，且仅允许认领 user_id 为空（防止抢占他人数据）
-- ============================================================
create or replace function public.claim_identity(p_role text, p_bind_id text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_student_id text;
  v_teacher_id text;
  v_now bigint := extract(epoch from now())::bigint * 1000;
begin
  if v_uid is null then raise exception '未登录'; end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not found then raise exception '用户档案不存在，请先注册'; end if;

  if p_role = 'teacher' then
    if v_profile.teacher_id is not null then return; end if;
    if p_bind_id is not null then
      update public.teachers set user_id = v_uid::text
        where id = p_bind_id and (user_id is null or user_id = '');
      if not found then raise exception '该教师账号不存在或已被认领'; end if;
      v_teacher_id := p_bind_id;
    else
      v_teacher_id := 'tch_' || v_uid::text;
      insert into public.teachers (id, user_id, name, subjects, bio, created_at, updated_at)
      values (v_teacher_id, v_uid::text, coalesce(v_profile.display_name, ''), '', '', v_now, v_now)
      on conflict (id) do nothing;
    end if;
    update public.profiles set teacher_id = v_teacher_id, role = 'teacher' where id = v_uid;
  elsif p_role = 'student' then
    if v_profile.student_id is not null then return; end if;
    if p_bind_id is not null then
      update public.students set user_id = v_uid::text
        where id = p_bind_id and (user_id is null or user_id = '');
      if not found then raise exception '该学员账号不存在或已被认领'; end if;
      v_student_id := p_bind_id;
    else
      v_student_id := 'stu_' || v_uid::text;
      insert into public.students (
        id, user_id, nickname, age_range, occupation, contact, enroll_date, goal,
        weekly_hours, devices, os, office_software, ai_tools_used, can_self_service,
        uses_paid_ai, notes, self_intro, created_at, updated_at, created_by
      ) values (
        v_student_id, v_uid::text, coalesce(v_profile.display_name, ''), '', '', '', '', '',
        0, '', '', '', '', false, false, '', '', v_now, v_now, v_uid::text
      )
      on conflict (id) do nothing;
    end if;
    update public.profiles set student_id = v_student_id, role = 'student' where id = v_uid;
  else
    raise exception '无效角色';
  end if;
end;
$$;

grant execute on function public.claim_identity(text, text) to authenticated;

-- ============================================================
-- RLS 辅助函数（stable，避免每行动态重算）
-- ============================================================
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

-- 教师是否教该学员（经 enrollments + classes.teacher_id）
-- 注意：SECURITY DEFINER 使内部查询绕过 RLS，避免「策略调用本函数 → 再触发策略」的递归爆栈
create or replace function public.teaches_student(sid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.enrollments e
    join public.classes c on c.id = e.class_id
    where e.student_id = sid and c.teacher_id = public.my_teacher_id()
  )
$$;

-- 教师是否负责该班级
create or replace function public.teaches_class(cid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.classes c where c.id = cid and c.teacher_id = public.my_teacher_id()
  )
$$;

-- 学员是否在该班级
create or replace function public.enrolled_in_class(cid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.enrollments e
    where e.class_id = cid and e.student_id = public.my_student_id()
  )
$$;

-- ============================================================
-- 开启 RLS（默认拒绝，必须显式授权）
-- ============================================================
alter table public.profiles enable row level security;
alter table public.users enable row level security;
alter table public.students enable row level security;
alter table public.teachers enable row level security;
alter table public.classes enable row level security;
alter table public.enrollments enable row level security;
alter table public.courses enable row level security;
alter table public.lessons enable row level security;
alter table public.class_sessions enable row level security;
alter table public.attendance enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.work_versions enable row level security;
alter table public.learning_records enable row level security;
alter table public.ability_assessments enable row level security;
alter table public.teacher_reviews enable row level security;
alter table public.ai_analysis enable row level security;
alter table public.communications enable row level security;
alter table public.concerns enable row level security;
alter table public.todos enable row level security;
alter table public.files enable row level security;
alter table public.operation_logs enable row level security;

-- ============================================================
-- 策略：profiles（仅本人可见/改）
-- ============================================================
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select using (id = auth.uid());
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ============================================================
-- 策略：参考/基础数据（courses, lessons）—— 所有登录用户可读；教师/管理员可写
-- ============================================================
drop policy if exists courses_read on public.courses;
create policy courses_read on public.courses for select using (auth.role() is not null);
drop policy if exists courses_write on public.courses;
create policy courses_write on public.courses for all
  using (public.my_role() in ('teacher','admin')) with check (public.my_role() in ('teacher','admin'));

drop policy if exists lessons_read on public.lessons;
create policy lessons_read on public.lessons for select using (auth.role() is not null);
drop policy if exists lessons_write on public.lessons;
create policy lessons_write on public.lessons for all
  using (public.my_role() in ('teacher','admin')) with check (public.my_role() in ('teacher','admin'));

-- ============================================================
-- 策略：classes —— 负责教师可读写；学员可读自己所在的班
-- ============================================================
drop policy if exists classes_read on public.classes;
create policy classes_read on public.classes for select
  using (public.teaches_class(id) or public.enrolled_in_class(id) or public.my_role() = 'admin');
drop policy if exists classes_write on public.classes;
create policy classes_write on public.classes for all
  using (public.teaches_class(id) or public.my_role() = 'admin')
  with check (public.teaches_class(id) or public.my_role() = 'admin');

-- ============================================================
-- 策略：students —— 负责教师可读写自己班的学员；学员仅读自己
-- ============================================================
drop policy if exists students_read on public.students;
create policy students_read on public.students for select
  using (public.teaches_student(id) or id = public.my_student_id() or public.my_role() = 'admin');
drop policy if exists students_write on public.students;
create policy students_write on public.students for all
  using (public.teaches_student(id) or public.my_role() = 'admin')
  with check (public.teaches_student(id) or public.my_role() = 'admin');

-- ============================================================
-- 策略：enrollments —— 教师读自己班的；学员读自己的
-- ============================================================
drop policy if exists enrollments_read on public.enrollments;
create policy enrollments_read on public.enrollments for select
  using (public.teaches_class(class_id) or student_id = public.my_student_id() or public.my_role() = 'admin');
drop policy if exists enrollments_write on public.enrollments;
create policy enrollments_write on public.enrollments for all
  using (public.teaches_class(class_id) or student_id = public.my_student_id() or public.my_role() = 'admin')
  with check (public.teaches_class(class_id) or student_id = public.my_student_id() or public.my_role() = 'admin');

-- ============================================================
-- 策略：class_sessions —— 教师读自己班的；学员读自己所在班的
-- ============================================================
drop policy if exists class_sessions_read on public.class_sessions;
create policy class_sessions_read on public.class_sessions for select
  using (public.teaches_class(class_id) or public.enrolled_in_class(class_id) or public.my_role() = 'admin');
drop policy if exists class_sessions_write on public.class_sessions;
create policy class_sessions_write on public.class_sessions for all
  using (public.teaches_class(class_id) or public.my_role() = 'admin')
  with check (public.teaches_class(class_id) or public.my_role() = 'admin');

-- ============================================================
-- 策略：assignments —— 随班级权限
-- ============================================================
drop policy if exists assignments_read on public.assignments;
create policy assignments_read on public.assignments for select
  using (public.teaches_class(class_id) or public.enrolled_in_class(class_id) or public.my_role() = 'admin');
drop policy if exists assignments_write on public.assignments;
create policy assignments_write on public.assignments for all
  using (public.teaches_class(class_id) or public.my_role() = 'admin')
  with check (public.teaches_class(class_id) or public.my_role() = 'admin');

-- ============================================================
-- 策略：submissions —— 学员读/写自己的；教师读自己班学员的
-- ============================================================
drop policy if exists submissions_read on public.submissions;
create policy submissions_read on public.submissions for select
  using (student_id = public.my_student_id() or public.teaches_student(student_id) or public.my_role() = 'admin');
drop policy if exists submissions_write on public.submissions;
create policy submissions_write on public.submissions for all
  using (student_id = public.my_student_id() or public.teaches_student(student_id) or public.my_role() = 'admin')
  with check (student_id = public.my_student_id() or public.teaches_student(student_id) or public.my_role() = 'admin');

-- ============================================================
-- 策略：work_versions —— 经 submission 归属判断
-- ============================================================
drop policy if exists work_versions_read on public.work_versions;
create policy work_versions_read on public.work_versions for select
  using (
    student_id = public.my_student_id()
    or public.teaches_student(student_id)
    or public.my_role() = 'admin'
  );
drop policy if exists work_versions_write on public.work_versions;
create policy work_versions_write on public.work_versions for all
  using (student_id = public.my_student_id() or public.teaches_student(student_id) or public.my_role() = 'admin')
  with check (student_id = public.my_student_id() or public.teaches_student(student_id) or public.my_role() = 'admin');

-- ============================================================
-- 策略：learning_records —— 随学员归属
-- ============================================================
drop policy if exists learning_records_read on public.learning_records;
create policy learning_records_read on public.learning_records for select
  using (student_id = public.my_student_id() or public.teaches_student(student_id) or public.my_role() = 'admin');
drop policy if exists learning_records_write on public.learning_records;
create policy learning_records_write on public.learning_records for all
  using (student_id = public.my_student_id() or public.teaches_student(student_id) or public.my_role() = 'admin')
  with check (student_id = public.my_student_id() or public.teaches_student(student_id) or public.my_role() = 'admin');

-- ============================================================
-- 策略：ability_assessments —— 随学员归属
-- ============================================================
drop policy if exists ability_assessments_read on public.ability_assessments;
create policy ability_assessments_read on public.ability_assessments for select
  using (student_id = public.my_student_id() or public.teaches_student(student_id) or public.my_role() = 'admin');
drop policy if exists ability_assessments_write on public.ability_assessments;
create policy ability_assessments_write on public.ability_assessments for all
  using (student_id = public.my_student_id() or public.teaches_student(student_id) or public.my_role() = 'admin')
  with check (student_id = public.my_student_id() or public.teaches_student(student_id) or public.my_role() = 'admin');

-- ============================================================
-- 策略：teacher_reviews —— 教师读自己写的/教的学生；学员读自己的
-- ============================================================
drop policy if exists teacher_reviews_read on public.teacher_reviews;
create policy teacher_reviews_read on public.teacher_reviews for select
  using (
    student_id = public.my_student_id()
    or teacher_id = public.my_teacher_id()
    or public.teaches_student(student_id)
    or public.my_role() = 'admin'
  );
drop policy if exists teacher_reviews_write on public.teacher_reviews;
create policy teacher_reviews_write on public.teacher_reviews for all
  using (teacher_id = public.my_teacher_id() or public.my_role() = 'admin')
  with check (teacher_id = public.my_teacher_id() or public.my_role() = 'admin');

-- ============================================================
-- 策略：communications —— 参与者可读；教师/管理员可写
-- ============================================================
drop policy if exists communications_read on public.communications;
create policy communications_read on public.communications for select
  using (
    student_id = public.my_student_id()
    or teacher_id = public.my_teacher_id()
    or public.my_role() = 'admin'
  );
drop policy if exists communications_write on public.communications;
create policy communications_write on public.communications for all
  using (teacher_id = public.my_teacher_id() or public.my_role() = 'admin')
  with check (teacher_id = public.my_teacher_id() or public.my_role() = 'admin');

-- ============================================================
-- 策略：concerns —— 随学员归属；owner=自己或负责教师可读写
-- ============================================================
drop policy if exists concerns_read on public.concerns;
create policy concerns_read on public.concerns for select
  using (
    student_id = public.my_student_id()
    or owner = public.my_student_id()
    or public.teaches_student(student_id)
    or public.my_role() = 'admin'
  );
drop policy if exists concerns_write on public.concerns;
create policy concerns_write on public.concerns for all
  using (public.teaches_student(student_id) or public.my_role() = 'admin')
  with check (public.teaches_student(student_id) or public.my_role() = 'admin');

-- ============================================================
-- 策略：todos —— owner 是自己可读写；关联学员时按归属
-- ============================================================
drop policy if exists todos_read on public.todos;
create policy todos_read on public.todos for select
  using (
    owner_id = public.my_student_id()
    or owner_id = public.my_teacher_id()
    or (related_student_id is not null and public.teaches_student(related_student_id))
    or public.my_role() = 'admin'
  );
drop policy if exists todos_write on public.todos;
create policy todos_write on public.todos for all
  using (
    owner_id = public.my_teacher_id()
    or (related_student_id is not null and public.teaches_student(related_student_id))
    or public.my_role() = 'admin'
  )
  with check (
    owner_id = public.my_teacher_id()
    or (related_student_id is not null and public.teaches_student(related_student_id))
    or public.my_role() = 'admin'
  );

-- ============================================================
-- 策略：ai_analysis —— 仅教师/管理员可读写（分析内容为内部判断）
-- ============================================================
drop policy if exists ai_analysis_read on public.ai_analysis;
create policy ai_analysis_read on public.ai_analysis for select
  using (public.my_role() in ('teacher','admin'));
drop policy if exists ai_analysis_write on public.ai_analysis;
create policy ai_analysis_write on public.ai_analysis for all
  using (public.my_role() in ('teacher','admin')) with check (public.my_role() in ('teacher','admin'));

-- ============================================================
-- 策略：files —— 仅元数据（无 base64）。owner 可读；教师可读自己班的
-- ============================================================
drop policy if exists files_read on public.files;
create policy files_read on public.files for select
  using (owner_id = public.my_student_id() or owner_id = public.my_teacher_id() or public.my_role() = 'admin');
drop policy if exists files_write on public.files;
create policy files_write on public.files for all
  using (owner_id = public.my_student_id() or owner_id = public.my_teacher_id() or public.my_role() = 'admin')
  with check (owner_id = public.my_student_id() or owner_id = public.my_teacher_id() or public.my_role() = 'admin');

-- ============================================================
-- 策略：operation_logs —— 本人或教师/管理员可读
-- ============================================================
drop policy if exists operation_logs_read on public.operation_logs;
create policy operation_logs_read on public.operation_logs for select
  using (user_id = public.auth_user_id() or public.my_role() in ('teacher','admin'));
drop policy if exists operation_logs_write on public.operation_logs;
create policy operation_logs_write on public.operation_logs for insert
  with check (user_id = public.auth_user_id() or public.my_role() in ('teacher','admin'));

-- ============================================================
-- 索引（高频查询列）
-- ============================================================
create index if not exists idx_students_user_id on public.students(user_id);
create index if not exists idx_classes_teacher_id on public.classes(teacher_id);
create index if not exists idx_enrollments_student_id on public.enrollments(student_id);
create index if not exists idx_enrollments_class_id on public.enrollments(class_id);
create index if not exists idx_lessons_course_id on public.lessons(course_id);
create index if not exists idx_class_sessions_class_id on public.class_sessions(class_id);
create index if not exists idx_class_sessions_lesson_id on public.class_sessions(lesson_id);
create index if not exists idx_class_sessions_teacher_id on public.class_sessions(teacher_id);
create index if not exists idx_attendance_session_id on public.attendance(class_session_id);
create index if not exists idx_attendance_student_id on public.attendance(student_id);
create index if not exists idx_assignments_class_id on public.assignments(class_id);
create index if not exists idx_assignments_session_id on public.assignments(class_session_id);
create index if not exists idx_submissions_assignment_id on public.submissions(assignment_id);
create index if not exists idx_submissions_student_id on public.submissions(student_id);
create index if not exists idx_work_versions_submission_id on public.work_versions(submission_id);
create index if not exists idx_learning_records_student_id on public.learning_records(student_id);
create index if not exists idx_learning_records_session_id on public.learning_records(class_session_id);
create index if not exists idx_ability_student_dim on public.ability_assessments(student_id, dimension);
create index if not exists idx_teacher_reviews_student_id on public.teacher_reviews(student_id);
create index if not exists idx_communications_student_id on public.communications(student_id);
create index if not exists idx_concerns_student_id on public.concerns(student_id);
create index if not exists idx_todos_owner on public.todos(owner_type, owner_id);
