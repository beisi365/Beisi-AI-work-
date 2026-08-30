import type {
  DBShape,
  TableName,
  Student,
  User,
  Teacher,
  TeacherSchedule,
  ClassRow,
  Course,
  Lesson,
  ClassSession,
  Enrollment,
  Attendance,
  Assignment,
  Submission,
  WorkVersion,
  LearningRecord,
  AbilityAssessment,
  TeacherReview,
  AiAnalysis,
  Communication,
  Concern,
  Todo,
  FileMeta,
  OperationLog,
  AbilityDimension,
  AbilityLevel,
  AttendanceStatus,
  SubmissionStatus,
} from './types';
import { ENROLLMENT_STATUS } from '../lib/enrollment';

// 确定性基准时间，保证演示数据可追溯、可重复
const BASE = Date.UTC(2026, 0, 5, 9, 0, 0);
const DAY = 24 * 60 * 60 * 1000;
const now = BASE + 90 * DAY;
// 演示“现在”：种子数据时间线的锚点，供总览中与日期相关的模块（今日课程/即将结业等）计算
export const SEED_NOW = now;

const DIMENSIONS: AbilityDimension[] = [
  'basics',
  'requirement',
  'prompt',
  'operation',
  'judgement',
  'application',
];

// 学员类别配比：正常 8 / 落后 5 / 进步明显 4 / 基础较强 3 = 20
// 学员类别推断（与 src/lib/queries.ts 的 inferCategory 保持逐字同步：前 17 位分段不变以兼容既有
// 表现与测试；n>=18 按固定周期分布，保证新增学员类别多样，且页面与种子数据完全一致）
type StudentCategory = 'normal' | 'behind' | 'progress' | 'strong';
function inferCat(id: string): StudentCategory {
  const n = Number(id.replace(/\D/g, ''));
  if (n <= 8) return 'normal';
  if (n <= 13) return 'behind';
  if (n <= 17) return 'progress';
  const cycle: StudentCategory[] = ['strong', 'strong', 'strong', 'normal', 'normal', 'normal', 'behind', 'progress'];
  return cycle[(n - 18) % cycle.length];
}

// 演示用：按学员类别 + 计数产生多样化的提交状态。submitted 与 to_review 语义重叠
//（无独立入队环节），已合并为 to_review；故此处仅返回 to_review/need_revise/completed/excellent。
function decideSubmissionStatus(
  cat: 'normal' | 'behind' | 'progress' | 'strong',
  idx: number,
): SubmissionStatus {
  switch (cat) {
    case 'strong':
      return idx % 3 === 0 ? 'completed' : 'excellent';
    case 'progress':
      return idx % 4 === 0 ? 'excellent' : 'completed';
    case 'normal':
      return idx % 5 === 1 ? 'need_revise' : 'to_review';
    case 'behind':
      return idx % 3 === 0 ? 'need_revise' : 'to_review';
  }
}

let counter = 0;
const nid = (p: string) => `${p}${(++counter).toString().padStart(3, '0')}`;

function levelToNum(l: AbilityLevel): number {
  return { L1: 1, L2: 2, L3: 3, L4: 4 }[l];
}

