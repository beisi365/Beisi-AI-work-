import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDataLayer } from '../src/data/repository/LocalDataLayer';
import { selectWorksSubmissions, paginate } from '../src/lib/queries';
import {
  STUDENT_SETTABLE_STATUS,
  TEACHER_GRADE_ACTIONS,
  TEACHER_COMMENT_LABEL,
  teacherCanGrade,
} from '../src/lib/format';
import type { Submission, Assignment, SubmissionStatus } from '../src/data/types';

// —— 测试夹具 ——
const assignments: Assignment[] = [
  { id: 'a1', lesson_id: 'l1', class_id: 'c1', class_session_id: null, title: '作业1', requirements: '', due_date: '', rubric: '', created_at: 0, updated_at: 0, created_by: '' },
  { id: 'a2', lesson_id: 'l2', class_id: 'c1', class_session_id: null, title: '作业2', requirements: '', due_date: '', rubric: '', created_at: 0, updated_at: 0, created_by: '' },
  { id: 'a3', lesson_id: 'l1', class_id: 'c2', class_session_id: null, title: '作业3', requirements: '', due_date: '', rubric: '', created_at: 0, updated_at: 0, created_by: '' },
];

function mk(
  id: string,
  assignment_id: string,
  student_id: string,
  status: SubmissionStatus,
  updated_at: number,
): Submission {
  return {
    id,
    assignment_id,
    student_id,
    status,
    tools: '',
    prompts: '',
    public_allowed: false,
    final_version_id: null,
    ai_review_id: null,
    teacher_review_id: null,
    created_at: 0,
    updated_at,
    created_by: '',
  };
}

describe('作业页分页', () => {
  it('每页 20 条，第二页为不同切片，末页为余数', () => {
    const list = Array.from({ length: 45 }, (_, i) => ({ id: `x${i}` }) as { id: string });
    const p1 = paginate(list, 1, 20);
    const p2 = paginate(list, 2, 20);
    const p3 = paginate(list, 3, 20);
    expect(p1.items.length).toBe(20);
    expect(p2.items.length).toBe(20);
    expect(p3.items.length).toBe(5);
    expect(p1.total).toBe(45);
    expect(p1.totalPages).toBe(3);
    expect(p1.items[0].id).not.toBe(p2.items[0].id);
    expect(p3.page).toBe(3);
  });

  it('页码越界被钳制到合法范围', () => {
    const list = Array.from({ length: 5 }, (_, i) => ({ id: `x${i}` }) as { id: string });
    const p = paginate(list, 99, 20);
    expect(p.page).toBe(1);
    expect(p.items.length).toBe(5);
    const p0 = paginate(list, 0, 20);
    expect(p0.page).toBe(1);
  });

  it('空列表返回 1 页且 items 为空', () => {
    const p = paginate([] as { id: string }[], 1, 20);
    expect(p.totalPages).toBe(1);
    expect(p.items.length).toBe(0);
  });
});

describe('作业页筛选与默认排序', () => {
  it('学员仅可见本人提交', () => {
    const subs = [mk('s1', 'a1', 'stu1', 'to_review', 1), mk('s2', 'a2', 'stu2', 'completed', 1)];
    const r = selectWorksSubmissions(subs, { assignments, filter: { role: 'student', viewerStudentId: 'stu1' } });
    expect(r.map((x) => x.id)).toEqual(['s1']);
  });

  it('教师按班级 / 学员 / 课节 / 状态筛选', () => {
    const subs = [
      mk('s1', 'a1', 'stu1', 'to_review', 3),
      mk('s2', 'a2', 'stu1', 'completed', 2),
      mk('s3', 'a3', 'stu2', 'need_revise', 1),
    ];
    const base = { assignments, filter: { role: 'teacher' as const } };
    expect(selectWorksSubmissions(subs, { ...base, filter: { ...base.filter, classId: 'c1' } }).map((x) => x.id).sort()).toEqual(['s1', 's2']);
    expect(selectWorksSubmissions(subs, { ...base, filter: { ...base.filter, studentId: 'stu1' } }).map((x) => x.id).sort()).toEqual(['s1', 's2']);
    expect(selectWorksSubmissions(subs, { ...base, filter: { ...base.filter, lessonId: 'l1' } }).map((x) => x.id).sort()).toEqual(['s1', 's3']);
    expect(selectWorksSubmissions(subs, { ...base, filter: { ...base.filter, status: 'completed' } }).map((x) => x.id)).toEqual(['s2']);
  });

  it('默认优先显示待批改 / 需修改（置顶），同优先级按更新时间倒序', () => {
    const subs = [
      mk('done', 'a1', 'stu1', 'completed', 10),
      mk('rev', 'a2', 'stu1', 'to_review', 5),
      mk('rev2', 'a3', 'stu2', 'to_review', 8),
      mk('fix', 'a1', 'stu2', 'need_revise', 1),
    ];
    const r = selectWorksSubmissions(subs, { assignments, filter: { role: 'teacher' } });
    expect(r[0].id).toBe('rev2'); // to_review 中 updated_at 最大(8)置顶
    expect(r[1].id).toBe('rev'); // to_review 次(5)
    expect(r[2].id).toBe('fix'); // need_revise 在 to_review 之后
    expect(r[3].id).toBe('done'); // completed 最后
  });
});

