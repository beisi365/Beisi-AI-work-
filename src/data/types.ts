// ============================================================
// AI 培训学习工作台 · 数据模型类型（21 张表）
// 字段统一 snake_case，与查询 where 条件一致。
// 通用字段：id / created_at / updated_at；业务表含 created_by。
// ============================================================

/** 角色：教师 / 学员 / 运营管理员（admin 统管全部教师与排班；云端 profiles.role 已支持 admin） */
export type Role = 'teacher' | 'student' | 'admin';

// —— 枚举 ——
export type AttendanceStatus = 'present' | 'late' | 'leave' | 'absent';
export type SubmissionStatus =
  | 'pending'
  | 'to_review'
  | 'need_revise'
  | 'completed'
  | 'excellent';
export type AbilityDimension =
  | 'basics'
  | 'requirement'
  | 'prompt'
  | 'operation'
  | 'judgement'
  | 'application';
export type AbilityLevel = 'L1' | 'L2' | 'L3' | 'L4';
export type AssessmentSource = 'baseline' | 'self' | 'teacher' | 'ai' | 'work';
// 评估快照生命周期：草稿 → 已确认 → 已发布；已发布不可直接覆盖，修正时整组作废。
// 遗留 CP1 数据无此字段，读取时按 'published' 兼容（见 LocalDataLayer / queries）。
export type AssessmentStatus = 'draft' | 'confirmed' | 'published' | 'voided';
export type ReviewStatus = 'draft' | 'confirmed';
export type ConcernStatus = 'pending' | 'confirmed' | 'resolved';
export type DeliveryMode = 'offline' | 'online' | 'hybrid';
export type SessionStatus = 'scheduled' | 'ongoing' | 'done' | 'canceled';
export type CommType =
  | 'class_coach'
  | 'after_class'
  | 'homework_feedback'
  | 'phone_wechat'
  | 'goal_adjust'
  | 'device_account'
  | 'key_followup';
export type TodoOwnerType = 'teacher' | 'system';

// ============================================================
// 1. users 用户表
// ============================================================
export interface User {
  id: string;
  role: Role;
  name: string;
  account: string;
  avatar: string; // initials 或 url，不存 base64
  created_at: number;
  updated_at: number;
}

// ============================================================
// 2. students 学员表（无 class_id，经 enrollments 关联）
// ============================================================
export interface Student {
  id: string;
  user_id: string | null;
  nickname: string;
  age_range: string;
  occupation: string;
  contact: string;
  enroll_date: string;
  goal: string;
  weekly_hours: number;
  devices: string;
  os: string;
  office_software: string;
  ai_tools_used: string;
  can_self_service: boolean;
  uses_paid_ai: boolean;
  notes: string;
  // —— P1 学员管理新增字段（向后兼容：旧数据读取时按默认值归一化） ——
  self_intro: string; // 学员自我介绍：学员本人可编辑，教师可查看/协助编辑
  ai_baseline: string | null; // 教师内部：AI 基线分析，仅教师可见/可编辑
  teacher_tags: string[]; // 教师内部：学员档案标签，默认 []
  teacher_observation: string | null; // 教师内部：长期观察记录
  learning_suggestion: string | null; // 教师给出的学习建议：学员可见只读
  archived_at: string | null; // 归档时间；null = 在读，有时间值 = 已归档（不另设 status/is_active）
  // —— 报名问卷结构化字段（与 Excel 导入/导出一一对应，支持外部编辑回写） ——
  student_no: string; // 学号：外部 Excel 主键，用于导入导出对齐
  ai_experience: string; // 问卷：AI 使用经验
  priority_direction: string; // 问卷：优先学习方向
  open_answer: string; // 问卷：补充开放题
  remark: string; // 问卷：备注
  created_at: number;
  updated_at: number;
  created_by: string;
}

// ============================================================
// 3. teachers 教师表
// ============================================================
export interface Teacher {
  id: string;
  user_id: string;
  name: string;
  /** 身份/职位（如"AI 首席讲师"），可选；老数据无此字段时 UI 显示默认"AI 讲师" */
  title?: string;
  bio: string;
  subjects: string;
  created_at: number;
  updated_at: number;
}

