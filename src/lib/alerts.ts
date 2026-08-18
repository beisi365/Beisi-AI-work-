// ============================================================
// P2.4 预警与待办（教师主导模式 · 最小闭环）
//
// 设计约束（已与用户确认）：
// - 零新表、零新增字段；仅复用现有 concerns / todos 及其 Repository。
// - 不修改 P1/P2.1/P2.2/P2.3 既有业务逻辑（getTeacherOverview 等不动）。
// - 四类预警（A 连续缺席 / B 长期未提交 / C 能力偏弱 / D 持续学习困难）
//   计算规则等价复用 getTeacherOverview 已实现的确定性算法，独立写成纯函数，
//   不改变既有总览口径。
// - 预警扫描幂等：同一 (student_id, type) 已存在「未解决」concern 时跳过，
//   已 resolved 的不阻止再次生成。
// - 「预警 → 待办」采用方案乙：仅教师手动转换，系统生成 concern 时绝不自动建 todo。
// - 处理/解决备注写入 concerns.result（该字段已存在于类型定义，非新增）。
// ============================================================
import type { DataLayer } from '../data/repository/DataLayer';
import type {
  Concern,
  Todo,
  Student,
  Attendance,
  Submission,
  Assignment,
  ClassSession,
  AbilityAssessment,
  LearningRecord,
  AbilityLevel,
} from '../data/types';

/** 四类预警对应的 concern.type 文案（与既有 seed 的 '出勤/欠交' 区分，互不冲突） */
export const ALERT_TYPE = {
  consecutiveAbsent: '连续缺席',
  longNoSubmission: '长期未提交',
  weakAbility: '能力偏弱',
  persistentDifficulty: '持续学习困难',
} as const;

export type AlertType = (typeof ALERT_TYPE)[keyof typeof ALERT_TYPE];

/** 预警/待办写入的操作者（教师手动触发扫描与转换） */
export interface AlertActor {
  actorId: string;
  actorRole: 'teacher' | 'system';
}

const WEAK_LEVEL: AbilityLevel = 'L1';

// ============================================================
// 一、四类预警的纯计算函数（确定性、最小、可解释）
// 等价于 getTeacherOverview 内联算法，仅做独立抽取，不改动既有业务。
// ============================================================

/**
 * A. 连续缺席：按场次日期排序求最长连续 absent 段，≥2 触发。
 * 等价于 queries.ts getTeacherOverview 的 consecutiveAbsent 计算。
 */
export function computeConsecutiveAbsent(
  attendance: Attendance[],
  sessions: ClassSession[],
  students: Student[],
): { student: Student; count: number }[] {
  const sessionDate = new Map(sessions.map((s) => [s.id, s.scheduled_start]));
  const out: { student: Student; count: number }[] = [];
  for (const stu of students) {
    const atts = attendance
      .filter((a) => a.student_id === stu.id && sessionDate.has(a.class_session_id))
      .map((a) => ({ t: sessionDate.get(a.class_session_id)!, status: a.status }))
      .sort((a, b) => a.t - b.t);
    let maxRun = 0;
    let run = 0;
    for (const a of atts) {
      if (a.status === 'absent') {
        run += 1;
        maxRun = Math.max(maxRun, run);
      } else {
        run = 0;
      }
    }
    if (maxRun >= 2) out.push({ student: stu, count: maxRun });
  }
  return out;
}

/**
 * B. 长期未提交：存在「已上场次作业」仍为 pending 的学员。
 * 等价于 queries.ts getTeacherOverview 的 longNoSubmission 计算。
 */