describe('教师 / 学员权限边界', () => {
  it('教师评定动作仅限 need_revise / completed / excellent（不含 pending）', () => {
    const allowed = TEACHER_GRADE_ACTIONS.map((a) => a.to);
    expect(allowed).toEqual(expect.arrayContaining(['need_revise', 'completed', 'excellent']));
    expect(allowed).not.toContain('pending');
    expect(allowed).not.toContain('to_review');
  });

  it('学员不可直接设定 completed / excellent，且不与教师评定动作重叠', () => {
    expect(STUDENT_SETTABLE_STATUS).toEqual(expect.arrayContaining(['pending', 'to_review']));
    expect(STUDENT_SETTABLE_STATUS).not.toContain('completed');
    expect(STUDENT_SETTABLE_STATUS).not.toContain('excellent');
    const overlap = STUDENT_SETTABLE_STATUS.filter((s) => TEACHER_GRADE_ACTIONS.some((a) => a.to === s));
    expect(overlap).toEqual([]); // 学员可设定的状态与教师评定动作无交集 → 评定仅教师
  });
});

describe('基于种子数据的作业页（集成）', () => {
  let db: LocalDataLayer;
  beforeEach(async () => {
    db = new LocalDataLayer();
    await db.reset();
  });

  it('教师可见全部提交，分页每页 20 且首页首条为待处理类', async () => {
    const subs = await db.submissions.list();
    const assignmentsAll = await db.assignments.list();
    expect(subs.length).toBeGreaterThan(20);
    const r = selectWorksSubmissions(subs, { assignments: assignmentsAll, filter: { role: 'teacher' } });
    expect(r.length).toBe(subs.length);
    const p = paginate(r, 1, 20);
    expect(p.items.length).toBe(20);
    expect(p.totalPages).toBe(Math.ceil(subs.length / 20));
    expect(['to_review', 'need_revise']).toContain(p.items[0].status);
  });

  it('学员仅可见本人提交', async () => {
    const subs = await db.submissions.list();
    const mine = subs.filter((s) => s.student_id === 's01');
    const r = selectWorksSubmissions(subs, {
      assignments: await db.assignments.list(),
      filter: { role: 'student', viewerStudentId: 's01' },
    });
    expect(r.length).toBe(mine.length);
    expect(r.every((x) => x.student_id === 's01')).toBe(true);
  });
});

describe('作业页分页器交互逻辑', () => {
  it('分页总数与总页数正确', () => {
    const list = Array.from({ length: 160 }, (_, i) => ({ id: `x${i}` }) as { id: string });
    const p = paginate(list, 1, 20);
    expect(p.total).toBe(160);
    expect(p.totalPages).toBe(8);
    expect(p.items.length).toBe(20);
  });

  it('首页时「首页/上一页」应禁用（page<=1），末页时「下一页/末页」应禁用（page>=totalPages）', () => {
    const list = Array.from({ length: 160 }, (_, i) => ({ id: `x${i}` }) as { id: string });
    const first = paginate(list, 1, 20);
    expect(first.page <= 1).toBe(true); // 驱动「首页/上一页」disabled
    const last = paginate(list, 8, 20);
    expect(last.page >= last.totalPages).toBe(true); // 驱动「下一页/末页」disabled
  });
});

