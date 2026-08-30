import type { Principal, TableName } from '../types';

/** 权限判断所需的上下文查询（由 LocalDataLayer 注入，便于单测） */
export interface PermContext {
  isEnrolled(studentId: string, classId: string): boolean;
}

const STUDENT_OWNED: TableName[] = [
  'attendance',
  'submissions',
  'work_versions',
  'learning_records',
  'ability_assessments',
  'teacher_reviews',
  'communications',
];

/** 学员是否可读该表行 */
export function canRead(
  p: Principal,
  table: TableName,
  row: Record<string, unknown>,
  ctx: PermContext,
): boolean {
  // 教师可读所负责班级全部（演示环境全量）；运营管理员可读全部
  if (p.role === 'teacher' || p.role === 'admin') return true;
  if (p.role !== 'student') return false;

  // 内部/敏感数据：学员不可见
  if (table === 'concerns') return false; // 待确认预警不向学生展示
  if (table === 'ai_analysis') return false; // AI 初步分析不向学生展示
  if (table === 'operation_logs') return false;

  // 直接绑定学员本人的表
  if (STUDENT_OWNED.includes(table)) {
    if (table === 'teacher_reviews') {
      return row.student_id === p.studentId && row.status === 'confirmed';
    }
    return row.student_id === p.studentId;
  }

  if (table === 'todos') {
    return row.related_student_id === p.studentId || row.owner_type === 'system';
  }
  if (table === 'files') {
    return row.owner_id === p.studentId;
  }
  if (table === 'enrollments') {
    return row.student_id === p.studentId;
  }
  if (table === 'users') {
    return row.id === p.userId;
  }
  // 班级 / 场次 / 作业：仅本学员所在班级可见
  if (table === 'classes' || table === 'class_sessions' || table === 'assignments') {
    return ctx.isEnrolled(p.studentId as string, row.class_id as string);
  }
  // 课程 / 课次 / 教师：公开内容可读
  if (table === 'courses' || table === 'lessons' || table === 'teachers') {
    return true;
  }
  return false;
}

/** 学员是否可写该表行 */
export function canWrite(
  p: Principal,
  table: TableName,
  row: Record<string, unknown>,
  _ctx: PermContext,
): boolean {
  // 教师可写所负责范围；运营管理员可写全部
  if (p.role === 'teacher' || p.role === 'admin') return true;
  if (p.role !== 'student') return false;
  // 学员可写本人学员档案行（字段级允许范围由 studentService 强制；禁止改班级/归档/内部字段）
  if (table === 'students') {
    return row.id === p.studentId;
  }
  // 学员仅可写自己的作业、作品版本、学习记录
  if (table === 'submissions' || table === 'work_versions' || table === 'learning_records') {
    return row.student_id === p.studentId;
  }
  return false;
}
