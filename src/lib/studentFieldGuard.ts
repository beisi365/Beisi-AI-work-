// ============================================================
// P1 学员字段级权限守卫（下沉到 Repository 层强制调用）
// 纯函数 + 常量，不依赖 DataLayer，供 LocalDataLayer 与 studentService 共用。
// 设计原则：
//  - 学员只能修改本人白名单内字段；混入任何白名单外字段 → 整次失败，不静默剥离。
//  - 教师可改批准档案字段，但不得通过普通资料编辑篡改系统字段（id/user_id/时间戳/created_by）。
//  - system 仅用于 seed / 迁移 / 重置，业务页面不得传入。
// ============================================================
import type { Student } from '../data/types';
import type { ChangeActor } from './submissionStatusGuards';

/** 学员试图修改白名单外字段时抛出 */
export class StudentFieldForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StudentFieldForbiddenError';
  }
}

/**
 * 学员本人可维护的字段白名单：
 * 含展示姓名、自我介绍、以及明确属于本人资料的现有字段（年龄段/职业/学习目标/每周时间/
 * 设备系统/办公软件/本人使用的 AI 工具/自助能力/是否使用付费 AI/联系方式）。
 * 不含内部字段（ai_baseline/teacher_tags/teacher_observation）、learning_suggestion（学员只读）、
 * 归档状态（archived_at）、班级与报名关系、任何系统字段。
 */
export const STUDENT_SELF_EDITABLE: readonly (keyof Student)[] = [
  'nickname',
  'self_intro',
  'age_range',
  'occupation',
  'goal',
  'weekly_hours',
  'devices',
  'os',
  'office_software',
  'ai_tools_used',
  'can_self_service',
  'uses_paid_ai',
  'contact',
];

/** 教师编辑也不可改的系统字段（主键/时间戳/归属/创建人） */
export const STUDENT_SYSTEM_FIELDS: readonly (keyof Student)[] = [
  'id',
  'user_id',
  'created_at',
  'updated_at',
  'created_by',
];

/** 教师内部字段：绝不对学员返回，也绝不允许学员修改 */
export const STUDENT_INTERNAL_FIELDS = ['ai_baseline', 'teacher_tags', 'teacher_observation'] as const;

/**
 * 学员更新本人资料的字段守卫（在 Repository.update 写库前调用）：
 *  - 校验所有权：actor.actorId 必须等于被改学员 id，否则整次失败。
 *  - 校验白名单：任何白名单外字段 → 抛出 StudentFieldForbiddenError（整次失败，不静默剥离）。
 * 不修改 patch；调用方据此中止写库，保证原子性（已写字段一并回滚）。
 */
export function assertStudentSelfEdit(
  studentId: string,
  actor: ChangeActor,
  patch: Record<string, unknown>,
): void {
  if (actor.actorRole !== 'student') return; // 仅约束学员；教师/system 走各自逻辑
  if (actor.actorId !== studentId) {
    throw new StudentFieldForbiddenError('只能修改本人资料');
  }
  const forbidden = Object.keys(patch).filter(
    (k) => !(STUDENT_SELF_EDITABLE as readonly string[]).includes(k),
  );
  if (forbidden.length) {
    throw new StudentFieldForbiddenError(`学员不可修改以下字段：${forbidden.join('、')}`);
  }
}

/** 教师编辑时剔除系统字段（主键/时间戳/归属），避免通过普通资料编辑篡改 */
export function filterTeacherSystemFields(patch: Record<string, unknown>): Record<string, unknown> {
  const out = { ...patch };
  for (const f of STUDENT_SYSTEM_FIELDS) delete out[f as string];
  return out;
}

/** 仅允许学员本人写入的产出表（用于归档守卫：已归档学员不得新增此类数据） */
export const STUDENT_PRODUCED_TABLES = ['submissions', 'work_versions', 'learning_records'] as const;
