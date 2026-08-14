import { describe, it, expect } from 'vitest';
import { db } from '../src/data/repository';
import { canRead } from '../src/data/repository/permissions';
import { getStudentDashboard, getFocusStudents, inferCategory, doneAssignmentIds } from '../src/lib/queries';
import type { Principal } from '../src/data/types';

const studentP: Principal = { userId: 'u_s01', role: 'student', studentId: 's01' };
const teacherP: Principal = { userId: 'u_t1', role: 'teacher', teacherId: 't1' };

describe('页面权限隔离', () => {
  it('学员看不到教师内部备注(concerns)与 AI 草稿(ai_analysis)', async () => {
    const concerns = await db.concerns.list();
    const ai = await db.aiAnalysis.list();
    expect(concerns.length).toBeGreaterThan(0);
    expect(ai.length).toBeGreaterThan(0);
    // 任何 concerns / ai_analysis 行对学员均不可读
    for (const c of concerns) {
      expect(canRead(studentP, 'concerns', c as unknown as Record<string, unknown>, { isEnrolled: () => true })).toBe(false);
    }
    for (const a of ai) {
      expect(canRead(studentP, 'ai_analysis', a as unknown as Record<string, unknown>, { isEnrolled: () => true })).toBe(false);
    }
    // 教师可读
    expect(canRead(teacherP, 'concerns', concerns[0] as unknown as Record<string, unknown>, { isEnrolled: () => true })).toBe(true);
  });

  it('学员只能读到本人数据，看不到他人提交', async () => {
    const others = await db.submissions.list({ where: { student_id: 's02' } } as never);
    for (const o of others) {
      expect(canRead(studentP, 'submissions', o as unknown as Record<string, unknown>, { isEnrolled: () => true })).toBe(false);
    }
    const mine = await db.submissions.list({ where: { student_id: 's01' } } as never);
    for (const m of mine) {
      expect(canRead(studentP, 'submissions', m as unknown as Record<string, unknown>, { isEnrolled: () => true })).toBe(true);
    }
  });
});

describe('跨页数据一致性', () => {
  it('学员档案出勤/提交统计与直接查询一致', async () => {
    const dash = await getStudentDashboard(db, 's01');
    const directAtt = await db.attendance.list({ where: { student_id: 's01' } } as never);
    expect(dash.attendance.length).toBe(directAtt.length);
    const directSub = await db.submissions.list({ where: { student_id: 's01' } } as never);
    expect(dash.submissions.length).toBe(directSub.length);
    // 提交率分母 = 已上课程（场次 done）对应的作业数
    const [assignments, sessions] = await Promise.all([db.assignments.list(), db.classSessions.list()]);
    const doneAssign = doneAssignmentIds(
      assignments.filter((a) => a.class_id === dash.classRow?.id),
      sessions,
    );
    const expectedRate = doneAssign.size
      ? dash.submissions.filter((s) => s.status !== 'pending').length / doneAssign.size
      : 0;
    expect(Math.round(dash.submissionRate * 100)).toBe(Math.round(expectedRate * 100));
  });

  it('需关注学员列表仅含落后/低出勤/低提交/有未解决关注项，不含基础较强学员', async () => {
    const focus = await getFocusStudents(db);
    const ids = focus.map((f) => f.student.id);
    // 基础较强(s18-s20)不应出现在需关注（除非有其他原因，但种子中不会有）
    for (const id of ['s18', 's19', 's20']) {
      expect(ids).not.toContain(id);
    }
    // 每个被标记者至少有 1 条原因
    expect(focus.every((f) => f.reasons.length > 0)).toBe(true);
  });

  it('学员类别推断与种子配比一致', () => {
    expect(inferCategory('s01')).toBe('normal');
    expect(inferCategory('s09')).toBe('behind');
    expect(inferCategory('s14')).toBe('progress');
    expect(inferCategory('s20')).toBe('strong');
  });
});
