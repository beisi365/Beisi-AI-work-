import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/data/repository';
import { getTeacherOverview } from '../src/lib/queries';
import { teacherComplete } from '../src/lib/submissionService';

const teacherP = {
  role: 'teacher',
  userId: 'u_t1',
  teacherId: 't1',
  studentId: '',
} as any;

const studentP = {
  role: 'student',
  userId: 'u_s1',
  teacherId: '',
  studentId: 's1',
} as any;

describe('P2.3 作业管理与教师评价', () => {
  beforeEach(async () => {
    await db.reset();
  });

  it('教师新建 Assignment 并正确绑定 class/session', async () => {
    const cls = (await db.classes.list())[0];
    const lesson = (await db.lessons.list())[0];
    const doneSession = (await db.classSessions.list()).find(
      (s) => s.class_id === cls.id && s.status === 'done',
    );
    const before = (await db.assignments.list()).length;
    const created = await db.assignments.insert(
      {
        class_id: cls.id,
        lesson_id: lesson.id,
        class_session_id: doneSession ? doneSession.id : null,
        title: 'P2.3 测试作业',
        requirements: '按要求完成',
        due_date: '2026-02-01',
        rubric: '完成度',
        created_by: 'u_t1',
      },
      { actorId: 't1', actorRole: 'teacher' },
    );
    const after = (await db.assignments.list()).length;
    expect(after).toBe(before + 1);
    expect(created.class_id).toBe(cls.id);
    expect(created.class_session_id).toBe(doneSession ? doneSession.id : null);
  });

  it('教师编辑 Assignment 不产生重复记录且字段更新', async () => {
    const a = (await db.assignments.list())[0];
    const before = (await db.assignments.list()).length;
    await db.assignments.update(
      a.id,
      { title: '已编辑标题', requirements: '已编辑要求' },
      { actorId: 't1', actorRole: 'teacher' },
    );
    const after = (await db.assignments.list()).length;
    expect(after).toBe(before); // 不产生重复记录
    const reread = await db.assignments.get(a.id);
    expect(reread?.title).toBe('已编辑标题');
    expect(reread?.requirements).toBe('已编辑要求');
  });

  it('学生写 Assignment 被权限层拒绝（教师可写）', () => {
    const row = { class_id: 'cl1' };
    // 权限层：教师可写任意表；学员仅可写本人 submissions/work_versions/learning_records
    expect(db.canWrite(studentP, 'assignments', row)).toBe(false);
    expect(db.canWrite(teacherP, 'assignments', row)).toBe(true);
  });

  it('新建绑定 done session 的作业后 longNoSubmission 数据正确', async () => {
    const cls = (await db.classes.list())[0];
    const lesson = (await db.lessons.list())[0];
    const doneSession = (await db.classSessions.list()).find(
      (s) => s.class_id === cls.id && s.status === 'done',
    )!;
    const enrolled = (await db.enrollments.list()).filter((e) => e.class_id === cls.id);
    const stuId = enrolled[0].student_id;
    const newAssign = await db.assignments.insert(
      {
        class_id: cls.id,
        lesson_id: lesson.id,
        class_session_id: doneSession.id,
        title: '新增作业',
        requirements: 'x',
        due_date: '2026-02-01',
        rubric: 'x',
        created_by: 'u_t1',
      },
      { actorId: 't1', actorRole: 'teacher' },
    );
    await db.submissions.insert({
      assignment_id: newAssign.id,
      student_id: stuId,
      status: 'pending',
      tools: '',
      prompts: '',
      public_allowed: false,
      final_version_id: null,
      ai_review_id: null,
      teacher_review_id: null,
      created_by: stuId,
    } as never);
    const ov = await getTeacherOverview(db);
    const hit = ov.longNoSubmission.find((x) => x.student.id === stuId);
    expect(hit).toBeTruthy();
    expect(hit!.pendingCount).toBeGreaterThanOrEqual(1);
  });

  it('to_review → completed 后 pendingGrading 减少', async () => {
    const before = await getTeacherOverview(db);
    const target = before.pendingGrading;
    expect(target).toBeGreaterThan(0);
    const toReview = (await db.submissions.list()).find((s) => s.status === 'to_review');
    expect(toReview).toBeTruthy();
    await teacherComplete(db, toReview!.id, 't1');
    const after = await getTeacherOverview(db);
    expect(after.pendingGrading).toBe(target - 1);
  });

  it('TeacherReview tags + teacher_text 真实保存并重新读取', async () => {
    const sub = (await db.submissions.list())[0];
    const asg = (await db.assignments.list()).find((a) => a.id === sub.assignment_id)!;
    const tags = JSON.stringify({ 完成度: ['达标'], 下一步目标: ['深化主题'] });
    const created = await db.teacherReviews.insert({
      student_id: sub.student_id,
      ref_lesson_id: asg.lesson_id,
      teacher_id: 't1',
      tags,
      ai_draft: '',
      teacher_text: '表现稳定',
      status: 'confirmed',
      created_by: 't1',
      confirmed_at: Date.now(),
    } as never);
    const reread = await db.teacherReviews.get(created.id);
    expect(reread?.teacher_text).toBe('表现稳定');
    expect(reread?.tags).toBe(tags);
    await db.teacherReviews.update(created.id, {
      teacher_text: '进步明显',
      tags: JSON.stringify({ 创意: ['有亮点'] }),
    });
    const reread2 = await db.teacherReviews.get(created.id);
    expect(reread2?.teacher_text).toBe('进步明显');
    expect(JSON.parse(reread2!.tags).创意).toEqual(['有亮点']);
  });
});