export function buildSeed(): DBShape {
  counter = 0;
  const users: User[] = [];
  const teachers: Teacher[] = [];
  const teacherSchedules: TeacherSchedule[] = [];
  const students: Student[] = [];
  const classes: ClassRow[] = [];
  const courses: Course[] = [];
  const lessons: Lesson[] = [];
  const classSessions: ClassSession[] = [];
  const enrollments: Enrollment[] = [];
  const attendance: Attendance[] = [];
  const assignments: Assignment[] = [];
  const submissions: Submission[] = [];
  const workVersions: WorkVersion[] = [];
  const learningRecords: LearningRecord[] = [];
  const abilityAssessments: AbilityAssessment[] = [];
  const teacherReviews: TeacherReview[] = [];
  const aiAnalysis: AiAnalysis[] = [];
  const communications: Communication[] = [];
  const concerns: Concern[] = [];
  const todos: Todo[] = [];
  const files: FileMeta[] = [];
  const operationLogs: OperationLog[] = [];

  // —— 教师 + 用户 ——
  const teacherDefs = [
    { id: 't1', name: '王老师', title: 'AI 首席讲师', bio: '8 年 AI 应用培训经验，专注提示词工程与 AI 写作方法论', subjects: 'AI写作/提示词' },
    { id: 't2', name: '李老师', title: '视觉设计讲师', bio: '资深设计师，擅长 AI 图像生成与短视频创作工作流', subjects: 'AI图像/视频' },
    { id: 't3', name: '陈老师', title: '办公效率讲师', bio: '前互联网大厂产品经理，主讲 AI 在 PPT / Excel / 数据处理中的实战', subjects: 'AI办公/PPT' },
    { id: 't4', name: '赵老师', title: '智能体讲师', bio: '专注智能体编排与自动化工作流，让 AI 真正落地业务', subjects: 'AI智能体/工作流' },
    { id: 't5', name: '林老师', title: '教研主管', bio: '负责课程体系设计与学员成长路径规划', subjects: '课程统筹/学员成长' },
  ];
  teacherDefs.forEach((t) => {
    const uid = `u_${t.id}`;
    users.push({
      id: uid,
      role: 'teacher',
      name: t.name,
      account: `teacher_${t.id}`,
      avatar: t.name.slice(0, 1),
      created_at: BASE,
      updated_at: BASE,
    });
    teachers.push({
      id: t.id,
      user_id: uid,
      name: t.name,
      title: t.title,
      bio: t.bio,
      subjects: t.subjects,
      created_at: BASE,
      updated_at: BASE,
    });
  });

  // —— 课程 + 12 课次 ——
  const course: Course = {
    id: 'co1',
    title: 'AI 应用实战训练营',
    description: '面向初学者的 12 节 AI 应用课程',
    total_lessons: 12,
    target_audience: '18-60 岁社会学员',
    created_at: BASE,
    updated_at: BASE,
  };
  courses.push(course);

  const lessonTitles = [
    'AI 是什么与能做什么',
    '注册与基础操作',
    '提示词基础',
    'AI 写作入门',
    'AI 生成图片',
    'AI 制作 PPT',
    'AI 数据处理',
    'AI 智能体初探',
    'AI 视频生成',
    '综合项目一',
    '效率工作流',
    '结课与作品打磨',
  ];
  const dims: AbilityDimension[] = DIMENSIONS;
  lessonTitles.forEach((title, i) => {
    const lid = `ls${(i + 1).toString().padStart(2, '0')}`;
    lessons.push({
      id: lid,
      course_id: 'co1',
      seq: i + 1,
      title,
      objectives: `掌握第 ${i + 1} 节核心目标`,
      est_time: '90 分钟',
      prereq: i === 0 ? '无' : `完成第 ${i} 节`,
      content: `${title} 的讲解内容…`,
      lecture_notes: `${title} 讲义要点…`,
      steps: '1. 演示 2. 练习 3. 点评',
      example_files: [],
      exercise: '课堂练习任务',
      homework: '课后作业',
      tools: '通用 AI 工具',
      faq: '常见问题',
      completion_criteria: '完成练习并提交作品',
      ability_dimension: dims[i % dims.length],
      created_at: BASE,
      updated_at: BASE,
    });
  });

  // —— 班级（5 个，分别对应 t1–t5 五位教师） ——
  const classDefs: { id: string; name: string; teacher_id: string; schedule: string; location: string; mode: 'online' | 'offline' }[] = [
    { id: 'cl1', name: 'AI写作/提示词', teacher_id: 't1', schedule: '每周一晚', location: '线上会议室', mode: 'online' },
    { id: 'cl2', name: 'AI图像/视频', teacher_id: 't2', schedule: '每周六', location: '社区教室', mode: 'offline' },
    { id: 'cl3', name: 'AI办公/PPT', teacher_id: 't3', schedule: '每周三晚', location: '线上会议室', mode: 'online' },
    { id: 'cl4', name: 'AI智能体/工作流', teacher_id: 't4', schedule: '每周五晚', location: '线上会议室', mode: 'online' },
    { id: 'cl5', name: '课程统筹/学员成长', teacher_id: 't5', schedule: '每周日', location: '社区教室', mode: 'offline' },
  ];
  classDefs.forEach((c) => {
    classes.push({
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
      created_by: 'u_t1',
    });
  });

  // —— 学员（125 = 5 班 × 25 人） + 用户 + 报名 ——
  // 顺序填充：每 5 人一轮，分别落入 cl1–cl5（对应 t1–t5），每班恰好 25 人，互不重叠
  const studentTeacher: Record<string, string> = {};
  const TOTAL_STUDENTS = 125;
  for (let i = 0; i < TOTAL_STUDENTS; i++) {
    const clsDef = classDefs[Math.min(Math.floor(i / 25), classDefs.length - 1)];
    const cls = clsDef.id;
    const tid = clsDef.teacher_id;
    const sid = `s${(i + 1).toString().padStart(2, '0')}`;
    const uid = `u_${sid}`;
    const cat = inferCat(sid);
    studentTeacher[sid] = tid;
    users.push({
      id: uid,
      role: 'student',
      name: `学员${i + 1}`,
      account: `stu_${sid}`,
      avatar: `学${i + 1}`,
      created_at: BASE,
      updated_at: BASE,
    });
    students.push({
      id: sid,
      user_id: uid,
      nickname: `学员${i + 1}`,
      age_range: cat === 'strong' ? '25-34' : cat === 'behind' ? '45-54' : '35-44',
      occupation: cat === 'behind' ? '退休/自由职业' : '在职',
      contact: '138****0000',
      enroll_date: '2026-01-03',
      goal: cat === 'strong' ? '用 AI 提效并带团队' : cat === 'behind' ? '学会基础操作' : '掌握 AI 办公',
      weekly_hours: cat === 'behind' ? 2 : 5,
      devices: '笔记本',
      os: 'macOS',
      office_software: 'WPS',
      ai_tools_used: cat === 'strong' ? 'ChatGPT, Midjourney' : '文心一言',
      can_self_service: cat !== 'behind',
      uses_paid_ai: cat === 'strong',
      notes: '',
      // P1 新增字段默认值（向后兼容）
      self_intro: '',
      ai_baseline: null,
      teacher_tags: [],
      teacher_observation: null,
      learning_suggestion: null,
      archived_at: null,
      created_at: BASE,
      updated_at: BASE,
      created_by: 'u_t1',
    });
    enrollments.push({
      id: nid('en'),
      student_id: sid,
      class_id: cls,
      enroll_date: '2026-01-03',
      status: ENROLLMENT_STATUS.ACTIVE,
      created_at: BASE,
      updated_at: BASE,
    });
  }

  // —— 班级实际授课场次（每班 12 节，前 8 节已上，后 4 节待上） ——
  const sessionByClassLesson: Record<string, string> = {};
  const classOffset: Record<string, number> = { cl1: 0, cl2: 3, cl3: 1, cl4: 4, cl5: 2 };
  classDefs.forEach((c) => {
    lessons.forEach((ls, i) => {
      const sid = nid('cs');
      const start = BASE + i * 7 * DAY + (classOffset[c.id] ?? 0) * DAY;
      const done = i < 8;
      classSessions.push({
        id: sid,
        class_id: c.id,
        lesson_id: ls.id,
        teacher_id: c.teacher_id,
        scheduled_start: start,
        scheduled_end: start + 2 * 60 * 60 * 1000,
        actual_start: done ? start : null,
        actual_end: done ? start + 90 * 60 * 1000 : null,
        location: c.location,
        delivery_mode: c.mode,
        status: done ? 'done' : 'scheduled',
        created_at: BASE,
        updated_at: BASE,
      });
      sessionByClassLesson[`${c.id}:${ls.id}`] = sid;
    });
  });

  // —— 作业（每班每课 1 个，绑定对应场次） ——
  classDefs.forEach((c) => {
    lessons.forEach((ls) => {
      assignments.push({
        id: nid('as'),
        lesson_id: ls.id,
        class_id: c.id,
        class_session_id: sessionByClassLesson[`${c.id}:${ls.id}`],
        title: `${ls.title} 作业`,
        requirements: '按课堂练习完成并提交',
        due_date: '2026-01-20',
        rubric: '完成度 / 提示词质量',
        created_at: BASE,
        updated_at: BASE,
        created_by: 'u_t1',
      });
    });
  });

  // —— 出勤 / 作业提交 / 作品版本 / 学习记录 / 能力 ——
  const enrolledByClass: Record<string, string[]> = Object.fromEntries(classDefs.map((c) => [c.id, []]));
  enrollments.forEach((e) => enrolledByClass[e.class_id].push(e.student_id));

  const classStudents = (cls: string) => enrolledByClass[cls];

  classSessions.forEach((cs) => {
    if (cs.status !== 'done') return; // 仅已上场次产生记录
    const stuList = classStudents(cs.class_id);
    stuList.forEach((sid) => {
      const cat = inferCat(sid);
      // 出勤（独立维度，仅由 attendance 表判定，与作业提交无关）
      let attStatus: AttendanceStatus = 'present';
      if (cat === 'behind') {
        const r = (counter + sid.length) % 3;
        attStatus = r === 0 ? 'absent' : r === 1 ? 'late' : 'leave';
      }
      attendance.push({
        id: nid('at'),
        class_session_id: cs.id,
        student_id: sid,
        status: attStatus,
        time: cs.actual_start as number,
        note: '',
        created_at: cs.actual_start as number,
        updated_at: cs.actual_start as number,
        created_by: `u_${cs.teacher_id}`,
      });

      // 作业绑定（每个已上场次对应一次作业提交）
      const asId = (assignments.find(
        (a) => a.class_id === cs.class_id && a.lesson_id === cs.lesson_id,
      ) as Assignment).id;

      // 提交决策：落后学员半数未交；其余提交。pending 仅表示「作业尚未提交」，与出勤无关
      // （缺席学员同样记为 pending；出勤但未交也记为 pending）。
      const submit = cat === 'behind' ? counter % 2 === 0 : true;
      const submissionId = nid('sub');
      if (!submit || attStatus === 'absent') {
        // 作业未提交（含缺席场景）：pending，不建作品版本与学习记录
        submissions.push({
          id: submissionId,
          assignment_id: asId,
          student_id: sid,
          status: 'pending',
          tools: '',
          prompts: '',
          public_allowed: false,
          final_version_id: null,
          ai_review_id: null,
          teacher_review_id: null,
          created_at: cs.actual_end as number,
          updated_at: cs.actual_end as number,
          created_by: sid,
        });
      } else {
        // 已提交：按类别产生多样状态（to_review/need_revise/completed/excellent）
        const st: SubmissionStatus = decideSubmissionStatus(cat, counter);
        submissions.push({
          id: submissionId,
          assignment_id: asId,
          student_id: sid,
          status: st,
          tools: '通用 AI 工具',
          prompts: '请帮我写一份…',
          public_allowed: cat === 'strong',
          final_version_id: null,
          ai_review_id: null,
          teacher_review_id: null,
          created_at: cs.actual_end as number,
          updated_at: cs.actual_end as number,
          created_by: sid,
        });
        // 作品版本（1-3 版，最后一版为终稿）
        const verCount = cat === 'strong' ? 3 : cat === 'progress' ? 2 : 1;
        let finalVid = '';
        for (let v = 1; v <= verCount; v++) {
          const vid = nid('wv');
          const isFinal = v === verCount;
          if (isFinal) finalVid = vid;
          workVersions.push({
            id: vid,
            submission_id: submissionId,
            student_id: sid,
            version_no: v,
            content: `第 ${v} 版作品内容`,
            snapshot_file_id: null,
            is_final: isFinal,
            created_at: (cs.actual_end as number) + v * 1000,
            updated_at: (cs.actual_end as number) + v * 1000,
          });
        }
        // 关联文件元数据（仅元数据，mock_url）
        files.push({
          id: nid('f'),
          name: `作品_${sid}_${cs.lesson_id}.png`,
          owner_type: 'work_version',
          owner_id: finalVid,
          mime: 'image/png',
          size: 128000,
          mock_url: '/demo-assets/student-work-1.png',
          meta: '{"w":800,"h":600}',
          created_at: (cs.actual_end as number) + 999,
          updated_at: (cs.actual_end as number) + 999,
        });
        // 回写 final_version_id
        const sub = submissions.find((s) => s.id === submissionId) as Submission;
        sub.final_version_id = finalVid;

        // AI 分析（仅内部/教师可见）
        const aid = nid('ai');
        aiAnalysis.push({
          id: aid,
          ref_type: 'submission',
          ref_id: submissionId,
          content: '【演示版 AI 建议】作品结构完整，提示词可更具体。',
          confidence: 0.6,
          is_confirmed: false,
          created_at: (cs.actual_end as number) + 2000,
          updated_at: (cs.actual_end as number) + 2000,
        });
        sub.ai_review_id = aid;

        // 学习记录（已出勤且已提交）
        learningRecords.push({
          id: nid('lr'),
          student_id: sid,
          class_session_id: cs.id,
          submission_id: submissionId,
          prep: cat === 'behind' ? '准备不足' : '准备充分',
          exercise_completion: cat === 'behind' ? '60%' : '100%',
          tools: '通用 AI 工具',
          key_prompts: '请生成…',
          problems: cat === 'behind' ? '不理解提示词' : '无',
          need_help: cat === 'behind',
          teacher_observation: cat === 'strong' ? '掌握很快' : '需跟进',
          ai_analysis_ref: null,
          next_suggestion: '继续下一节练习',
          created_at: cs.actual_end as number,
          updated_at: cs.actual_end as number,
          created_by: `u_${cs.teacher_id}`,
        });
      }
    });
  });

  // —— 能力评估快照 ——
  students.forEach((st) => {
    const cat = inferCat(st.id);
    DIMENSIONS.forEach((dim) => {
      // 基线
      const baseLevel: AbilityLevel =
        cat === 'strong' ? 'L3' : cat === 'behind' ? 'L1' : 'L2';
      abilityAssessments.push({
        id: nid('ab'),
        student_id: st.id,
        dimension: dim,
        level: baseLevel,
        source: 'baseline',
        evidence_id: null,
        ai_suggested_level: null,
        teacher_confirmed_level: null,
        status: 'published',
        evidence_text: null,
        assessment_group_id: null,
        assessed_at: BASE,
        created_at: BASE,
        updated_at: BASE,
        created_by: `u_${st.id}`,
      });
      // 进步/基础较强：后续快照形成曲线
      if (cat === 'progress' || cat === 'strong') {
        const later: AbilityLevel = cat === 'strong' ? 'L4' : 'L3';
        abilityAssessments.push({
          id: nid('ab'),
          student_id: st.id,
          dimension: dim,
          level: later,
          source: 'teacher',
          evidence_id: null,
          ai_suggested_level: later,
          teacher_confirmed_level: later,
          status: 'published',
          evidence_text: null,
          assessment_group_id: null,
          assessed_at: now,
          created_at: now,
          updated_at: now,
          created_by: 'u_t1',
        });
      }
    });
  });

  // —— 教师评价（已确认，针对进步/较强） ——
  students
    .filter((s) => inferCat(s.id) === 'progress' || inferCat(s.id) === 'strong')
    .slice(0, 4)
    .forEach((st) => {
      teacherReviews.push({
        id: nid('tr'),
        student_id: st.id,
        ref_lesson_id: 'ls08',
        teacher_id: studentTeacher[st.id],
        tags: '{"态度":"积极","熟练度":"良好","提示词":"进步明显"}',
        ai_draft: '【演示版 AI 建议】该学员进步明显，建议进入综合项目。',
        teacher_text: '该学员进步明显，建议进入综合项目。',
        status: 'confirmed',
        created_by: 'u_t1',
        confirmed_at: now,
        created_at: now,
        updated_at: now,
      });
    });

  // —— 关注事项（落后学员） ——
  students
    .filter((s) => inferCat(s.id) === 'behind')
    .forEach((st, idx) => {
      concerns.push({
        id: nid('cn'),
        student_id: st.id,
        type: '出勤/欠交',
        trigger_reason: idx % 2 === 0 ? '连续两次缺课' : '两次以上未交作业',
        evidence: 'attendance + submissions 记录',
        suggested_action: '课后一对一辅导',
        owner: studentTeacher[st.id],
        due: '2026-02-10',
        status: idx % 2 === 0 ? 'pending' : 'confirmed',
        confirmed_by: idx % 2 === 0 ? null : 't1',
        confirmed_at: idx % 2 === 0 ? null : now,
        resolved_at: null,
        result: '',
        created_at: now,
        updated_at: now,
      });
    });

  // —— 沟通记录 ——
  students.slice(0, 6).forEach((st) => {
    communications.push({
      id: nid('cm'),
      type: 'after_class',
      student_id: st.id,
      teacher_id: studentTeacher[st.id],
      time: now - DAY,
      content: '沟通了本周学习难点',
      follow_up: '下周跟进',
      owner: studentTeacher[st.id],
      attachment_id: null,
      created_at: now - DAY,
      updated_at: now - DAY,
      created_by: 'u_t1',
    });
  });

  // —— 待办 ——
  todos.push(
    {
      id: nid('td'),
      owner_type: 'teacher',
      owner_id: 't1',
      title: `批改${classDefs[0].name}第 8 节作业`,
      related_student_id: null,
      due: '2026-02-01',
      status: 'todo',
      created_at: now,
      updated_at: now,
    },
    {
      id: nid('td'),
      owner_type: 'system',
      owner_id: 'sys',
      title: '关注落后学员学习情况',
      related_student_id: students.find((s) => inferCat(s.id) === 'behind')?.id ?? null,
      due: null,
      status: 'todo',
      created_at: now,
      updated_at: now,
    },
  );

  // —— 操作日志（种子初始化痕迹） ——
  operationLogs.push({
    id: nid('ol'),
    user_id: 'u_t1',
    action: 'seed',
    target: 'system',
    changes: '初始化演示数据',
    created_at: now,
  });

  // —— 教师排班（时间排版表）：每位老师按各自班级的周常日，在「演示现在」前后各 2 周生成示例排课 ——
  const scheduleMeta: Record<string, { day: number; start: string; end: string }> = {
    t1: { day: 1, start: '19:00', end: '21:00' }, // 每周一晚
    t2: { day: 6, start: '14:00', end: '16:00' }, // 每周六
    t3: { day: 3, start: '19:00', end: '21:00' }, // 每周三晚
    t4: { day: 5, start: '19:00', end: '21:00' }, // 每周五晚
    t5: { day: 0, start: '10:00', end: '12:00' }, // 每周日
  };
  const ymd = (ts: number) => new Date(ts).toISOString().slice(0, 10);
  teacherDefs.forEach((t) => {
    const meta = scheduleMeta[t.id];
    const cls = classDefs.find((c) => c.teacher_id === t.id);
    if (!meta || !cls) return;
    // 以 now 为锚，向前 14 天、向后 14 天，逐日扫描匹配周常日 → 每位老师约 5 条
    for (let off = -14; off <= 14; off++) {
      const ts = now + off * DAY;
      if (new Date(ts).getUTCDay() !== meta.day) continue;
      teacherSchedules.push({
        id: nid('ts'),
        teacher_id: t.id,
        schedule_date: ymd(ts),
        start_time: meta.start,
        end_time: meta.end,
        title: `${cls.name} 常规课`,
        location: cls.location,
        note: '',
        created_at: BASE,
        updated_at: now,
        created_by: `u_${t.id}`,
      });
    }
  });

  const db: DBShape = {
    users,
    students,
    teachers,
    teacher_schedules: teacherSchedules,
    classes,
    enrollments,
    courses,
    lessons,
    class_sessions: classSessions,
    attendance,
    assignments,
    submissions,
    work_versions: workVersions,
    learning_records: learningRecords,
    ability_assessments: abilityAssessments,
    teacher_reviews: teacherReviews,
    ai_analysis: aiAnalysis,
    communications,
    concerns,
    todos,
    files,
    operation_logs: operationLogs,
  };
  return db;
}

