// ============================================================
// 作业提交状态变更守卫（P0 · 越权修复 · 第三层防线）
// 纯函数模块，不依赖 DataLayer，供 LocalDataLayer 与 submissionService 共用。
// ============================================================
import type { SubmissionStatus } from '../data/types';

/** 状态变更的明确操作者；system 仅允许 seed / 迁移 / 重置，普通页面不得传入。 */
export type ChangeActor = { actorId: string; actorRole: 'teacher' | 'student' | 'system' };

export class PermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermissionError';
  }
}

export class IllegalTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalTransitionError';
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * 合法状态转换白名单（与 format.ts 的 STUDENT_SETTABLE_STATUS / TEACHER_GRADE_ACTIONS 口径一致）：
 * - 学员仅可发起：pending → to_review（首次提交）、need_revise → to_review（重新提交）。
 * - 教师可发起：to_review → need_revise / completed / excellent，以及已完成/优秀之间的重新评定。
 * - 其余转换（含学员设 completed/excellent/need_revise、pending 直接跳 completed 等）一律拒绝。
 */
const STUDENT_TRANSITIONS: Record<SubmissionStatus, SubmissionStatus[]> = {
  pending: ['to_review'],
  need_revise: ['to_review'],
  to_review: [],
  completed: [],
  excellent: [],
};

const TEACHER_TRANSITIONS: Record<SubmissionStatus, SubmissionStatus[]> = {
  pending: [],
  to_review: ['need_revise', 'completed', 'excellent'],
  need_revise: ['to_review', 'completed', 'excellent'],
  completed: ['need_revise', 'excellent', 'to_review'],
  excellent: ['need_revise', 'completed', 'to_review'],
};

/**
 * 第三层防线：在 Repository.update 含 status 变更时校验。
 * - 缺 actor 或 actorRole==='system' → ForbiddenError（普通页面/服务必须显式传 actor）。
 * - 学员设置非白名单状态 → PermissionError。
 * - 教师设置非白名单状态 → IllegalTransitionError。
 */
export function assertSubmissionStatusChange(
  from: SubmissionStatus,
  next: SubmissionStatus,
  actor: ChangeActor | undefined,
): void {
  if (!actor || actor.actorRole === 'system') {
    throw new ForbiddenError(
      'submission.status 变更必须携带明确的操作者（actorId + actorRole）；system 身份仅允许 seed / 迁移 / 重置',
    );
  }
  if (actor.actorRole === 'student' && !STUDENT_TRANSITIONS[from].includes(next)) {
    throw new PermissionError(`学员不能将作业状态从 ${from} 变更为 ${next}`);
  }
  if (actor.actorRole === 'teacher' && !TEACHER_TRANSITIONS[from].includes(next)) {
    throw new IllegalTransitionError(`教师不能将作业状态从 ${from} 变更为 ${next}`);
  }
}
