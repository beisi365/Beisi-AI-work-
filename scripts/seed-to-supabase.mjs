// ============================================================
// 种子数据迁移：本地种子 → Supabase（一次性）
// 用法（需 service_role key，绕过 RLS 灌初始数据）：
//   SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx \
//     node scripts/seed-to-supabase.mjs
// 仅迁移「静态骨架 + 学员基础档案」：teachers / classes / courses /
// lessons / students / users / enrollments。动态数据（出勤/作业/作品等）
// 初始为空，符合全新生产环境。
// ⚠️ service_role key 拥有完全权限，切勿提交或暴露给前端；仅本地迁移使用。
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '../src/data');

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

const BASE = Date.parse('2026-01-05T00:00:00+08:00');
const now = () => BASE;

function load(name) {
  return JSON.parse(readFileSync(resolve(SRC, name), 'utf8'));
}

// —— 教师（与 seed.ts teacherDefs 对齐） ——
const teacherDefs = [
  { id: 't1', name: '王老师', title: 'AI 首席讲师', bio: '8 年 AI 应用培训经验，专注提示词工程与 AI 写作方法论', subjects: 'AI写作/提示词' },
  { id: 't2', name: '李老师', title: '视觉设计讲师', bio: '资深设计师，擅长 AI 图像生成与短视频创作工作流', subjects: 'AI图像/视频' },
  { id: 't3', name: '陈老师', title: '办公效率讲师', bio: '前互联网大厂产品经理，主讲 AI 在 PPT / Excel / 数据处理中的实战', subjects: 'AI办公/PPT' },
  { id: 't4', name: '赵老师', title: '智能体讲师', bio: '专注智能体编排与自动化工作流，让 AI 真正落地业务', subjects: 'AI智能体/工作流' },
  { id: 't5', name: '林老师', title: '教研主管', bio: '负责课程体系设计与学员成长路径规划', subjects: '课程统筹/学员成长' },
];

const classDefs = [
  { id: 'cl1', name: 'AI写作/提示词', teacher_id: 't1', schedule: '每周一晚', location: '线上会议室', mode: 'online' },
  { id: 'cl2', name: 'AI图像/视频', teacher_id: 't2', schedule: '每周六', location: '社区教室', mode: 'offline' },
  { id: 'cl3', name: 'AI办公/PPT', teacher_id: 't3', schedule: '每周三晚', location: '线上会议室', mode: 'online' },
  { id: 'cl4', name: 'AI智能体/工作流', teacher_id: 't4', schedule: '每周五晚', location: '线上会议室', mode: 'online' },
  { id: 'cl5', name: '课程统筹/学员成长', teacher_id: 't5', schedule: '每周日', location: '社区教室', mode: 'offline' },
];

const courses = [
  { id: 'co1', title: 'AI 应用实战训练营', description: '覆盖写作/图像/办公/智能体四大方向的全链路 AI 应用课程', total_lessons: 12, target_audience: '零基础到进阶的职场人与创作者', created_at: BASE, updated_at: BASE },
];

// 极简课次（每班共用 co1，给内容骨架；后续在后台补全）
const lessons = Array.from({ length: 8 }, (_, i) => ({
  id: `le${i + 1}`,
  course_id: 'co1',
  seq: i + 1,
  title: `第 ${i + 1} 讲 · AI 实战`,
  objectives: '掌握本讲核心技能并产出作品',
  est_time: '90 分钟',
  prereq: '',
  content: '',
  lecture_notes: '',
  steps: '',
  example_files: [],
  exercise: '',
  homework: '',
  tools: '',
  faq: '',
  completion_criteria: '',
  ability_dimension: ['basics', 'requirement', 'prompt', 'operation', 'judgement', 'application'][i % 6],
  created_at: BASE,
  updated_at: BASE,
}));

// —— 学员（来自资料库桥接的 override，含 cl1 真实 + cl2-cl5 示例） ——
const ov1 = load('studentOverrides.cl1.json').students;
const ov25 = load('studentOverrides.cl2-cl5.json').students;
const overrides = [...ov1, ...ov25];

const students = [];
const users = [];
const enrollments = [];
for (const o of overrides) {
  const id = o.student_id;
  students.push({
    id,
    // user_id 留空，便于真实用户登录后认领（claim_identity 仅认领 user_id 为空的记录）
    user_id: null,
    nickname: o.nickname,
    age_range: o.age_range || '',
    occupation: o.occupation || '',
    contact: '',
    enroll_date: '2026-01-05',
    goal: '',
    weekly_hours: 0,
    devices: '',
    os: '',
    office_software: '',
    ai_tools_used: '',
    can_self_service: false,
    uses_paid_ai: false,
    notes: '',
    self_intro: o.self_intro || '',
    ai_baseline: null,
    teacher_tags: [],
    teacher_observation: null,
    learning_suggestion: null,
    archived_at: null,
    created_at: BASE,
    updated_at: BASE,
    created_by: 'u_migrate',
  });
  users.push({
    id: `u_${id}`,
    role: 'student',
    name: o.nickname,
    account: `stu_${id}`,
    avatar: (o.nickname || 'S').slice(0, 1),
    created_at: BASE,
    updated_at: BASE,
  });
  enrollments.push({
    id: `en_${id}`,
    student_id: id,
    class_id: o.class_id,
    enroll_date: '2026-01-05',
    status: '在读',
    created_at: BASE,
    updated_at: BASE,
  });
}

// 教师用户 + 教师行
for (const t of teacherDefs) {
  users.push({
    id: `u_${t.id}`,
    role: 'teacher',
    name: t.name,
    account: `tea_${t.id}`,
    avatar: t.name.slice(0, 1),
    created_at: BASE,
    updated_at: BASE,
  });
}
const teachers = teacherDefs.map((t) => ({
  id: t.id,
  // user_id 留空，便于真实教师登录后认领（claim_identity 仅认领 user_id 为空的记录）
  user_id: null,
  name: t.name,
  title: t.title,
  bio: t.bio,
  subjects: t.subjects,
  created_at: BASE,
  updated_at: BASE,
}));
const classes = classDefs.map((c) => ({
  id: c.id,
  name: c.name,
  course_id: 'co1',
  teacher_id: c.teacher_id,
  start_date: '2026-01-05',
  end_date: '2026-04-05',
  schedule: c.schedule,
  capacity: 25,
  status: '进行中',
  created_at: BASE,
  updated_at: BASE,
  created_by: 'u_migrate',
}));

async function insert(table, rows, label) {
  if (!rows.length) return;
  // 分批 100 条，避免单次请求过大
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await sb.from(table).upsert(batch, { onConflict: 'id' });
    if (error) {
      console.error(`[${label}] 插入失败:`, error.message);
      process.exit(1);
    }
  }
  console.log(`✓ ${label}: ${rows.length} 条`);
}

await insert('users', users, 'users');
await insert('teachers', teachers, 'teachers');
await insert('classes', classes, 'classes');
await insert('courses', courses, 'courses');
await insert('lessons', lessons, 'lessons');
await insert('students', students, 'students');
await insert('enrollments', enrollments, 'enrollments');
console.log('种子迁移完成 ✅');
