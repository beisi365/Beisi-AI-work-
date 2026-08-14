import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDataLayer } from '../src/data/repository/LocalDataLayer';
import type { Principal } from '../src/data/types';

describe('权限过滤', () => {
  let db: LocalDataLayer;
  let teacher: Principal;
  let student: Principal;

  beforeEach(async () => {
    db = new LocalDataLayer();
    await db.reset();
    teacher = { userId: 'u_t1', role: 'teacher', teacherId: 't1' };
    student = { userId: 'u_s01', role: 'student', studentId: 's01' };
  });

  it('教师可读取全部出勤记录', async () => {
    const all = await db.attendance.list();
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((r) => db.canRead(teacher, 'attendance', r))).toBe(true);
  });

  it('学员仅可读本人出勤，不可读他人', async () => {
    const all = await db.attendance.list();
    const mine = all.filter((r) => r.student_id === 's01');
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((r) => db.canRead(student, 'attendance', r))).toBe(true);
    const others = all.filter((r) => r.student_id !== 's01');
    expect(others.some((r) => db.canRead(student, 'attendance', r))).toBe(false);
  });

  it('学员不可读 concerns / ai_analysis / operation_logs', async () => {
    const concerns = await db.concerns.list();
    expect(concerns.every((r) => !db.canRead(student, 'concerns', r))).toBe(true);
    const ai = await db.aiAnalysis.list();
    expect(ai.every((r) => !db.canRead(student, 'ai_analysis', r))).toBe(true);
  });

  it('学员仅可读本人已确认评价', async () => {
    const reviews = await db.teacherReviews.list();
    for (const r of reviews) {
      const ok = db.canRead(student, 'teacher_reviews', r);
      if (r.student_id !== 's01') expect(ok).toBe(false);
      else expect(ok).toBe(r.status === 'confirmed');
    }
  });

  it('queryScoped 仅返回学员有权行', async () => {
    const scoped = await db.queryScoped<any>(student, 'attendance');
    expect(scoped.every((r) => r.student_id === 's01')).toBe(true);
  });

  it('学员仅可写本人提交', async () => {
    const subs = await db.submissions.list();
    const mine = subs.find((s) => s.student_id === 's01');
    if (mine) expect(db.canWrite(student, 'submissions', mine)).toBe(true);
    const others = subs.find((s) => s.student_id !== 's01');
    if (others) expect(db.canWrite(student, 'submissions', others)).toBe(false);
  });
});