/**
 * 资料库桥接覆盖层
 * -----------------
 * 学员信息可在「资料库在线表格」集中维护（见 README 的同步说明）。
 * 同步脚本 scripts/sync-library-students.mjs 会把资料库该表导出为
 * studentOverrides.cl1.json，这里在种子生成时按学号覆盖 students 表字段，
 * 并按「所属班级」调整 enrollments 的 class_id 映射（从而切换老师）。
 *
 * 设计约束：
 * - 纯前端、无 token 暴露：中控只 import 这个本地 JSON，不直连资料库 API；
 * - 离线/文件缺失时静默跳过，回落种子默认值，不影响启动；
 * - 本桥接层不读写浏览器本地存储（唯一访问点见 LocalDataLayer）。
 */
import studentOverrides from './studentOverrides.cl1.json';
import studentOverridesCl25 from './studentOverrides.cl2-cl5.json';

type StudentOverride = {
  student_id: string;
  nickname?: string;
  loginName?: string;
  age_range?: string;
  occupation?: string;
  self_intro?: string;
  class_id?: string; // 资料库「所属班级」解析后：cl1-cl5
  ai_baseline?: string | null;
  teacher_tags?: string[];
  teacher_observation?: string | null;
  learning_suggestion?: string | null;
};

function classFromLabel(label?: string): string | undefined {
  if (!label) return undefined;
  const m = /^cl([1-5])/.exec(label.trim());
  return m ? `cl${m[1]}` : undefined;
}

