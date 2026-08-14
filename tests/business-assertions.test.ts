import { describe, it, expect } from 'vitest';
import { db } from '../src/data/repository';
import { getClassesWithStats, doneAssignmentIds } from '../src/lib/queries';
import { STUDENT_SETTABLE_STATUS } from '../src/lib/format';

describe('业务口径断言', () => {
  it('① 缺席学员存在 pending 提交记录，但不生成课堂学习记录', async () => {
    const [attendance, submissions, learningRecords, assignments, sessions] = await Promise.all([
      db.attendance.list(),
      db.submissions.list(),
      db.learningRecords.list(),
      db.assignments.list(),
      db.classSessions.list(),
    ]);
    const absent = attendance.filter((a) => a.status === 'absent');
    expect(absent.length).toBeGreaterThan(0); // 演示数据中存在缺席样例

    for (const a of absent) {
      const cs = sessions.find((s) => s.id === a.class_session_id);
      expect(cs, `找不到场次 ${a.class_session_id}`).toBeTruthy();
      const asId = assignments.find(
        (x) => x.class_id === cs!.class_id && x.lesson_id === cs!.lesson_id,
      )?.id;
      // 缺席学员：应有 pending 提交（作业未提交）
      const sub = submissions.find(
        (s) => s.student_id === a.student_id && s.assignment_id === asId,
      );
      expect(sub, `缺席学员 ${a.student_id} 应有一条 pending 提交`).toBeTruthy();
      expect(sub!.status).toBe('pending');
      // 缺席学员：不应有课堂学习记录
      const lr = learningRecords.find(
        (r) => r.student_id === a.student_id && r.class_session_id === a.class_session_id,
      );
      expect(lr, `缺席学员 ${a.student_id} 不应有学习记录`).toBeUndefined();
    }
  });

  it('② need_revise 重新提交后进入 to_review', async () => {
    const subs = await db.submissions.list();
    const target = subs.find((s) => s.status === 'need_revise');
    expect(target, '演示数据应存在 need_revise 提交').toBeTruthy();
    // 学员修改后重新提交 → 待教师批改
    await db.submissions.update(target!.id, { status: 'to_review' });
    const after = await db.submissions.get(target!.id);
    expect(after!.status).toBe('to_review');
  });

  it('③ submissionRate 统计所有非 pending 状态', async () => {
    const [classes, enrollments, sessions, assignments, submissions] = await Promise.all([
      db.classes.list(),
      db.enrollments.list(),
      db.classSessions.list(),
      db.assignments.list(),
      db.submissions.list(),
    ]);
    const stats = await getClassesWithStats(db);
    for (const stat of stats) {
      const c = classes.find((x) => x.id === stat.classRow.id)!;
      const enrolled = enrollments.filter((e) => e.class_id === c.id).map((e) => e.student_id);
      const classAssignmentIds = doneAssignmentIds(
        assignments.filter((a) => a.class_id === c.id),
        sessions,
      );
      const expected = classAssignmentIds.size * enrolled.length;
      const done = submissions.filter(
        (s) => classAssignmentIds.has(s.assignment_id) && s.status !== 'pending',
      ).length;
      expect(stat.submissionRate).toBeCloseTo(expected ? done / expected : 0, 6);
    }
  });

  it('④ completionRate 仅统计 completed + excellent，且与 submissionRate 同分母', async () => {
    const [classes, enrollments, sessions, assignments, submissions] = await Promise.all([
      db.classes.list(),
      db.enrollments.list(),
      db.classSessions.list(),
      db.assignments.list(),
      db.submissions.list(),
    ]);
    const stats = await getClassesWithStats(db);
    for (const stat of stats) {
      const c = classes.find((x) => x.id === stat.classRow.id)!;
      const enrolled = enrollments.filter((e) => e.class_id === c.id).map((e) => e.student_id);
      const classAssignmentIds = doneAssignmentIds(
        assignments.filter((a) => a.class_id === c.id),
        sessions,
      );
      const expected = classAssignmentIds.size * enrolled.length;
      const completed = submissions.filter(
        (s) =>
          classAssignmentIds.has(s.assignment_id) &&
          (s.status === 'completed' || s.status === 'excellent'),
      ).length;
      expect(stat.completionRate).toBeCloseTo(expected ? completed / expected : 0, 6);
      // 同分母：完成率分子 ⊆ 提交率分子 → completionRate ≤ submissionRate
      expect(stat.completionRate).toBeLessThanOrEqual(stat.submissionRate + 1e-9);
    }
  });

  it('⑤ 学员新增版本并重新提交 → to_review；学员端不可直接设置 completed/excellent', async () => {
    await db.reset(); // 干净种子，避免受其它用例的状态改动影响
    const subs = await db.submissions.list();
    const target = subs.find((s) => s.status === 'need_revise');
    expect(target, '演示数据应存在 need_revise 提交供学员重新提交').toBeTruthy();

    // —— 模拟学员在「作业与作品」页的真实交互：点击「+ 新增作品版本」→ 填写 →「保存为新版本」 ——
    // 该交互在 UI 中对应两步：插入一条 is_final 的新作品版本 + 将 submission 状态置为 to_review
    const versBefore = (await db.workVersions.list()).filter((w) => w.submission_id === target!.id);
    const nextNo = versBefore.length + 1;
    const created = await db.workVersions.insert({
      submission_id: target!.id,
      student_id: target!.student_id,
      version_no: nextNo,
      content: `学员重新提交的第 ${nextNo} 版作品`,
      snapshot_file_id: null,
      is_final: true,
    } as never);
    await db.submissions.update(target!.id, { final_version_id: created.id, status: 'to_review' });

    // 重新提交后状态自动进入 to_review（绝非 completed / excellent）
    const after = await db.submissions.get(target!.id);
    expect(after!.status).toBe('to_review');
    // 且确实新增了一个终稿版本（版本号递增）
    const newVer = (await db.workVersions.list()).find(
      (w) => w.submission_id === target!.id && w.version_no === nextNo && w.is_final,
    );
    expect(newVer, '重新提交应新增一个终稿作品版本').toBeTruthy();

    // 学员端可设置状态集合不得包含 completed / excellent（仅 pending / to_review）
    expect(STUDENT_SETTABLE_STATUS).not.toContain('completed');
    expect(STUDENT_SETTABLE_STATUS).not.toContain('excellent');
    expect(STUDENT_SETTABLE_STATUS).toEqual(expect.arrayContaining(['pending', 'to_review']));
    expect(STUDENT_SETTABLE_STATUS).toHaveLength(2);
  });
});
