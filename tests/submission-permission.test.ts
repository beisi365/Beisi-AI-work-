// ============================================================
// P0 · 学员作业状态越权修复 · 权限测试
// 覆盖：第三层守卫（Repository.update 校验）、第二层业务服务（submissionService）、
// 操作日志、拒绝后数据不变、缺 actor / system 被拒。
// 页面 DOM 层（学员无状态下拉、教师按钮正常）由门禁的真实浏览器截图验证。
// ============================================================
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/data/repository';
import {
  studentSubmit,
  saveDraft,
  teacherReturn,
  teacherComplete,
  teacherMarkExcellent,
  assertSubmissionStatusChange,
  ForbiddenError,
  PermissionError,
  IllegalTransitionError,
} from '../src/lib/submissionService';
import type { SubmissionStatus } from '../src/data/types';

async function makeSubmission(status: SubmissionStatus) {
  return db.submissions.insert({
    assignment_id: 'a-test',
    student_id: 's-test',
    status,
    tools: '',
    prompts: '',
    public_allowed: false,
    final_version_id: null,
    ai_review_id: null,
    teacher_review_id: null,
    created_by: 'system',
  });
}

describe('P0 守卫纯函数 assertSubmissionStatusChange', () => {
  it('学员 pending→to_review 合法', () => {
    expect(() =>
      assertSubmissionStatusChange('pending', 'to_review', { actorId: 's', actorRole: 'student' }),
    ).not.toThrow();
  });
  it('学员 need_revise→to_review 合法', () => {
    expect(() =>
      assertSubmissionStatusChange('need_revise', 'to_review', { actorId: 's', actorRole: 'student' }),
    ).not.toThrow();
  });
  it('学员 to_review→completed 非法（PermissionError）', () => {
    expect(() =>
      assertSubmissionStatusChange('to_review', 'completed', { actorId: 's', actorRole: 'student' }),
    ).toThrow(PermissionError);
  });
  it('学员 to_review→need_revise 非法（必须经重新提交路径）', () => {
    expect(() =>
      assertSubmissionStatusChange('to_review', 'need_revise', { actorId: 's', actorRole: 'student' }),
    ).toThrow(PermissionError);
  });
  it('教师 to_review→completed 合法', () => {
    expect(() =>
      assertSubmissionStatusChange('to_review', 'completed', { actorId: 't', actorRole: 'teacher' }),
    ).not.toThrow();
  });
  it('教师 completed→pending 非法（IllegalTransitionError）', () => {
    expect(() =>
      assertSubmissionStatusChange('completed', 'pending', { actorId: 't', actorRole: 'teacher' }),
    ).toThrow(IllegalTransitionError);
  });
  it('缺 actor 抛 ForbiddenError', () => {
    expect(() => assertSubmissionStatusChange('to_review', 'completed', undefined)).toThrow(
      ForbiddenError,
    );
  });
  it('system 身份抛 ForbiddenError', () => {
    expect(() =>
      assertSubmissionStatusChange('to_review', 'completed', { actorId: 'sys', actorRole: 'system' }),
    ).toThrow(ForbiddenError);
  });
});

describe('P0 业务层 · 学员路径', () => {
  beforeEach(async () => {
    await db.reset();
  });

  it('学员 pending→to_review 经 studentSubmit 成功', async () => {
    const sub = await makeSubmission('pending');
    const after = await studentSubmit(db, sub.id, sub.student_id, '第一版作品');
    expect(after.status).toBe('to_review');
  });

  it('学员 need_revise→to_review 经 studentSubmit 成功', async () => {
    const sub = await makeSubmission('need_revise');
    const after = await studentSubmit(db, sub.id, sub.student_id, '修改后重新提交');
    expect(after.status).toBe('to_review');
  });

  it('学员保存草稿不改 submission.status', async () => {
    const sub = await makeSubmission('pending');
    const v = await saveDraft(db, sub.id, sub.student_id, '草稿内容');
    const after = await db.submissions.get(sub.id);
    expect(after!.status).toBe('pending'); // 状态不变
    expect(v.is_final).toBe(false); // 草稿非终稿
  });

  it('学员在 completed 状态下提交被拒（ForbiddenError）', async () => {
    const sub = await makeSubmission('completed');
    await expect(studentSubmit(db, sub.id, sub.student_id, 'x')).rejects.toThrow(ForbiddenError);
  });

  it('学员在 excellent 状态下提交被拒（ForbiddenError）', async () => {
    const sub = await makeSubmission('excellent');
    await expect(studentSubmit(db, sub.id, sub.student_id, 'x')).rejects.toThrow(ForbiddenError);
  });
});

