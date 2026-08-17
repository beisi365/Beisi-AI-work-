import { describe, it, expect, beforeEach } from 'vitest';
import { LocalDataLayer } from '../src/data/repository/LocalDataLayer';
import type { ChangeActor } from '../src/lib/submissionStatusGuards';
import {
  createStudent,
  editStudentAsSelf,
  editStudentAsTeacher,
  transferClass,
  archiveStudent,
  restoreStudent,
  toStudentView,
  StudentForbiddenError,
  StudentOwnershipError,
  StudentFieldForbiddenError,
} from '../src/lib/studentService';
import { canWrite } from '../src/data/repository/permissions';
import { getStudentsWithClass } from '../src/lib/queries';

const db = new LocalDataLayer();
const teacher: ChangeActor = { actorId: 't1', actorRole: 'teacher' };
const studentActor: ChangeActor = { actorId: 's01', actorRole: 'student' };

beforeEach(async () => {
  await db.reset();
});

describe('旧数据兼容（20 名 seed 学员缺新字段不报错）', () => {
  it('读取 seed 学员补全六字段默认值', async () => {
    const s = (await db.students.get('s01'))!;
    expect(s.teacher_tags).toEqual([]);
    expect(s.ai_baseline).toBeNull();
    expect(s.archived_at).toBeNull();
    expect(s.self_intro).toBe('');
    expect(s.learning_suggestion).toBeNull();
    expect(s.teacher_observation).toBeNull();
  });
});

