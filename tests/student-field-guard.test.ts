import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDataLayer } from '../src/data/repository/LocalDataLayer';
import type { ChangeActor } from '../src/lib/submissionStatusGuards';
import { ForbiddenError } from '../src/lib/submissionStatusGuards';
import {
  createStudent,
  editStudentAsSelf,
  transferClass,
  archiveStudent,
  restoreStudent,
  toStudentView,
  StudentFieldForbiddenError,
  StudentForbiddenError,
} from '../src/lib/studentService';
import { getStudentsWithClass } from '../src/lib/queries';

const db = new LocalDataLayer();
const teacher: ChangeActor = { actorId: 't1', actorRole: 'teacher' };
const studentActor: ChangeActor = { actorId: 's01', actorRole: 'student' };

beforeEach(async () => {
  await db.reset();
});

describe('一、Repository 层 Student 字段守卫（学员直接更新）', () => {
  it('1 学员直接 Repository 更新 teacher_tags 被拒', async () => {
    await expect(
      db.students.update('s01', { teacher_tags: ['伪造'] } as never, studentActor),
    ).rejects.toThrow(StudentFieldForbiddenError);
    const s = (await db.students.get('s01'))!;
    expect(s.teacher_tags).toEqual([]);
  });

  it('2 学员直接 Repository 更新 archived_at 被拒', async () => {
    await expect(
      db.students.update('s01', { archived_at: new Date().toISOString() } as never, studentActor),
    ).rejects.toThrow(StudentFieldForbiddenError);
    const s = (await db.students.get('s01'))!;
    expect(s.archived_at).toBeNull();
  });

  it('3 学员编辑他人资料被拒', async () => {
    await expect(
      db.students.update('s02', { nickname: 'x' } as never, studentActor),
    ).rejects.toThrow(StudentFieldForbiddenError);
    const s = (await db.students.get('s02'))!;
    expect(s.nickname).not.toBe('x');
  });

  it('4 合法本人资料修改成功', async () => {
    const u = await db.students.update(
      's01',
      { nickname: '阿芬', self_intro: '你好', age_range: '25-35', occupation: '行政' } as never,
      studentActor,
    );
    expect(u.nickname).toBe('阿芬');
    expect(u.self_intro).toBe('你好');
    expect(u.age_range).toBe('25-35');
    const s = (await db.students.get('s01'))!;
    expect(s.nickname).toBe('阿芬');
  });

  it('5 同一请求混入非法字段时整体回滚', async () => {
    const before = (await db.students.get('s01'))!;
    await expect(
      editStudentAsSelf(db, 's01', studentActor, {
        self_intro: '正常内容',
        teacher_tags: ['伪造标签'],
      } as never),
    ).rejects.toThrow(StudentFieldForbiddenError);
    const after = (await db.students.get('s01'))!;
    // 整次失败：连合法字段 self_intro 也未被保存
    expect(after.self_intro).toBe(before.self_intro);
    expect(after.teacher_tags).toEqual(before.teacher_tags);
  });
});

describe('二、视图脱敏', () => {
  it('6 学员视图序列化后不存在三个内部字段名', async () => {
    const s = (await db.students.get('s01'))!;
    const v = JSON.parse(JSON.stringify(toStudentView(s)));
    expect('ai_baseline' in v).toBe(false);
    expect('teacher_tags' in v).toBe(false);
    expect('teacher_observation' in v).toBe(false);
    expect('learning_suggestion' in v).toBe(true);
  });
});

describe('三、归档语义与守卫', () => {
  it('7 归档学员自我编辑被拒', async () => {
    await archiveStudent(db, 's01', teacher);
    await expect(
      editStudentAsSelf(db, 's01', studentActor, { nickname: '改不了' }),
    ).rejects.toThrow(StudentForbiddenError);
    const s = (await db.students.get('s01'))!;
    expect(s.nickname).not.toBe('改不了');
  });

  it('8 归档学员新增作品版本被拒', async () => {
    await archiveStudent(db, 's01', teacher);
    await expect(
      db.workVersions.insert(
        {
          submission_id: 'sub_x',
          student_id: 's01',
          version_no: 1,
          content: '作品',
          is_final: true,
        } as never,
        studentActor,
      ),
    ).rejects.toThrow(ForbiddenError);
  });

  it('9 教师可查看归档学员历史', async () => {
    await archiveStudent(db, 's01', teacher);
    const archived = await getStudentsWithClass(db, { includeArchived: true });
    const row = archived.find((x) => x.student?.id === 's01');
    expect(row).toBeDefined();
    const att = await db.attendance.list({ where: { student_id: 's01' } } as never);
    expect(att.length).toBeGreaterThan(0);
  });
});

describe('四、报名状态统一与历史保留', () => {
  it('10 调班后只有一条 active 报名', async () => {
    await transferClass(db, teacher, 's01', 'cl2');
    const active = (await db.enrollments.list()).filter(
      (e) => e.student_id === 's01' && e.status === '在读',
    );
    expect(active.length).toBe(1);
  });

  it('11 旧报名与历史记录仍存在', async () => {
    await transferClass(db, teacher, 's01', 'cl2');
    const ens = (await db.enrollments.list()).filter((e) => e.student_id === 's01');
    expect(ens.length).toBe(2);
    expect(ens.find((e) => e.class_id === 'cl1')!.status).toBe('已转班');
    expect(ens.find((e) => e.class_id === 'cl2')!.status).toBe('在读');
    const att = await db.attendance.list({ where: { student_id: 's01' } } as never);
    expect(att.length).toBeGreaterThan(0);
  });
});

describe('五、归档/恢复操作日志为真实教师 ID', () => {
  it('12 归档/恢复日志为真实教师 ID', async () => {
    await archiveStudent(db, 's01', teacher);
    await restoreStudent(db, 's01', teacher);
    const logs = await db.getOperationLogs();
    const arch = logs.find((l) => l.action === 'archive_student' && l.target === 'students:s01');
    const rest = logs.find((l) => l.action === 'restore_student' && l.target === 'students:s01');
    expect(arch?.user_id).toBe('t1');
    expect(rest?.user_id).toBe('t1');
  });
});

describe('六、新增学员报名使用集中常量', () => {
  it('新增学员报名状态为“在读”常量值', async () => {
    const res = await createStudent(db, teacher, {
      loginName: '学员201',
      account: 'stu_s201',
      nickname: '学员201',
      classId: 'cl1',
    });
    expect(res.enrollment.status).toBe('在读');
  });
});