// ============================================================
// 3.1 teacher_schedules 教师排班表（时间排版表）
// 按「具体日期 + 起止时段」录入单次排课；每位老师各管各的，后台可见全部 5 位。
// ============================================================
export interface TeacherSchedule {
  id: string;
  teacher_id: string; // t1–t5，归属教师；写权限锁本人（或 admin）
  schedule_date: string; // 'YYYY-MM-DD' 具体日期
  start_time: string; // 'HH:MM' 起
  end_time: string; // 'HH:MM' 止
  title: string; // 排课标题，如「AI写作第3讲」
  location: string; // 地点
  note: string; // 备注
  created_at: number;
  updated_at: number;
  created_by: string;
}

// ============================================================
// 4. classes 班级表
// ============================================================
export interface ClassRow {
  id: string;
  name: string;
  course_id: string;
  teacher_id: string;
  start_date: string;
  end_date: string;
  schedule: string;
  capacity: number;
  status: string;
  created_at: number;
  updated_at: number;
  created_by: string;
}

// ============================================================
// 5. enrollments 报名关系表（学员↔班级）
// ============================================================
export interface Enrollment {
  id: string;
  student_id: string;
  class_id: string;
  enroll_date: string;
  status: string;
  created_at: number;
  updated_at: number;
}

// ============================================================
// 6. courses 课程表
// ============================================================
export interface Course {
  id: string;
  title: string;
  description: string;
  total_lessons: number;
  target_audience: string;
  created_at: number;
  updated_at: number;
}

// ============================================================
// 7. lessons 课次（课程内容模板）
// ============================================================
export interface Lesson {
  id: string;
  course_id: string;
  seq: number;
  title: string;
  objectives: string;
  est_time: string;
  prereq: string;
  content: string;
  lecture_notes: string;
  steps: string;
  example_files: string[]; // file id 列表
  exercise: string;
  homework: string;
  tools: string;
  faq: string;
  completion_criteria: string;
  ability_dimension: AbilityDimension;
  created_at: number;
  updated_at: number;
}

// ============================================================
// 8. class_sessions 实际授课场次（新增）
// ============================================================
export interface ClassSession {
  id: string;
  class_id: string;
  lesson_id: string;
  teacher_id: string;
  scheduled_start: number;
  scheduled_end: number;
  actual_start: number | null;
  actual_end: number | null;
  location: string;
  delivery_mode: DeliveryMode;
  status: SessionStatus;
  created_at: number;
  updated_at: number;
}

// ============================================================
// 9. attendance 出勤表（关联场次）
// ============================================================
export interface Attendance {
  id: string;
  class_session_id: string;
  student_id: string;
  status: AttendanceStatus;
  time: number;
  note: string;
  created_at: number;
  updated_at: number;
  created_by: string;
}

// ============================================================
// 10. assignments 作业表（可绑定场次）
// ============================================================
export interface Assignment {
  id: string;
  lesson_id: string;
  class_id: string;
  class_session_id: string | null; // 补课/专场可绑定
  title: string;
  requirements: string;
  due_date: string;
  rubric: string;
  created_at: number;
  updated_at: number;
  created_by: string;
}

// ============================================================
// 11. submissions 作业提交表（仅状态/元信息，内容在 work_versions）
// ============================================================
export interface Submission {
  id: string;
  assignment_id: string;
  student_id: string;
  status: SubmissionStatus;
  tools: string;
  prompts: string;
  public_allowed: boolean;
  final_version_id: string | null; // 指向最终稿
  ai_review_id: string | null; // 关联 ai_analysis
  teacher_review_id: string | null; // 关联 teacher_reviews
  created_at: number;
  updated_at: number;
  created_by: string;
}

// ============================================================
// 12. work_versions 作品版本表（唯一作品内容来源）
// ============================================================
export interface WorkVersion {
  id: string;
  submission_id: string;
  student_id: string;
  version_no: number;
  content: string;
  snapshot_file_id: string | null;
  is_final: boolean;
  created_at: number;
  updated_at: number;
}

// ============================================================
// 13. learning_records 学习记录表（仅关联 ID + 课堂情况）
// ============================================================
export interface LearningRecord {
  id: string;
  student_id: string;
  class_session_id: string;
  submission_id: string | null;
  prep: string;
  exercise_completion: string;
  tools: string;
  key_prompts: string;
  problems: string;
  need_help: boolean;
  teacher_observation: string;
  ai_analysis_ref: string | null;
  next_suggestion: string;
  created_at: number;
  updated_at: number;
  created_by: string;
}

