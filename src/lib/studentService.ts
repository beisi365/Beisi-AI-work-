// ============================================================
// P1 学员管理 · 业务服务层
// 固定 actorRole，所有写操作带真实 actorId；学员端编辑受字段白名单约束。
// 学员表本身不存储角色/登录态，角色判定以调用方传入的 ChangeActor 为准。
// ============================================================
import type { DataLayer } from '../data/repository/DataLayer';
import type { ChangeActor } from './submissionStatusGuards';
import type { Student, User, Enrollment } from '../data/types';

export class StudentPermissionError extends Error {}
export class StudentForbiddenError extends Error {}
export class StudentOwnershipError extends Error {}

/** 教师内部字段：绝不对学员返回，也绝不允许学员修改 */
export const STUDENT_INTERNAL_FIELDS = ['ai_baseline', 'teacher_tags', 'teacher_observation'] as const;

/** 学员本人可维护的字段白名单（不含内部字段、班级、归档状态、教师字段） */
export const STUDENT_SELF_EDITABLE: readonly (keyof Student)[] = [
  'nickname',
  'self_intro',
  'goal',
  'weekly_hours',
  'devices',
  'os',
  'office_software',
  'ai_tools_used',
  'can_self_service',
  'uses_paid_ai',
  'contact',
];

/** 系统维护字段：教师编辑也不可改（id/时间戳/归属/创建人） */
const STUDENT_SYSTEM_FIELDS: readonly (keyof Student)[] = [
  'id',
  'created_at',
  'updated_at',
  'created_by',
  'user_id',
];

/** 报名状态（复用 enrollment.status 开放字符串；不新增枚举字段） */
export const ENROLLMENT_STATUS = {
  ACTIVE: '在读',
  TRANSFERRED: '已转班',
} as const;

function pick<T extends object>(obj: Partial<T>, keys: readonly (keyof T)[]): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) {
    if (k in obj) (out as Record<string, unknown>)[k as string] = (obj as Record<string, unknown>)[k as string];
  }
  return out;
}

/** 计算下一个学员 id（基于现有 sNN 序号，避免与 seed 数据冲突） */
async function nextStudentId(db: DataLayer): Promise<string> {
  const ids = (await db.students.list())
    .map((s) => s.id)
    .filter((id) => /^s\d+$/.test(id))
    .map((id) => parseInt(id.slice(1), 10));
  const max = ids.length ? Math.max(...ids) : 0;
  return `s${String(max + 1).padStart(2, '0')}`;
}

/** 学员端可见视图：剥离教师内部字段，保留 learning_suggestion（学员只读） */
export function toStudentView(s: Student): Omit<Student, 'ai_baseline' | 'teacher_tags' | 'teacher_observation'> {
  const { ai_baseline, teacher_tags, teacher_observation, ...rest } = s;
  return rest;
}

export interface CreateStudentInput {
  /** 登录身份名（User.name） */
  loginName: string;
  /** 登录账号，需唯一 */
  account: string;
  /** 展示名（Student.nickname），页面唯一权威姓名来源 */
  nickname: string;
  /** 目标班级 id */
  classId: string;
  age_range?: string;
  occupation?: string;
  contact?: string;
  enroll_date?: string;
  goal?: string;
  weekly_hours?: number;
  devices?: string;
  os?: string;
  office_software?: string;
  ai_tools_used?: string;
  can_self_service?: boolean;
  uses_paid_ai?: boolean;
  self_intro?: string;
}

/**
 * 新增学员：在同一事务内原子写入 users + students + enrollments，
 * 并显式写入一条真实操作人日志。任一环节失败整体回滚，杜绝“半成品”数据。
 */
export async function createStudent(
  db: DataLayer,
  actor: ChangeActor,
  input: CreateStudentInput,
): Promise<{ student: Student; user: User; enrollment: Enrollment }> {
  if (actor.actorRole !== 'teacher') {
    throw new StudentForbiddenError('仅教师可新增学员');
  }
  if (!input.nickname || !input.account || !input.loginName) {
    throw new StudentPermissionError('缺少必要字段：nickname / account / loginName');
  }
  const cls = await db.classes.get(input.classId);
  if (!cls) throw new StudentPermissionError('目标班级不存在');
  const dup = await db.users.list({ where: { account: input.account } } as never);
  if (dup.length) throw new StudentPermissionError('登录账号已存在');

  const sid = await nextStudentId(db);
  const today = input.enroll_date ?? new Date().toISOString().slice(0, 10);

  return db.transaction(async (tx) => {
    const user = await tx.users.insert({
      role: 'student',
      name: input.loginName,
      account: input.account,
      avatar: input.nickname.slice(0, 1) || '学',
    } as never);
    const student = await tx.students.insert({
      user_id: user.id,
      id: sid,
      nickname: input.nickname,
      age_range: input.age_range ?? '',
      occupation: input.occupation ?? '',
      contact: input.contact ?? '',
      enroll_date: today,
      goal: input.goal ?? '',
      weekly_hours: input.weekly_hours ?? 0,
      devices: input.devices ?? '',
      os: input.os ?? '',
      office_software: input.office_software ?? '',
      ai_tools_used: input.ai_tools_used ?? '',
      can_self_service: input.can_self_service ?? false,
      uses_paid_ai: input.uses_paid_ai ?? false,
      notes: '',
      self_intro: input.self_intro ?? '',
      ai_baseline: null,
      teacher_tags: [],
      teacher_observation: null,
      learning_suggestion: null,
      archived_at: null,
      created_by: actor.actorId,
    } as never);
    const enrollment = await tx.enrollments.insert({
      student_id: sid,
      class_id: input.classId,
      enroll_date: today,
      status: ENROLLMENT_STATUS.ACTIVE,
    } as never);
    await tx.appendLog(actor.actorId, 'create_student', `students:${sid}`, {
      nickname: input.nickname,
      class_id: input.classId,
      user_id: user.id,
    });
    return { student, user, enrollment };
  });
}