export function computeLongNoSubmission(
  submissions: Submission[],
  assignments: Assignment[],
  sessions: ClassSession[],
  students: Student[],
): { student: Student; pendingCount: number }[] {
  const doneSessionIds = new Set(sessions.filter((s) => s.status === 'done').map((s) => s.id));
  const asgSession = new Map(assignments.map((a) => [a.id, a.class_session_id]));
  const studentById = new Map(students.map((s) => [s.id, s]));
  const map = new Map<string, number>();
  for (const sub of submissions) {
    if (sub.status !== 'pending') continue;
    const sessId = asgSession.get(sub.assignment_id);
    if (sessId && doneSessionIds.has(sessId)) {
      map.set(sub.student_id, (map.get(sub.student_id) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([sid, pendingCount]) => ({ student: studentById.get(sid)!, pendingCount }))
    .filter((x) => x.student)
    .sort((a, b) => b.pendingCount - a.pendingCount);
}

/**
 * C. 能力偏弱：任一已发布评估维度 level === 'L1' 即视为偏弱（确定性、可解释）。
 * 「停滞」需同一维度 ≥2 条评估均 ≤L1 且无进步才触发；种子数据中 behind 学员每维度
 * 仅 1 条（L1），故停滞在演示数据下为 0，不产生假阳性。规则保持最小，不做趋势算法。
 */
export function computeWeakAbility(
  ability: AbilityAssessment[],
): { student_id: string; dimensions: string[] }[] {
  const byStudent = new Map<string, AbilityAssessment[]>();
  for (const a of ability) {
    if (a.status !== 'published') continue;
    if (!byStudent.has(a.student_id)) byStudent.set(a.student_id, []);
    byStudent.get(a.student_id)!.push(a);
  }
  const out: { student_id: string; dimensions: string[] }[] = [];
  for (const [sid, list] of byStudent) {
    const weakDims = list.filter((a) => a.level === WEAK_LEVEL).map((a) => a.dimension);
    if (weakDims.length > 0) out.push({ student_id: sid, dimensions: weakDims });
  }
  return out;
}

/**
 * D. 持续学习困难：仅复用 learning_records，学员 need_help === true 的课堂记录 ≥2 条，
 * 视为存在真实、可解释的重复困难信号。不满足则不生成（数据不足不造规则/数据）。
 */
export function computePersistentDifficulty(
  learningRecords: LearningRecord[],
): { student_id: string; count: number; problem: string }[] {
  const byStudent = new Map<string, LearningRecord[]>();
  for (const lr of learningRecords) {
    if (!lr.need_help) continue;
    if (!byStudent.has(lr.student_id)) byStudent.set(lr.student_id, []);
    byStudent.get(lr.student_id)!.push(lr);
  }
  const out: { student_id: string; count: number; problem: string }[] = [];
  for (const [sid, list] of byStudent) {
    if (list.length >= 2) {
      const problem = list[0].problems && list[0].problems !== '无' ? list[0].problems : '课堂反馈需帮助';
      out.push({ student_id: sid, count: list.length, problem });
    }
  }
  return out;
}

// ============================================================
// 二、扫描写入（幂等）+ 教师手动转待办
// ============================================================

/** 是否存在同一 (student_id, type) 的「未解决」concern（幂等去重判定） */
async function hasOpenConcern(db: DataLayer, studentId: string, type: string): Promise<boolean> {
  const existing = await db.concerns.list({ where: { student_id: studentId, type } } as never);
  return existing.some((c) => c.status !== 'resolved');
}

/**
 * 执行一次预警扫描：依据四类规则生成 concern，带 (student_id, type, 未解决) 去重。
 * 返回本次新生成的 concern 数量（已存在未解决则跳过，故重复扫描返回 0）。
 * 注意：本函数只写 concerns，绝不写 todos（方案乙：转待办由教师手动触发）。
 */
export async function syncAlerts(db: DataLayer, actor: AlertActor): Promise<number> {
  const [students, attendance, sessions, submissions, assignments, ability, learningRecords] = await Promise.all([
    db.students.list(),
    db.attendance.list(),
    db.classSessions.list(),
    db.submissions.list(),
    db.assignments.list(),
    db.abilityAssessments.list(),
    db.learningRecords.list(),
  ]);

  let created = 0;

  // A. 连续缺席
  for (const { student, count } of computeConsecutiveAbsent(attendance, sessions, students)) {
    if (await hasOpenConcern(db, student.id, ALERT_TYPE.consecutiveAbsent)) continue;
    await db.concerns.insert(
      {
        student_id: student.id,
        type: ALERT_TYPE.consecutiveAbsent,
        trigger_reason: `连续缺席 ${count} 场`,
        evidence: `最长连续缺勤段 = ${count} 场（已上场次考勤统计）`,
        suggested_action: '联系学员了解缺课原因，安排补课或一对一跟进',
        owner: actor.actorId,
        due: null,
        status: 'pending',
        confirmed_by: null,
        confirmed_at: null,
        resolved_at: null,
        result: '',
      },
      { actorId: actor.actorId, actorRole: actor.actorRole },
    );
    created += 1;
  }

  // B. 长期未提交
  for (const { student, pendingCount } of computeLongNoSubmission(submissions, assignments, sessions, students)) {
    if (await hasOpenConcern(db, student.id, ALERT_TYPE.longNoSubmission)) continue;
    await db.concerns.insert(
      {
        student_id: student.id,
        type: ALERT_TYPE.longNoSubmission,
        trigger_reason: `长期未提交 ${pendingCount} 项作业`,
        evidence: `已上场次作业仍处「待提交」状态 ${pendingCount} 项`,
        suggested_action: '提醒学员补交作业，必要时提供针对性辅导',
        owner: actor.actorId,
        due: null,
        status: 'pending',
        confirmed_by: null,
        confirmed_at: null,
        resolved_at: null,
        result: '',
      },
      { actorId: actor.actorId, actorRole: actor.actorRole },
    );
    created += 1;
  }

  // C. 能力偏弱
  for (const { student_id, dimensions } of computeWeakAbility(ability)) {
    if (await hasOpenConcern(db, student_id, ALERT_TYPE.weakAbility)) continue;
    await db.concerns.insert(
      {
        student_id,
        type: ALERT_TYPE.weakAbility,
        trigger_reason: `能力偏弱（${dimensions.join('、')}）`,
        evidence: `已发布评估中 ${dimensions.join('、')} 维度处于 L1（入门）`,
        suggested_action: '结合课堂表现制定针对性提升计划，优先补齐基础维度',
        owner: actor.actorId,
        due: null,
        status: 'pending',
        confirmed_by: null,
        confirmed_at: null,
        resolved_at: null,
        result: '',
      },
      { actorId: actor.actorId, actorRole: actor.actorRole },
    );
    created += 1;
  }

  // D. 持续学习困难
  for (const { student_id, count, problem } of computePersistentDifficulty(learningRecords)) {
    if (await hasOpenConcern(db, student_id, ALERT_TYPE.persistentDifficulty)) continue;
    await db.concerns.insert(
      {
        student_id,
        type: ALERT_TYPE.persistentDifficulty,
        trigger_reason: `持续学习困难（${count} 次课堂反馈需帮助）`,
        evidence: `学习记录中 ${count} 次标记需帮助，典型问题：${problem}`,
        suggested_action: '复盘课堂难点，安排专项练习与一对一答疑',
        owner: actor.actorId,
        due: null,
        status: 'pending',
        confirmed_by: null,
        confirmed_at: null,
        resolved_at: null,
        result: '',
      },
      { actorId: actor.actorId, actorRole: actor.actorRole },
    );
    created += 1;
  }

  return created;
}

/**
 * 教师确认 concern（status: pending → confirmed）。
 * 仅使用现有字段 confirmed_by / confirmed_at，不新增字段。
 */
export async function confirmConcern(
  db: DataLayer,
  concernId: string,
  actor: AlertActor,
): Promise<Concern> {
  return db.concerns.update(
    concernId,
    { status: 'confirmed', confirmed_by: actor.actorId, confirmed_at: Date.now() },
    { actorId: actor.actorId, actorRole: actor.actorRole },
  );
}

/**
 * 教师解决 concern（status → resolved），处理备注写入现有 result 字段。
 * 不新增字段；result 为空字符串也允许（解决不一定需要备注）。
 */
export async function resolveConcern(
  db: DataLayer,
  concernId: string,
  result: string,
  actor: AlertActor,
): Promise<Concern> {
  return db.concerns.update(
    concernId,
    { status: 'resolved', resolved_at: Date.now(), result },
    { actorId: actor.actorId, actorRole: actor.actorRole },
  );
}

/**
 * 方案乙：教师手动将 concern 转为待办。仅写 todos，绝不自动生成 system todo。
 * 关联仅靠现有字段 related_student_id + title 表达，不新增任何关联字段。
 */
export async function convertConcernToTodo(
  db: DataLayer,
  concern: Concern,
  studentName: string,
  actor: AlertActor,
): Promise<Todo> {
  return db.todos.insert(
    {
      owner_type: 'teacher',
      owner_id: actor.actorId,
      title: `关注[${studentName}]：${concern.type} — ${concern.trigger_reason}`,
      related_student_id: concern.student_id,
      due: concern.due,
      status: 'todo',
    },
    { actorId: actor.actorId, actorRole: actor.actorRole },
  );
}

/**
 * 教师完成待办（status: todo → done）。仅使用现有 status 字符串字段。
 */
export async function completeTodo(db: DataLayer, todoId: string, actor: AlertActor): Promise<Todo> {
  return db.todos.update(todoId, { status: 'done' }, { actorId: actor.actorId, actorRole: actor.actorRole });
}

// ============================================================
// 三、教学总览所需的真实统计（不修改 getTeacherOverview）
// ============================================================

/** 总览「需要关注」：未解决 concern 数量；「我的待办」：该教师未完成的待办数量 */
export async function getTeacherAlertStats(
  db: DataLayer,
  teacherId: string,
): Promise<{ openConcerns: number; myTodos: number }> {
  const [concerns, todos] = await Promise.all([db.concerns.list(), db.todos.list()]);
  const openConcerns = concerns.filter((c) => c.status !== 'resolved').length;
  const myTodos = todos.filter(
    (t) => t.owner_type === 'teacher' && t.owner_id === teacherId && t.status !== 'done',
  ).length;
  return { openConcerns, myTodos };
}