function applyStudentOverrides(db: DBShape): DBShape {
  // cl1-cl5 均可经资料库桥接：cl1 为真实表；cl2-cl5 已支持多班同步
  // （scripts/sync-library-students.mjs 多班版，按 LIBRARY_DB_ID_CL2..CL5 配置后同步覆盖示例）
  const overrides = [
    ...(studentOverrides?.students ?? []),
    ...(studentOverridesCl25?.students ?? []),
  ] as StudentOverride[];
  if (!overrides.length) return db;

  const byId = new Map<string, StudentOverride>();
  for (const o of overrides) {
    if (o?.student_id) byId.set(o.student_id, o);
  }
  if (!byId.size) return db;

  for (const s of db.students as Student[]) {
    const o = byId.get(s.id);
    if (!o) continue;
    if (o.nickname !== undefined) s.nickname = o.nickname;
    if (o.loginName !== undefined) {
      const u = (db.users as User[]).find((x) => x.id === s.user_id);
      if (u) {
        u.name = o.loginName;
        u.account = o.loginName;
      }
    }
    if (o.age_range !== undefined) s.age_range = o.age_range;
    if (o.occupation !== undefined) s.occupation = o.occupation;
    if (o.self_intro !== undefined) s.self_intro = o.self_intro;

    // 班级归属切换：更新 enrollments 对应记录的 class_id
    const cls = classFromLabel(o.class_id);
    if (cls) {
      const enr = (db.enrollments as Enrollment[]).find((e) => e.student_id === s.id);
      if (enr) enr.class_id = cls;
    }
    // 注：teacher_tags / ai_baseline / teacher_observation / learning_suggestion
    // 属教师内部字段，不通过资料库桥接覆盖，仍由中控种子默认 + 中控内编辑维护，
    // 避免外部表批量编辑污染内部判定与既有测试前提。
  }
  return db;
}

// 重新包一层：在 buildSeed 返回的 db 上应用覆盖
const _buildSeed = buildSeed;
export function buildSeedWithOverrides(): DBShape {
  return applyStudentOverrides(_buildSeed());
}


export const SEED_TABLE_NAMES: TableName[] = [
  'users',
  'students',
  'teachers',
  'teacher_schedules',
  'classes',
  'enrollments',
  'courses',
  'lessons',
  'class_sessions',
  'attendance',
  'assignments',
  'submissions',
  'work_versions',
  'learning_records',
  'ability_assessments',
  'teacher_reviews',
  'ai_analysis',
  'communications',
  'concerns',
  'todos',
  'files',
  'operation_logs',
];

export { levelToNum };
