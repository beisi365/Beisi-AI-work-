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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import http from 'node:http';
import https from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '../src/data');

const BASE_URL = process.env.SUPABASE_URL?.replace(/[\s\r\n]+/g, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/[\s\r\n]+/g, '');
if (!BASE_URL || !KEY) {
  console.error('缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
// 调试：打印 key 头尾片段+长度，便于排查「非法字符」类 header 报错
console.log(`[debug] BASE_URL=${BASE_URL} KEY.length=${KEY.length} head=${KEY.slice(0, 6)} tail=${KEY.slice(-4)}`);

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
// P2 业务数据容器（脚本内收集，末尾统一 upsert）
const submissions = [];
const workVersions = [];
const attendance = [];
const abilityAssessments = [];
const teacherReviews = [];
const learningRecords = [];
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

// ============================================================
// P2 业务动态数据（演示填充）
// 说明：真实生产环境动态数据初始为空。此处仅为「多用户地基已激活」后
//       让四模块（课时/考勤/考核/作品）有可演示的真实数据。
// 保留 user_id 留空 → 真实用户登录后仍可 claim_identity 认领，不影响隔离。
// 用 service_role 绕过 RLS 灌入；所有外键以 id 关联（schema 未建物理 FK）。
// 可通过 `SEED_BUSINESS=0` 跳过本段，只灌静态骨架。
// ============================================================
const SEED_BUSINESS = process.env.SEED_BUSINESS !== '0';

// 班级 → 学员列表
const studentsByClass = {};
for (const e of enrollments) {
  (studentsByClass[e.class_id] ||= []).push(e.student_id);
}
const teacherByClass = {};
for (const c of classDefs) teacherByClass[c.id] = c.teacher_id;

const DAY = 86400000;
// 日期字符串按 +08 解释（BASE 为 +08 零点），避免 UTC 漂移
const dateStr = (n) => new Date(BASE + n * DAY + 8 * 3600000).toISOString().slice(0, 10);
// 各班级首课相对 BASE 的天偏移（匹配 schedule 周几；BASE=2026-01-05 为周一）
const classStartOffset = { cl1: 0, cl2: 5, cl3: 2, cl4: 4, cl5: 6 };
// 取学员所属班级
const classOf = (sid) => enrollments.find((e) => e.student_id === sid)?.class_id || 'cl1';

const classSessions = [];
const assignments = [];
if (SEED_BUSINESS) {
  // —— 授课场次：每班 8 次，对应 le1~le8，全部已结束 ——
  for (const c of classDefs) {
    for (let i = 0; i < 8; i++) {
      const sid = `se_${c.id}_${i + 1}`;
      const start = BASE + (classStartOffset[c.id] + i * 7) * DAY + 19 * 3600000 + 30 * 60000; // 19:30
      classSessions.push({
        id: sid,
        class_id: c.id,
        lesson_id: `le${i + 1}`,
        teacher_id: c.teacher_id,
        scheduled_start: start,
        scheduled_end: start + 90 * 60000,
        actual_start: start,
        actual_end: start + 90 * 60000,
        location: c.location,
        delivery_mode: c.mode,
        status: '已结束',
        created_at: BASE,
        updated_at: BASE,
      });
      assignments.push({
        id: `as_${c.id}_${i + 1}`,
        lesson_id: `le${i + 1}`,
        class_id: c.id,
        class_session_id: sid,
        title: `第 ${i + 1} 讲 · 实战作业`,
        requirements: '根据本课主题完成一份可展示的实战作品，并简述所用工具与提示词思路。',
        due_date: dateStr(classStartOffset[c.id] + i * 7 + 7),
        rubric: '1) 完成度 2) 工具运用 3) 提示词质量 4) 表达清晰度',
        created_at: BASE,
        updated_at: BASE,
        created_by: c.teacher_id,
      });
    }
  }

  // —— 作业提交 + 作品版本：每学员前 6 讲各 1 份（状态分布） ——
  const SUB_STATUSES = ['completed', 'excellent', 'to_review', 'need_revise', 'pending'];
  for (const s of students) {
    const cls = classOf(s.id);
    for (let i = 0; i < 6; i++) {
      const status = SUB_STATUSES[(i + Number(s.id.replace(/\D/g, '')) % 5 + 5) % 5];
      const subId = `su_${s.id}_${i + 1}`;
      const asId = `as_${cls}_${i + 1}`;
      const ts = BASE + (classStartOffset[cls] + i * 7 + 2) * DAY;
      const vcount = status === 'need_revise' ? 2 : 1;
      let finalVid = null;
      for (let v = 1; v <= vcount; v++) {
        const vid = `${subId}_v${v}`;
        const isFinal = v === vcount;
        workVersions.push({
          id: vid,
          submission_id: subId,
          student_id: s.id,
          version_no: v,
          content: isFinal
            ? `第 ${i + 1} 讲定稿作品（v${v}）：${status === 'excellent' ? '高质量完成，结构清晰' : '已完成基础要求'}。`
            : `第 ${i + 1} 讲初稿（v${v}），待优化。`,
          snapshot_file_id: null,
          is_final: isFinal,
          created_at: ts + v * 3600000,
          updated_at: ts + v * 3600000,
        });
        if (isFinal) finalVid = vid;
      }
      submissions.push({
        id: subId,
        assignment_id: asId,
        student_id: s.id,
        status,
        tools: 'ChatGPT / Midjourney / 即梦',
        prompts: '围绕本课主题设计提示词，迭代 2 次后定稿。',
        public_allowed: status === 'excellent',
        final_version_id: finalVid,
        ai_review_id: null,
        teacher_review_id: null,
        created_at: ts,
        updated_at: ts,
        created_by: 'u_migrate',
      });
    }
  }

  // —— 出勤：每场次为在读学员登记（大部分出勤，少量迟到/缺勤） ——
  let attIdx = 0;
  const attStatus = (k) => {
    const r = (k * 7 + 3) % 20;
    if (r < 1) return 'absent';
    if (r < 3) return 'late';
    return 'present';
  };
  for (const c of classDefs) {
    const sess = classSessions.filter((s) => s.class_id === c.id);
    const clsStudents = studentsByClass[c.id] || [];
    for (const se of sess) {
      for (const stuId of clsStudents) {
        const status = attStatus(attIdx++);
        attendance.push({
          id: `at_${se.id}_${stuId}`,
          class_session_id: se.id,
          student_id: stuId,
          status,
          time: status === 'absent' ? 0 : se.scheduled_start,
          note: status === 'late' ? '迟到约 10 分钟' : '',
          created_at: se.scheduled_start,
          updated_at: se.scheduled_start,
          created_by: c.teacher_id,
        });
      }
    }
  }

  // —— 能力评估：每学员 1 条（六维轮转，教师已确认） ——
  const DIMS = ['basics', 'requirement', 'prompt', 'operation', 'judgement', 'application'];
  const LEVELS = ['L1', 'L2', 'L3', 'L4'];
  students.forEach((s, idx) => {
    const cls = classOf(s.id);
    const dim = DIMS[idx % 6];
    const level = LEVELS[(idx * 3) % 4];
    abilityAssessments.push({
      id: `aa_${s.id}`,
      student_id: s.id,
      dimension: dim,
      level,
      source: 'teacher',
      evidence_id: null,
      ai_suggested_level: level,
      teacher_confirmed_level: level,
      status: 'confirmed',
      evidence_text: '期初测评 + 前 6 次课表现综合判断。',
      assessment_group_id: null,
      assessed_at: BASE + (classStartOffset[cls] + 3 * 7) * DAY,
      created_at: BASE,
      updated_at: BASE,
      created_by: teacherByClass[cls],
    });
  });

  // —— 教师评语：completed/excellent/need_revise 的提交配评语，并回写 submission ——
  const reviewMap = {};
  submissions.forEach((sub) => {
    if (!['completed', 'excellent', 'need_revise'].includes(sub.status)) return;
    const cls = classOf(sub.student_id);
    const li = Number(sub.id.split('_').pop());
    const rid = `tr_${sub.id}`;
    const tags =
      sub.status === 'excellent'
        ? '作品完整,表达清晰,主动性强'
        : sub.status === 'completed'
          ? '完成度好,工具运用熟练'
          : '需优化提示词,细节待打磨';
    const text =
      sub.status === 'excellent'
        ? '作品质量很高，提示词设计有章法，继续保持。'
        : sub.status === 'completed'
          ? '整体完成良好，可在细节上再打磨。'
          : '方向正确，但提示词与细节还需优化，建议重做一版。';
    teacherReviews.push({
      id: rid,
      student_id: sub.student_id,
      ref_lesson_id: `le${li}`,
      teacher_id: teacherByClass[cls],
      tags,
      ai_draft: '',
      teacher_text: text,
      status: 'confirmed',
      created_by: teacherByClass[cls],
      confirmed_at: sub.updated_at,
      created_at: sub.updated_at,
      updated_at: sub.updated_at,
    });
    reviewMap[sub.id] = rid;
  });
  submissions.forEach((sub) => {
    if (reviewMap[sub.id]) sub.teacher_review_id = reviewMap[sub.id];
  });

  // —— 学习记录：出勤（非缺勤）且前 6 讲配套 1 条 ——
  for (const a of attendance) {
    if (a.status === 'absent') continue;
    const se = classSessions.find((s) => s.id === a.class_session_id);
    if (!se) continue;
    const li = Number(se.lesson_id.replace('le', ''));
    if (li > 6) continue;
    const cls = se.class_id;
    const sub = submissions.find(
      (su) => su.student_id === a.student_id && su.assignment_id === `as_${cls}_${li}`,
    );
    learningRecords.push({
      id: `lr_${a.id}`,
      student_id: a.student_id,
      class_session_id: a.class_session_id,
      submission_id: sub ? sub.id : null,
      prep: '课前预习了本课提纲与示例。',
      exercise_completion: a.status === 'late' ? '基本完成' : '全部完成',
      tools: 'ChatGPT / Midjourney',
      key_prompts: '围绕主题迭代提示词，重点在结构清晰。',
      problems: a.status === 'late' ? '时间紧张，部分步骤略快。' : '无明显问题。',
      need_help: false,
      teacher_observation: '课堂参与积极。',
      ai_analysis_ref: null,
      next_suggestion: '下一讲可尝试更复杂的组合任务。',
      created_at: a.time || a.created_at,
      updated_at: a.time || a.created_at,
      created_by: teacherByClass[cls],
    });
  }
}

async function insert(table, rows, label) {
  if (!rows.length) return;
  // 分批 100 条，避免单次请求过大
  // 注：直接用 node:http/https 调 PostgREST，绕开 Node 22 fetch(undici) 对含
  //     中文字符串的 btoa 校验 bug（'Cannot convert argument to a ByteString'）。
  //     行为等价：仍 upsert onConflict=id，分批 100。body 用 Buffer.from 显式 UTF-8。
  const lib = BASE_URL.startsWith('https:') ? https : http;
  const u = new URL(`${BASE_URL}/rest/v1/${table}`);
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const body = Buffer.from(JSON.stringify(batch), 'utf-8');
    const result = await new Promise((resolve, reject) => {
      const req = lib.request(
        {
          method: 'POST',
          hostname: u.hostname,
          port: u.port || undefined,
          path: u.pathname,
          headers: {
            apikey: KEY,
            Authorization: `Bearer ${KEY}`,
            'Content-Type': 'application/json',
            'Content-Length': body.length,
            Prefer: 'resolution=merge-duplicates',
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () =>
            resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: data }),
          );
        },
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
    if (!result.ok) {
      console.error(`[${label}] 插入失败 [HTTP ${result.status}]:`, result.text);
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

// —— P2 业务动态数据（SEED_BUSINESS !== '0' 时） ——
if (SEED_BUSINESS) {
  await insert('class_sessions', classSessions, 'class_sessions');
  await insert('assignments', assignments, 'assignments');
  await insert('submissions', submissions, 'submissions');
  await insert('work_versions', workVersions, 'work_versions');
  await insert('attendance', attendance, 'attendance');
  await insert('ability_assessments', abilityAssessments, 'ability_assessments');
  await insert('teacher_reviews', teacherReviews, 'teacher_reviews');
  await insert('learning_records', learningRecords, 'learning_records');
  console.log(
    `业务数据概览 → 场次:${classSessions.length} 作业:${assignments.length} ` +
      `提交:${submissions.length} 版本:${workVersions.length} 出勤:${attendance.length} ` +
      `评估:${abilityAssessments.length} 评语:${teacherReviews.length} 学习记录:${learningRecords.length}`,
  );
}
console.log('种子迁移完成 ✅');
