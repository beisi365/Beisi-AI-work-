// ============================================================
// 作业提交流转业务服务（P0 · 越权修复 · 第二层防线）
// 页面与测试不得直接拼装任意 submission.status；
// 所有合法状态变更统一经本模块的语义化方法，并由方法固定 actorRole。
// 第三层 Repository 守卫（assertSubmissionStatusChange）在 db.submissions.update 内兜底校验。
// ============================================================
import type { DataLayer } from '../data/repository/DataLayer';
import type { Submission, WorkVersion } from '../data/types';
import {
  assertSubmissionStatusChange,
  ForbiddenError,
  PermissionError,
  IllegalTransitionError,
  type ChangeActor,
} from './submissionStatusGuards';

// —— 内部辅助：新增一个作品版本，自动计算版本号；isFinal 控制是否为终稿 ——
async function addVersion(
  db: DataLayer,
  submissionId: string,
  studentId: string,
  content: string,
  isFinal: boolean,
): Promise<WorkVersion> {
  const versions = await db.workVersions.list({ where: { submission_id: submissionId } });
  const nextNo = versions.length ? Math.max(...versions.map((v) => v.version_no)) + 1 : 1;
  return db.workVersions.insert({
    submission_id: submissionId,
    student_id: studentId,
    version_no: nextNo,
    content,
    snapshot_file_id: null,
    is_final: isFinal,
  });
}

/**
 * 学员保存草稿：仅新增一个非终稿版本，绝不修改 submission.status。
 * 用于验证「保存草稿不改状态」的语义；页面新增作品版本统一走 studentSubmit。
 */
export async function saveDraft(
  db: DataLayer,
  submissionId: string,
  studentId: string,
  content: string,
): Promise<WorkVersion> {
  const sub = await db.submissions.get(submissionId);
  if (!sub) throw new Error(`submission ${submissionId} not found`);
  if (!studentId) throw new ForbiddenError('保存草稿必须携带学员身份');
  return addVersion(db, submissionId, studentId, content, false);
}

/**
 * 学员提交（首次）：pending → to_review，并新增一个终稿版本。
 * 由 studentSubmit 根据当前状态自动分派，不直接对外暴露在错误状态下调用。
 */
async function submit(
  db: DataLayer,
  submissionId: string,
  studentId: string,
  content: string,
): Promise<Submission> {
  const v = await addVersion(db, submissionId, studentId, content, true);
  return db.submissions.update(
    submissionId,
    { status: 'to_review', final_version_id: v.id },
    { actorId: studentId, actorRole: 'student' },
  );
}

/**
 * 学员重新提交：need_revise → to_review，并新增一个终稿版本。
 * 由 studentSubmit 根据当前状态自动分派。
 */
async function resubmit(
  db: DataLayer,
  submissionId: string,
  studentId: string,
  content: string,
): Promise<Submission> {
  const v = await addVersion(db, submissionId, studentId, content, true);
  return db.submissions.update(
    submissionId,
    { status: 'to_review', final_version_id: v.id },
    { actorId: studentId, actorRole: 'student' },
  );
}

/**
 * 学员提交作品：按当前状态自动分派。
 * - pending → to_review（首次提交）
 * - need_revise → to_review（重新提交）
 * - 其余状态（to_review / completed / excellent）学员不得再提交，直接拒绝。
 * 创建终稿版本并流转状态；actorRole 固定为 'student'。
 */
export async function studentSubmit(
  db: DataLayer,
  submissionId: string,
  studentId: string,
  content: string,
): Promise<Submission> {
  const sub = await db.submissions.get(submissionId);
  if (!sub) throw new Error(`submission ${submissionId} not found`);
  if (!studentId) throw new ForbiddenError('提交作品必须携带学员身份');
  if (sub.status === 'pending') return submit(db, submissionId, studentId, content);
  if (sub.status === 'need_revise') return resubmit(db, submissionId, studentId, content);
  throw new ForbiddenError(`学员不得在 ${sub.status} 状态下提交作品`);
}

// —— 教师评定动作：actorRole 固定为 'teacher' ——

/** 教师退回修改：to_review / need_revise → need_revise。 */
export async function teacherReturn(
  db: DataLayer,
  submissionId: string,
  teacherId: string,
): Promise<Submission> {
  if (!teacherId) throw new ForbiddenError('退回修改必须携带教师身份');
  return db.submissions.update(
    submissionId,
    { status: 'need_revise' },
    { actorId: teacherId, actorRole: 'teacher' },
  );
}

/** 教师标记完成：任意可评定状态 → completed。 */
export async function teacherComplete(
  db: DataLayer,
  submissionId: string,
  teacherId: string,
): Promise<Submission> {
  if (!teacherId) throw new ForbiddenError('标记完成必须携带教师身份');
  return db.submissions.update(
    submissionId,
    { status: 'completed' },
    { actorId: teacherId, actorRole: 'teacher' },
  );
}

/** 教师设为优秀：任意可评定状态 → excellent。 */
export async function teacherMarkExcellent(
  db: DataLayer,
  submissionId: string,
  teacherId: string,
): Promise<Submission> {
  if (!teacherId) throw new ForbiddenError('设为优秀必须携带教师身份');
  return db.submissions.update(
    submissionId,
    { status: 'excellent' },
    { actorId: teacherId, actorRole: 'teacher' },
  );
}

// —— 重导出守卫与类型，便于测试与业务层共用同一口径 ——
export { assertSubmissionStatusChange, ForbiddenError, PermissionError, IllegalTransitionError };
export type { ChangeActor };