describe('新增学员原子性', () => {
  it('教师新增学员：users+students+enrollment 三表同写入，记录真实操作人', async () => {
    const bS = (await db.students.list()).length;
    const bU = (await db.users.list()).length;
    const bE = (await db.enrollments.list()).length;
    const res = await createStudent(db, teacher, {
      loginName: '学员21',
      account: 'stu_s21',
      nickname: '学员21',
      classId: 'cl1',
      self_intro: '大家好',
    });
    expect((await db.students.list()).length).toBe(bS + 1);
    expect((await db.users.list()).length).toBe(bU + 1);
    expect((await db.enrollments.list()).length).toBe(bE + 1);
    expect(res.student.created_by).toBe('t1');
    expect(res.student.self_intro).toBe('大家好');
    expect(res.enrollment.status).toBe('在读');
    const logs = await db.getOperationLogs();
    expect(logs.some((l) => l.action === 'create_student' && l.user_id === 't1')).toBe(true);
  });

  it('学员不可新增学员', async () => {
    await expect(
      createStudent(db, studentActor, {
        loginName: 'x',
        account: 'x',
        nickname: 'x',
        classId: 'cl1',
      }),
    ).rejects.toThrow(StudentForbiddenError);
  });

  it('账号重复时拒绝且不产生半成品数据', async () => {
    const bS = (await db.students.list()).length;
    const bU = (await db.users.list()).length;
    await expect(
      createStudent(db, teacher, {
        loginName: '学员21',
        account: 'stu_s01', // 已存在
        nickname: '学员21',
        classId: 'cl1',
      }),
    ).rejects.toThrow(/已存在/);
    expect((await db.students.list()).length).toBe(bS);
    expect((await db.users.list()).length).toBe(bU);
  });

  it('目标班级不存在时拒绝且无写入', async () => {
    const bS = (await db.students.list()).length;
    await expect(
      createStudent(db, teacher, {
        loginName: '学员21',
        account: 'stu_s21',
        nickname: '学员21',
        classId: 'clX',
      }),
    ).rejects.toThrow(/班级不存在/);
    expect((await db.students.list()).length).toBe(bS);
  });

  it('事务失败整体回滚（DataLayer 原子性契约）', async () => {
    const before = (await db.students.list()).length;
    await expect(
      db.transaction(async (tx) => {
        await tx.students.insert({ user_id: null, nickname: '临时' } as never);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect((await db.students.list()).length).toBe(before);
  });
});

describe('学员编辑本人资料（字段白名单）', () => {
  it('学员可改 nickname/self_intro，真实 actor 入日志', async () => {
    const updated = await editStudentAsSelf(db, 's01', studentActor, {
      nickname: '新昵称',
      self_intro: '我的介绍',
    });
    expect(updated.nickname).toBe('新昵称');
    expect(updated.self_intro).toBe('我的介绍');
    expect((await db.students.get('s01'))!.nickname).toBe('新昵称');
    const logs = await db.getOperationLogs();
    expect(logs.some((l) => l.action === 'edit_student_self' && l.user_id === 's01')).toBe(true);
  });

  it('学员混入内部字段：整次失败且已写字段回滚', async () => {
    const before = (await db.students.get('s01'))!;
    await expect(
      editStudentAsSelf(db, 's01', studentActor, {
        nickname: '新昵称',
        teacher_observation: 'hack',
        ai_baseline: 'hack',
      } as never),
    ).rejects.toThrow(StudentFieldForbiddenError);
    const after = (await db.students.get('s01'))!;
    expect(after.nickname).toBe(before.nickname); // 整次未保存
    expect(after.teacher_observation).toBe(before.teacher_observation);
    expect(after.ai_baseline).toBe(before.ai_baseline);
  });

  it('学员改他人资料被拒', async () => {
    await expect(
      editStudentAsSelf(db, 's02', studentActor, { nickname: 'x' }),
    ).rejects.toThrow(StudentOwnershipError);
  });

  it('教师编辑内部字段可落库', async () => {
    await editStudentAsTeacher(db, 's01', teacher, {
      teacher_observation: '内部观察',
      ai_baseline: '基线',
      teacher_tags: ['积极'],
    } as never);
    const s = (await db.students.get('s01'))!;
    expect(s.teacher_observation).toBe('内部观察');
    expect(s.ai_baseline).toBe('基线');
    expect(s.teacher_tags).toEqual(['积极']);
  });
});

describe('调班（结束旧报名+新增报名，保留历史）', () => {
  it('调班后旧报名转“已转班”，新报名在读，默认班级正确', async () => {
    const r = await transferClass(db, teacher, 's01', 'cl2');
    expect(r.status).toBe('在读');
    expect(r.class_id).toBe('cl2');
    const s01ens = (await db.enrollments.list()).filter((e) => e.student_id === 's01');
    expect(s01ens.length).toBe(2);
    expect(s01ens.find((e) => e.class_id === 'cl1')!.status).toBe('已转班');
    expect(s01ens.find((e) => e.class_id === 'cl2')!.status).toBe('在读');
    const row = (await getStudentsWithClass(db)).find((x) => x.student?.id === 's01');
    expect(row!.classRow!.id).toBe('cl2');
    const logs = await db.getOperationLogs();
    expect(logs.some((l) => l.action === 'transfer_class' && l.user_id === 't1')).toBe(true);
  });

  it('目标班级不存在时拒绝，报名不变', async () => {
    await expect(transferClass(db, teacher, 's01', 'clX')).rejects.toThrow(/班级不存在/);
    const s01ens = (await db.enrollments.list()).filter((e) => e.student_id === 's01');
    expect(s01ens.length).toBe(1);
  });
});

describe('归档与恢复', () => {
  it('归档后默认名单消失，恢复后重现，历史保留', async () => {
    const a = await archiveStudent(db, 's01', teacher);
    expect(a.archived_at).not.toBeNull();
    expect((await getStudentsWithClass(db)).find((x) => x.student?.id === 's01')).toBeUndefined();
    const archived = await getStudentsWithClass(db, { includeArchived: true });
    expect(archived.find((x) => x.student?.id === 's01')).toBeDefined();
    // 历史出勤仍在
    const att = await db.attendance.list({ where: { student_id: 's01' } } as never);
    expect(att.length).toBeGreaterThan(0);
    await restoreStudent(db, 's01', teacher);
    expect((await getStudentsWithClass(db)).find((x) => x.student?.id === 's01')).toBeDefined();
    const logs = await db.getOperationLogs();
    expect(logs.some((l) => l.action === 'archive_student' && l.user_id === 't1')).toBe(true);
  });

  it('学员不可归档', async () => {
    await expect(archiveStudent(db, 's01', studentActor)).rejects.toThrow(StudentForbiddenError);
  });
});

describe('学员端视图投影', () => {
  it('toStudentView 剥离三个内部字段，保留 learning_suggestion', async () => {
    const s = (await db.students.get('s01'))!;
    const v = toStudentView(s);
    expect('ai_baseline' in v).toBe(false);
    expect('teacher_tags' in v).toBe(false);
    expect('teacher_observation' in v).toBe(false);
    expect('learning_suggestion' in v).toBe(true);
  });
});

describe('permissions.canWrite 学员行', () => {
  const teacherP = { userId: 'u_t1', role: 'teacher', teacherId: 't1' } as never;
  const selfP = { userId: 'u_s01', role: 'student', studentId: 's01' } as never;
  const otherP = { userId: 'u_s02', role: 'student', studentId: 's02' } as never;
  it('教师可写任何学员行', () => {
    expect(canWrite(teacherP, 'students', { id: 's01' } as never, {} as never)).toBe(true);
  });
  it('学员可写本人行', () => {
    expect(canWrite(selfP, 'students', { id: 's01' } as never, {} as never)).toBe(true);
  });
  it('学员不可写他人行', () => {
    expect(canWrite(otherP, 'students', { id: 's01' } as never, {} as never)).toBe(false);
  });
});