/** 教师编辑学员业务档案（含内部字段），系统字段除外 */
export async function editStudentAsTeacher(
  db: DataLayer,
  studentId: string,
  actor: ChangeActor,
  patch: Partial<Student>,
): Promise<Student> {
  if (actor.actorRole !== 'teacher') {
    throw new StudentForbiddenError('仅教师可编辑学员档案');
  }
  const current = await db.students.get(studentId);
  if (!current) throw new StudentPermissionError('学员不存在');
  const clean = pick(patch, (Object.keys(patch) as (keyof Student)[]).filter(
    (k) => !STUDENT_SYSTEM_FIELDS.includes(k),
  ));
  if (!Object.keys(clean).length) return current;
  const updated = await db.students.update(studentId, clean as Partial<Student>, actor);
  await db.appendLog(actor.actorId, 'edit_student', `students:${studentId}`, clean);
  return updated;
}

/** 学员编辑本人资料：仅允许白名单字段，内部/归档/班级字段被静默忽略 */
export async function editStudentAsSelf(
  db: DataLayer,
  studentId: string,
  actor: ChangeActor,
  patch: Partial<Student>,
): Promise<Student> {
  if (actor.actorRole !== 'student') {
    throw new StudentForbiddenError('仅学员本人可编辑本人资料');
  }
  if (actor.actorId !== studentId) {
    throw new StudentOwnershipError('只能修改本人资料');
  }
  const current = await db.students.get(studentId);
  if (!current) throw new StudentPermissionError('学员不存在');
  const clean = pick(patch, STUDENT_SELF_EDITABLE);
  if (!Object.keys(clean).length) return current;
  const updated = await db.students.update(studentId, clean as Partial<Student>, actor);
  await db.appendLog(actor.actorId, 'edit_student_self', `students:${studentId}`, clean);
  return updated;
}

/**
 * 调班：结束旧在读报名（置“已转班”），新增目标班级在读报名；
 * 旧报名及其历史出勤/作业/作品/能力记录全部保留。整体事务，任一步失败回滚。
 */
export async function transferClass(
  db: DataLayer,
  actor: ChangeActor,
  studentId: string,
  targetClassId: string,
): Promise<Enrollment> {
  if (actor.actorRole !== 'teacher') {
    throw new StudentForbiddenError('仅教师可调班');
  }
  const target = await db.classes.get(targetClassId);
  if (!target) throw new StudentPermissionError('目标班级不存在');
  const student = await db.students.get(studentId);
  if (!student) throw new StudentPermissionError('学员不存在');

  const active = (await db.enrollments.list()).find(
    (e) => e.student_id === studentId && e.status === ENROLLMENT_STATUS.ACTIVE,
  );
  if (!active) throw new StudentPermissionError('该学员无在读报名，无法调班');

  return db.transaction(async (tx) => {
    await tx.enrollments.update(
      active.id,
      { status: ENROLLMENT_STATUS.TRANSFERRED, updated_at: Date.now() } as Partial<Enrollment>,
      actor,
    );
    const neu = await tx.enrollments.insert({
      student_id: studentId,
      class_id: targetClassId,
      enroll_date: new Date().toISOString().slice(0, 10),
      status: ENROLLMENT_STATUS.ACTIVE,
    } as never);
    await tx.appendLog(actor.actorId, 'transfer_class', `students:${studentId}`, {
      from_class: active.class_id,
      to_class: targetClassId,
      at: Date.now(),
    });
    return neu;
  });
}

/** 归档：置 archived_at，默认名单过滤后消失；历史数据全部保留 */
export async function archiveStudent(
  db: DataLayer,
  studentId: string,
  actor: ChangeActor,
): Promise<Student> {
  if (actor.actorRole !== 'teacher') {
    throw new StudentForbiddenError('仅教师可归档学员');
  }
  const current = await db.students.get(studentId);
  if (!current) throw new StudentPermissionError('学员不存在');
  const updated = await db.students.update(
    studentId,
    { archived_at: new Date().toISOString() } as Partial<Student>,
    actor,
  );
  await db.appendLog(actor.actorId, 'archive_student', `students:${studentId}`, {
    archived_at: updated.archived_at,
  });
  return updated;
}

/** 恢复：清空 archived_at，重新出现在默认名单 */
export async function restoreStudent(
  db: DataLayer,
  studentId: string,
  actor: ChangeActor,
): Promise<Student> {
  if (actor.actorRole !== 'teacher') {
    throw new StudentForbiddenError('仅教师可恢复学员');
  }
  const current = await db.students.get(studentId);
  if (!current) throw new StudentPermissionError('学员不存在');
  const updated = await db.students.update(
    studentId,
    { archived_at: null } as Partial<Student>,
    actor,
  );
  await db.appendLog(actor.actorId, 'restore_student', `students:${studentId}`, { at: Date.now() });
  return updated;
}