describe('P0 第三层 Repository 守卫 · 直写拦截', () => {
  beforeEach(async () => {
    await db.reset();
  });

  it('学员直写 completed 被拒（PermissionError）', async () => {
    const sub = await makeSubmission('to_review');
    await expect(
      db.submissions.update(sub.id, { status: 'completed' }, { actorId: sub.student_id, actorRole: 'student' }),
    ).rejects.toThrow(PermissionError);
  });

  it('学员直写 excellent 被拒（PermissionError）', async () => {
    const sub = await makeSubmission('to_review');
    await expect(
      db.submissions.update(sub.id, { status: 'excellent' }, { actorId: sub.student_id, actorRole: 'student' }),
    ).rejects.toThrow(PermissionError);
  });

  it('学员直写 need_revise 被拒（必须经重新提交路径）', async () => {
    const sub = await makeSubmission('to_review');
    await expect(
      db.submissions.update(sub.id, { status: 'need_revise' }, { actorId: sub.student_id, actorRole: 'student' }),
    ).rejects.toThrow(PermissionError);
  });

  it('缺 actor 的裸 update 被拒（ForbiddenError）', async () => {
    const sub = await makeSubmission('to_review');
    await expect(db.submissions.update(sub.id, { status: 'completed' })).rejects.toThrow(
      ForbiddenError,
    );
  });

  it('system 身份 update 被拒（ForbiddenError）', async () => {
    const sub = await makeSubmission('to_review');
    await expect(
      db.submissions.update(sub.id, { status: 'completed' }, { actorId: 'sys', actorRole: 'system' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('教师非法转换（completed→pending）被拒（IllegalTransitionError）', async () => {
    const sub = await makeSubmission('completed');
    await expect(
      db.submissions.update(sub.id, { status: 'pending' }, { actorId: 't01', actorRole: 'teacher' }),
    ).rejects.toThrow(IllegalTransitionError);
  });

  it('拒绝后数据保持不变', async () => {
    const sub = await makeSubmission('to_review');
    await expect(
      db.submissions.update(sub.id, { status: 'completed' }, { actorId: sub.student_id, actorRole: 'student' }),
    ).rejects.toThrow();
    const after = await db.submissions.get(sub.id);
    expect(after!.status).toBe('to_review'); // 不变
  });
});

describe('P0 业务层 · 教师评定路径', () => {
  beforeEach(async () => {
    await db.reset();
  });

  it('教师退回 → need_revise', async () => {
    const sub = await makeSubmission('to_review');
    const after = await teacherReturn(db, sub.id, 't01');
    expect(after.status).toBe('need_revise');
  });

  it('教师标记完成 → completed', async () => {
    const sub = await makeSubmission('to_review');
    const after = await teacherComplete(db, sub.id, 't01');
    expect(after.status).toBe('completed');
  });

  it('教师设为优秀 → excellent', async () => {
    const sub = await makeSubmission('to_review');
    const after = await teacherMarkExcellent(db, sub.id, 't01');
    expect(after.status).toBe('excellent');
  });

  it('合法转换产生正确操作日志（actorId + status 变更）', async () => {
    const sub = await makeSubmission('to_review');
    await teacherComplete(db, sub.id, 't01');
    const logs = await db.getOperationLogs({ action: 'update' });
    const hit = logs.find((l) => l.target === `submissions:${sub.id}`);
    expect(hit, '应产生 submissions 的 update 操作日志').toBeTruthy();
    expect(hit!.user_id).toBe('t01'); // actorId 正确记录
    const changes = JSON.parse(hit!.changes);
    expect(changes.status).toBe('completed');
  });
});