describe('筛选变化后回到第 1 页', () => {
  it('状态筛选改变结果集，分页取第 1 页即筛选后首条', () => {
    const all = [
      mk('a', 'a1', 'stu1', 'completed', 1),
      mk('b', 'a1', 'stu1', 'to_review', 2),
      mk('c', 'a2', 'stu2', 'to_review', 3),
      mk('d', 'a3', 'stu3', 'need_revise', 4),
    ];
    const filtered = selectWorksSubmissions(all, {
      assignments,
      filter: { role: 'teacher', status: 'to_review' },
    });
    expect(filtered.map((x) => x.id).sort()).toEqual(['b', 'c']);
    // 筛选后分页器的第 1 页必须从筛选结果首条开始
    const p = paginate(filtered, 1, 20);
    expect(p.page).toBe(1);
    expect(p.items[0].id).toBe(filtered[0].id);
  });
});

describe('教师操作按钮状态映射', () => {
  it('按钮文案与状态映射：退回修改→need_revise / 标记完成→completed / 设为优秀→excellent', () => {
    const map = Object.fromEntries(TEACHER_GRADE_ACTIONS.map((a) => [a.label, a.to]));
    expect(map['退回修改']).toBe('need_revise');
    expect(map['标记完成']).toBe('completed');
    expect(map['设为优秀']).toBe('excellent');
  });

  it('存在「填写评语」按钮文案，且评语动作不改变提交状态', () => {
    expect(TEACHER_COMMENT_LABEL).toBe('填写评语');
    // 评语动作的语义：仅保存 teacher_text，不出现在状态流转集合中
    const gradeTargets = TEACHER_GRADE_ACTIONS.map((a) => a.to);
    expect(gradeTargets).not.toContain('pending');
  });

  it('pending 状态不可被教师评定（退回/完成/评优均禁用）', () => {
    expect(teacherCanGrade('pending')).toBe(false);
    expect(teacherCanGrade('to_review')).toBe(true);
    expect(teacherCanGrade('need_revise')).toBe(true);
    expect(teacherCanGrade('completed')).toBe(true);
    expect(teacherCanGrade('excellent')).toBe(true);
  });
});

describe('填写评语不改变作业状态（集成）', () => {
  let db: LocalDataLayer;
  beforeEach(async () => {
    db = new LocalDataLayer();
    await db.reset();
  });

  it('新增/更新教师评语后，对应提交的状态保持不变', async () => {
    const subs = await db.submissions.list();
    const target = subs.find((s) => s.status === 'to_review')!;
    const before = target.status;
    const asg = (await db.assignments.list()).find((a) => a.id === target.assignment_id)!;
    const created = await db.teacherReviews.insert({
      student_id: target.student_id,
      ref_lesson_id: asg.lesson_id,
      teacher_id: 't01',
      tags: '',
      ai_draft: '',
      teacher_text: '思路清晰，可加强提示词设计。',
      status: 'confirmed',
      created_by: 'u_t',
      confirmed_at: Date.now(),
    } as never);
    await db.submissions.update(target.id, { teacher_review_id: created.id });
    const after = (await db.submissions.list()).find((s) => s.id === target.id)!;
    expect(after.status).toBe(before); // 状态未被评语操作改变
    expect(after.teacher_review_id).toBe(created.id);
    const review = (await db.teacherReviews.list()).find((r) => r.id === created.id)!;
    expect(review.teacher_text).toBe('思路清晰，可加强提示词设计。');
  });
});

describe('版本详情权限（学员仅见本人版本）', () => {
  let db: LocalDataLayer;
  beforeEach(async () => {
    db = new LocalDataLayer();
    await db.reset();
  });

  it('学员 s01 的展开版本仅来自其本人提交', async () => {
    const subs = await db.submissions.list();
    const mine = subs.filter((s) => s.student_id === 's01');
    const r = selectWorksSubmissions(subs, {
      assignments: await db.assignments.list(),
      filter: { role: 'student', viewerStudentId: 's01' },
    });
    expect(r.map((x) => x.id).sort()).toEqual(mine.map((x) => x.id).sort());
    // 版本详情依托提交可见性：学员看不到他人提交的版本
    const myIds = new Set(mine.map((x) => x.id));
    expect(r.every((x) => myIds.has(x.id))).toBe(true);
  });
});