// ============================================================
// 14. ability_assessments 能力评估快照表
// ============================================================
export interface AbilityAssessment {
  id: string;
  student_id: string;
  dimension: AbilityDimension;
  level: AbilityLevel;
  source: AssessmentSource;
  evidence_id: string | null; // 关联 submissions
  ai_suggested_level: AbilityLevel | null;
  teacher_confirmed_level: AbilityLevel | null;
  // CP2.1 新增（经字段提案确认，向后兼容）：
  status: AssessmentStatus; // 遗留数据迁移为 'published'；新记录默认 'draft'
  evidence_text: string | null; // 事实证据说明；draft 可空，进入 confirmed 前必填
  assessment_group_id: string | null; // 一次完整评估/一次修正的六维共用；遗留单项记录为 null
  assessed_at: number;
  created_at: number;
  updated_at: number;
  created_by: string;
}

// ============================================================
// 15. teacher_reviews 教师评价表
// ============================================================
export interface TeacherReview {
  id: string;
  student_id: string;
  ref_lesson_id: string | null;
  teacher_id: string;
  tags: string; // JSON：态度/熟练度/提示词/完成度/创意/判断/加强/目标
  ai_draft: string;
  teacher_text: string;
  status: ReviewStatus;
  created_by: string;
  confirmed_at: number | null;
  created_at: number;
  updated_at: number;
}

// ============================================================
// 16. ai_analysis AI 分析记录表
// ============================================================
export interface AiAnalysis {
  id: string;
  ref_type: 'submission' | 'ability' | 'learning_record' | 'concern';
  ref_id: string;
  content: string;
  confidence: number; // 0–1
  is_confirmed: boolean;
  created_at: number;
  updated_at: number;
}

// ============================================================
// 17. communications 沟通记录表
// ============================================================
export interface Communication {
  id: string;
  type: CommType;
  student_id: string;
  teacher_id: string;
  time: number;
  content: string;
  follow_up: string;
  owner: string;
  attachment_id: string | null;
  created_at: number;
  updated_at: number;
  created_by: string;
}

// ============================================================
// 18. concerns 关注事项表
// ============================================================
export interface Concern {
  id: string;
  student_id: string;
  type: string;
  trigger_reason: string;
  evidence: string; // text / JSON refs
  suggested_action: string;
  owner: string;
  due: string | null;
  status: ConcernStatus;
  confirmed_by: string | null;
  confirmed_at: number | null;
  resolved_at: number | null;
  result: string;
  created_at: number;
  updated_at: number;
}

// ============================================================
// 19. todos 待办事项表
// ============================================================
export interface Todo {
  id: string;
  owner_type: TodoOwnerType;
  owner_id: string;
  title: string;
  related_student_id: string | null;
  due: string | null;
  status: string;
  created_at: number;
  updated_at: number;
}

// ============================================================
// 20. files 文件与附件表（仅元数据，不存 base64）
// ============================================================
export interface FileMeta {
  id: string;
  name: string;
  owner_type: string;
  owner_id: string;
  mime: string;
  size: number;
  mock_url: string; // 指向 public/demo-assets/
  meta: string; // JSON
  created_at: number;
  updated_at: number;
}

// ============================================================
// 21. operation_logs 操作日志表
// ============================================================
export interface OperationLog {
  id: string;
  user_id: string;
  action: string;
  target: string; // table+id
  changes: string; // JSON
  created_at: number;
}

// ============================================================
// 表名与形状映射（供 Repository / permissions / 订阅使用）
// ============================================================
export interface DBShape {
  users: User[];
  students: Student[];
  teachers: Teacher[];
  teacher_schedules: TeacherSchedule[];
  classes: ClassRow[];
  enrollments: Enrollment[];
  courses: Course[];
  lessons: Lesson[];
  class_sessions: ClassSession[];
  attendance: Attendance[];
  assignments: Assignment[];
  submissions: Submission[];
  work_versions: WorkVersion[];
  learning_records: LearningRecord[];
  ability_assessments: AbilityAssessment[];
  teacher_reviews: TeacherReview[];
  ai_analysis: AiAnalysis[];
  communications: Communication[];
  concerns: Concern[];
  todos: Todo[];
  files: FileMeta[];
  operation_logs: OperationLog[];
}

export type TableName = keyof DBShape;

// 操作主体（来自 AuthContext）
export interface Principal {
  userId: string;
  role: Role;
  studentId?: string;
  teacherId?: string;
}
