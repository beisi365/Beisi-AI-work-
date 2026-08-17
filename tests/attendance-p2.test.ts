import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/data/repository';
import { getTeacherOverview, attendanceSummary } from '../src/lib/queries';
import type { Attendance, AttendanceStatus } from '../src/data/types';

// P2.2「课程与出勤教学闭环」纯逻辑测试。
// 覆盖：登记增记录、修改改状态+备注、总览 attendanceToRegister 随登记减少、
// 连续缺席学员随缺勤计算、attendanceSummary 累加。
// 组件级渲染（登记弹窗/历史弹窗）由 accept-p2-2.mjs 浏览器验收覆盖（node 环境无 DOM）。
// 所有写操作经同一 LocalDataLayer，与页面共用数据链；不重构 DataLayer。

describe('P2.2 出勤：登记与修改', () => {
  beforeEach(async () => {
    await db.reset();
  });

  it('清空某已上场次考勤后登记全员 → 记录数=班级报名数，且总览 attendanceToRegister 不再含该场次', async () => {
    const classes = await db.classes.list();
    const cl1 = classes.find((c) => c.id === 'cl1')!;
    const sessions = await db.classSessions.list();
    const s = sessions.find((x) => x.class_id === cl1.id && x.status === 'done')!;

    // 模拟"尚未登记"：清空该场次已有考勤
    const existing = (await db.attendance.list()).filter((a) => a.class_session_id === s.id);
    for (const a of existing) await db.attendance.remove(a.id);

    // 与总览一致的口径：班级全部报名（不限状态）
    const classEnrollments = (await db.enrollments.list()).filter((e) => e.class_id === cl1.id);
    const enrolledIds = classEnrollments.map((e) => e.student_id);

    const before = await getTeacherOverview(db);
    const beforeItem = before.attendanceToRegister.find((x) => x.session.id === s.id);
    expect(beforeItem).toBeDefined();
    expect(beforeItem!.missing).toBe(classEnrollments.length);
    expect(beforeItem!.missing).toBeGreaterThan(0);

    // 登记（全员 present，复用 AttendanceStatus 枚举）
    for (const sid of enrolledIds) {
      await db.attendance.insert({
        class_session_id: s.id,
        student_id: sid,
        status: 'present' as AttendanceStatus,
        time: s.scheduled_start,
        note: '',
        created_by: 'u_t1',
      });
    }

    const afterAtt = (await db.attendance.list()).filter((a) => a.class_session_id === s.id);
    expect(afterAtt.length).toBe(classEnrollments.length);
    expect(afterAtt.every((a) => enrolledIds.includes(a.student_id))).toBe(true);

    const after = await getTeacherOverview(db);
    expect(after.attendanceToRegister.find((x) => x.session.id === s.id)).toBeUndefined();
  });

  it('修改考勤：更新状态与备注，记录数保持不变', async () => {
    const sessions = await db.classSessions.list();
    const s = sessions.find((x) => x.status === 'done')!;
    const atts = (await db.attendance.list()).filter((a) => a.class_session_id === s.id);
    expect(atts.length).toBeGreaterThan(0);

    const target = atts[0];
    await db.attendance.update(target.id, { status: 'absent' as AttendanceStatus, note: '感冒请假' });

    const updated = await db.attendance.get(target.id);
    expect(updated!.status).toBe('absent');
    expect(updated!.note).toBe('感冒请假');

    const after = (await db.attendance.list()).filter((a) => a.class_session_id === s.id);
    expect(after.length).toBe(atts.length); // 数量不变，仅状态/备注变更
  });
});

describe('P2.2 出勤：总览联动与累计', () => {
  beforeEach(async () => {
    await db.reset();
  });

  it('连续缺席：将某学员在两个连续已上场次置为 absent 后，进入 consecutiveAbsent 且 count>=2', async () => {
    const sessions = (await db.classSessions.list())
      .filter((x) => x.status === 'done')
      .sort((a, b) => a.scheduled_start - b.scheduled_start);
    const enrollments = await db.enrollments.list();
    const students = await db.students.list();
    const e0 = enrollments[0];
    const stu = students.find((st) => st.id === e0.student_id)!;

    // 清空该学员全部历史考勤，避免既有 absent 干扰
    for (const a of (await db.attendance.list()).filter((a) => a.student_id === stu.id)) {
      await db.attendance.remove(a.id);
    }

    const classSessions = sessions.filter((x) => x.class_id === e0.class_id).slice(0, 2);
    for (const cs of classSessions) {
      await db.attendance.insert({
        class_session_id: cs.id,
        student_id: stu.id,
        status: 'absent' as AttendanceStatus,
        time: cs.scheduled_start,
        note: '',
        created_by: 'u_t1',
      });
    }

    const ov = await getTeacherOverview(db);
    const hit = ov.consecutiveAbsent.find((x) => x.student.id === stu.id);
    expect(hit).toBeDefined();
    expect(hit!.count).toBeGreaterThanOrEqual(2);
  });

  it('attendanceSummary 正确累加各状态计数（出勤历史累计复用）', () => {
    const fake: Attendance[] = (
      ['present', 'present', 'absent', 'late', 'leave'] as AttendanceStatus[]
    ).map((status) => ({ status }) as Attendance);
    const summary = attendanceSummary(fake);
    expect(summary.present).toBe(2);
    expect(summary.absent).toBe(1);
    expect(summary.late).toBe(1);
    expect(summary.leave).toBe(1);
  });
});
