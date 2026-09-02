import type {
  TableName,
  Principal,
  AbilityDimension,
  AbilityLevel,
  User,
  Student,
  Teacher,
  TeacherSchedule,
  ClassRow,
  Enrollment,
  Course,
  Lesson,
  ClassSession,
  Attendance,
  Assignment,
  Submission,
  WorkVersion,
  LearningRecord,
  AbilityAssessment,
  TeacherReview,
  AiAnalysis,
  Communication,
  Concern,
  Todo,
  FileMeta,
  OperationLog,
  SubmissionStatus,
} from '../types';
import type {
  DataLayer,
  Repository,
  Query,
  NewRow,
  OverviewStats,
  DifficultyRow,
} from './DataLayer';
import { assertSubmissionStatusChange, ForbiddenError, type ChangeActor } from '../../lib/submissionStatusGuards';
import { withStudentDefaults } from '../../lib/studentNormalize';
import {
  assertStudentSelfEdit,
  filterTeacherSystemFields,
  STUDENT_PRODUCED_TABLES,
} from '../../lib/studentFieldGuard';
import { canRead, canWrite, type PermContext } from './permissions';
import { buildSeedWithOverrides, SEED_TABLE_NAMES, levelToNum } from '../seed';

const STORAGE_KEY = 'aiwb_db_v1';

// localStorage 不可用时（如 Node 测试环境）退化为内存 Map，仍保证唯一访问点
const mem = new Map<string, string>();
const storage: {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem: (k: string) => void;
} = (() => {
  if (typeof localStorage !== 'undefined') return localStorage;
  return {
    getItem: (k) => mem.get(k) ?? null,
    setItem: (k, v) => void mem.set(k, v),
    removeItem: (k) => void mem.delete(k),
  };
})();

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

/**
 * 学员读取归一化：旧数据（seed 的 20 名学员）不含 P1 新增字段时，
 * 补全默认值，避免页面/服务读取 undefined 报错。
 */
function normalizeStudent(s: any): Student {
  // 与 SupabaseDataLayer 共用同一份默认值定义，避免两侧字段演进不同步
  return withStudentDefaults(s);
}

export class LocalDataLayer implements DataLayer {
  // 内部缓存：各表均为数组；用 any[] 隔离泛型索引访问的类型问题
  private cache: Record<TableName, any[]>;
  private listeners = new Map<TableName, Set<() => void>>();
  private inTx = false;
  private txDirty = new Set<TableName>();
  private idc = 0;

  constructor() {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      this.cache = JSON.parse(raw) as Record<TableName, any[]>;
      // 前向迁移：已运行旧版 localStorage 可能缺新表，补空数组避免订阅/读取 undefined
      if (!Array.isArray((this.cache as Record<string, unknown>).teacher_schedules)) {
        (this.cache as Record<string, unknown>).teacher_schedules = [];
        this.persist();
      }
    } else {
      this.cache = buildSeedWithOverrides() as unknown as Record<TableName, any[]>;
      this.persist();
    }
  }

  private persist() {
    storage.setItem(STORAGE_KEY, JSON.stringify(this.cache));
  }

  private emit(tables: TableName[]) {
    if (this.inTx) {
      tables.forEach((t) => this.txDirty.add(t));
      return;
    }
    for (const t of tables) {
      this.listeners.get(t)?.forEach((l) => l());
    }
  }

  subscribe(tables: TableName[], listener: () => void): () => void {
    tables.forEach((t) => {
      if (!this.listeners.has(t)) this.listeners.set(t, new Set());
      this.listeners.get(t)!.add(listener);
    });
    return () => {
      tables.forEach((t) => this.listeners.get(t)?.delete(listener));
    };
  }

  // —— 本地存储覆盖（唯一访问点，架构约束：localStorage 仅在此文件引用） ——
  /** 经统一存储抽象读取覆盖值；node 测试环境下自动退化为内存 Map，无 localStorage 亦可用 */
  getLocalValue(key: string): string | null {
    return storage.getItem(key);
  }
  setLocalValue(key: string, value: string): void {
    storage.setItem(key, value);
  }
  removeLocalValue(key: string): void {
    storage.removeItem(key);
  }

  private log(user_id: string, action: string, target: string, changes: unknown) {
    this.cache.operation_logs.push({
      id: this.genId('ol'),
      user_id,
      action,
      target,
      changes: JSON.stringify(changes ?? null),
      created_at: Date.now(),
    });
  }

  private genId(p: string): string {
    return `${p}_${Date.now().toString(36)}_${(++this.idc).toString(36)}`;
  }

  private makeRepo<R extends { id: string }>(name: TableName): Repository<R> {
    const self = this;
    const arr = () => self.cache[name] as any[];
    return {
      async list(q?: Query<R>): Promise<R[]> {
        let rows: any[] = clone(arr());
        if (q?.where) {
          rows = rows.filter((r) =>
            Object.entries(q.where as Record<string, unknown>).every(
              ([k, v]) => (r as Record<string, unknown>)[k] === v,
            ),
          );
        }
        if (q?.orderBy) {
          const key = q.orderBy as string;
          rows.sort((a, b) => {
            const av = (a as Record<string, unknown>)[key] as never;
            const bv = (b as Record<string, unknown>)[key] as never;
            return (av < bv ? -1 : av > bv ? 1 : 0) * (q.desc ? -1 : 1);
          });
        }
        if (q?.limit) rows = rows.slice(0, q.limit);
        if (name === 'students') rows = rows.map((r) => normalizeStudent(r));
        return rows as R[];
      },
      async get(id: string): Promise<R | null> {
        const found = arr().find((r) => r.id === id) ?? null;
        return (name === 'students' && found ? normalizeStudent(found) : found) as R | null;
      },
      async insert(row: NewRow<R>, actor?: ChangeActor): Promise<R> {
        // 归档守卫：已归档学员本人不得新增作品版本 / 作业提交 / 学习记录。
        // 仅当 actor 为 student 且目标表为其产出表、且对应学员已归档时拒绝；
        // 教师 / system / 无 actor 的调用不受影响（如 seed、服务内部写入）。
        if (actor && actor.actorRole === 'student' && (STUDENT_PRODUCED_TABLES as readonly string[]).includes(name)) {
          const sid = (row as Record<string, unknown>).student_id as string | undefined;
          if (sid) {
            const stu = self.cache.students.find((r) => r.id === sid) as Record<string, unknown> | undefined;
            if (stu && stu.archived_at) {
              throw new ForbiddenError('账号已归档，无法新增作品或学习数据');
            }
          }
        }
        const now = Date.now();
        const full = {
          ...(row as object),
          id: row.id ?? self.genId(name.slice(0, 2)),
          created_at: now,
          updated_at: now,
        } as unknown as R;
        arr().push(full);
        self.log((row as { created_by?: string }).created_by ?? 'system', 'insert', `${name}:${full.id}`, row);
        self.persist();
        self.emit([name]);
        return clone(full);
      },
      async update(id: string, patch: Partial<R>, actor?: ChangeActor): Promise<R> {
        const idx = arr().findIndex((r) => r.id === id);
        if (idx < 0) throw new Error(`${name} ${id} not found`);
        const current = arr()[idx] as Record<string, unknown>;
        const patchAny = patch as Record<string, unknown>;
        // 第三层防线：submissions 表的状态变更必须校验操作者角色与合法转换。
        // 缺 actor 或 actorRole==='system' → 拒绝（普通页面/服务必须显式传 actor）。
        if (name === 'submissions' && patchAny.status !== undefined && patchAny.status !== current.status) {
          assertSubmissionStatusChange(
            current.status as SubmissionStatus,
            patchAny.status as SubmissionStatus,
            actor,
          );
        }
        // 学员资料字段守卫（第三层防线延伸）：写库前强制校验，非法字段整次失败。
        if (name === 'students' && actor) {
          if (actor.actorRole === 'student') {
            // 所有权 + 白名单：抛错即中止，已写字段一并回滚
            assertStudentSelfEdit(id, actor, patchAny);
          } else if (actor.actorRole === 'teacher') {
            // 教师禁止通过普通资料编辑篡改系统字段（主键/时间戳/归属）
            const filtered = filterTeacherSystemFields(patchAny);
            for (const k of Object.keys(patchAny)) {
              if (!(k in filtered)) delete patchAny[k];
            }
          }
          // system 角色：seed / 迁移 / 重置专用，不做字段限制
        }
        const updated = { ...arr()[idx], ...patch, id, updated_at: Date.now() } as R;
        arr()[idx] = updated;
        self.log(actor?.actorId ?? 'system', 'update', `${name}:${id}`, patch);
        self.persist();
        self.emit([name]);
        return clone(updated);
      },
      async remove(id: string): Promise<void> {
        const idx = arr().findIndex((r) => r.id === id);
        if (idx < 0) return;
        arr().splice(idx, 1);
        self.log('system', 'remove', `${name}:${id}`, null);
        self.persist();
        self.emit([name]);
      },
    };
  }

  users = this.makeRepo<User>('users');
  students = this.makeRepo<Student>('students');
  teachers = this.makeRepo<Teacher>('teachers');
  teacherSchedules = this.makeRepo<TeacherSchedule>('teacher_schedules');
  classes = this.makeRepo<ClassRow>('classes');
  enrollments = this.makeRepo<Enrollment>('enrollments');
  courses = this.makeRepo<Course>('courses');
  lessons = this.makeRepo<Lesson>('lessons');
  classSessions = this.makeRepo<ClassSession>('class_sessions');
  attendance = this.makeRepo<Attendance>('attendance');
  assignments = this.makeRepo<Assignment>('assignments');
  submissions = this.makeRepo<Submission>('submissions');
  workVersions = this.makeRepo<WorkVersion>('work_versions');
  learningRecords = this.makeRepo<LearningRecord>('learning_records');
  abilityAssessments = this.makeRepo<AbilityAssessment>('ability_assessments');
  teacherReviews = this.makeRepo<TeacherReview>('teacher_reviews');
  aiAnalysis = this.makeRepo<AiAnalysis>('ai_analysis');
  communications = this.makeRepo<Communication>('communications');
  concerns = this.makeRepo<Concern>('concerns');
  todos = this.makeRepo<Todo>('todos');
  files = this.makeRepo<FileMeta>('files');
  operationLogs = this.makeRepo<OperationLog>('operation_logs');

  private ctx(): PermContext {
    return {
      isEnrolled: (studentId, classId) =>
        this.cache.enrollments.some(
          (e) => e.student_id === studentId && e.class_id === classId,
        ),
    };
  }

  canRead(p: Principal, table: TableName, row: unknown): boolean {
    return canRead(p, table, row as Record<string, unknown>, this.ctx());
  }
  canWrite(p: Principal, table: TableName, row: unknown): boolean {
    return canWrite(p, table, row as Record<string, unknown>, this.ctx());
  }
  async queryScoped<T extends { id: string }>(
    p: Principal,
    table: TableName,
    where?: Partial<T>,
  ): Promise<T[]> {
    const repo = (this as unknown as Record<string, Repository<T>>)[table] as Repository<T>;
    const all = await repo.list(where as Query<T>);
    return all.filter((r) => this.canRead(p, table, r)) as T[];
  }

  async getOperationLogs(where?: Partial<OperationLog>): Promise<OperationLog[]> {
    return this.operationLogs.list({ where } as Query<OperationLog>);
  }

  /** 显式写入一条操作日志（真实操作人，禁止 system 硬编码）；事务内仅入缓存、提交时统一落盘 */
  appendLog(user_id: string, action: string, target: string, changes: unknown): void {
    this.log(user_id, action, target, changes);
    if (!this.inTx) {
      this.persist();
      this.emit(['operation_logs']);
    }
  }

  async reset(): Promise<void> {
    // 真正清掉 localStorage 的旧 seed，让下次加载时从 buildSeed() 重新生成（含新增教师/字段等）
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('aiwb_db_v1');
    }
    this.cache = buildSeedWithOverrides() as unknown as Record<TableName, any[]>;
    this.persist();
    this.emit([...SEED_TABLE_NAMES]);
  }
  async exportJSON(): Promise<string> {
    return JSON.stringify(this.cache);
  }
  async importJSON(json: string): Promise<void> {
    this.cache = JSON.parse(json) as Record<TableName, any[]>;
    this.persist();
    this.emit([...SEED_TABLE_NAMES]);
  }

  async transaction<T>(fn: (db: DataLayer) => Promise<T>): Promise<T> {
    const snapshot = clone(this.cache);
    const prevInTx = this.inTx;
    this.inTx = true;
    this.txDirty.clear();
    try {
      const result = await fn(this);
      this.persist();
      this.inTx = prevInTx;
      const dirty = [...this.txDirty];
      this.txDirty.clear();
      if (!prevInTx) this.emit(dirty);
      return result;
    } catch (e) {
      this.cache = snapshot;
      this.inTx = prevInTx;
      this.txDirty.clear();
      throw e;
    }
  }

  private enrolledIn(classId?: string): string[] {
    return this.cache.enrollments
      .filter((e) => !classId || e.class_id === classId)
      .map((e) => e.student_id);
  }

  async getAttendanceRate(scope: { classId?: string; classSessionId?: string }): Promise<number> {
    let rows = this.cache.attendance;
    if (scope.classSessionId) rows = rows.filter((a) => a.class_session_id === scope.classSessionId);
    else if (scope.classId) {
      const sessionIds = new Set(
        this.cache.class_sessions.filter((s) => s.class_id === scope.classId).map((s) => s.id),
      );
      rows = rows.filter((a) => sessionIds.has(a.class_session_id));
    }
    if (rows.length === 0) return 0;
    const attended = rows.filter((a) => a.status === 'present' || a.status === 'late').length;
    return attended / rows.length;
  }

  async getSubmissionRate(classId: string): Promise<number> {
    const doneSessionIds = new Set(
      this.cache.class_sessions.filter((s) => s.class_id === classId && s.status === 'done').map((s) => s.id),
    );
    const classAssignmentIds = new Set(
      this.cache.assignments
        .filter((a) => a.class_id === classId && a.class_session_id && doneSessionIds.has(a.class_session_id))
        .map((a) => a.id),
    );
    const expected = classAssignmentIds.size * this.enrolledIn(classId).length;
    if (expected === 0) return 0;
    const done = this.cache.submissions.filter(
      (s) => classAssignmentIds.has(s.assignment_id) && s.status !== 'pending',
    ).length;
    return done / expected;
  }

  async getAbilityCurrent(
    studentId: string,
  ): Promise<Record<AbilityDimension, AbilityLevel | null>> {
    const dims: AbilityDimension[] = [
      'basics',
      'requirement',
      'prompt',
      'operation',
      'judgement',
      'application',
    ];
    const result = {} as Record<AbilityDimension, AbilityLevel | null>;
    for (const d of dims) {
      const snaps = this.cache.ability_assessments
        .filter(
          (a) =>
            a.student_id === studentId &&
            a.dimension === d &&
            // 仅统计已发布或遗留（CP1 无 status 字段）记录；草稿/已确认/作废不计入当前能力
            (a.status === undefined || a.status === 'published'),
        )
        .sort((a, b) => a.assessed_at - b.assessed_at);
      const latest = snaps[snaps.length - 1];
      result[d] = latest ? latest.teacher_confirmed_level ?? latest.level : null;
    }
    return result;
  }

  async getAbilityHistory(studentId: string, dimension: AbilityDimension) {
    return this.cache.ability_assessments
      .filter(
        (a) =>
          a.student_id === studentId &&
          a.dimension === dimension &&
          // 与 getAbilityCurrent 同源：仅已发布或遗留记录进入单维历史（学员不可见草稿/已确认/作废）
          (a.status === undefined || a.status === 'published'),
      )
      .sort((a, b) => a.assessed_at - b.assessed_at);
  }

  async getRevisionCount(submissionId: string): Promise<number> {
    return this.cache.work_versions.filter((w) => w.submission_id === submissionId).length;
  }

  async getHighFreqDifficulties(classId: string): Promise<DifficultyRow[]> {
    const classSessionIds = new Set(
      this.cache.class_sessions.filter((s) => s.class_id === classId).map((s) => s.id),
    );
    const map = new Map<string, DifficultyRow>();
    for (const lr of this.cache.learning_records) {
      const session = this.cache.class_sessions.find((s) => s.id === lr.class_session_id);
      if (!session || !classSessionIds.has(session.id)) continue;
      if (!lr.problems || lr.problems === '无') continue;
      const lesson = this.cache.lessons.find((l) => l.id === session.lesson_id);
      const course = this.cache.courses.find((c) => c.id === lesson?.course_id);
      const key = lr.problems;
      const cur =
        map.get(key) ??
        ({
          problem: key,
          count: 0,
          affectedStudents: [],
          course: course?.title ?? '',
          suggestedAction: '课堂重点讲解 + 一对一辅导',
        } as DifficultyRow);
      cur.count += 1;
      if (!cur.affectedStudents.includes(lr.student_id)) cur.affectedStudents.push(lr.student_id);
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }

  async getOverviewStats(classId?: string): Promise<OverviewStats> {
    const classIds = classId ? [classId] : this.cache.classes.map((c) => c.id);
    const studentIds = new Set(
      this.cache.enrollments.filter((e) => classIds.includes(e.class_id)).map((e) => e.student_id),
    );
    const dims: AbilityDimension[] = [
      'basics',
      'requirement',
      'prompt',
      'operation',
      'judgement',
      'application',
    ];
    const abilitySummary = {} as Record<
      AbilityDimension,
      { avg: number; dist: Record<AbilityLevel, number> }
    >;
    for (const d of dims) {
      const dist: Record<AbilityLevel, number> = { L1: 0, L2: 0, L3: 0, L4: 0 };
      let sum = 0;
      let n = 0;
      for (const sid of studentIds) {
        const cur = (await this.getAbilityCurrent(sid))[d];
        if (cur) {
          dist[cur] += 1;
          sum += levelToNum(cur);
          n += 1;
        }
      }
      abilitySummary[d] = { avg: n ? sum / n : 0, dist };
    }
    const upcoming = this.cache.class_sessions
      .filter((s) => classIds.includes(s.class_id) && s.status === 'scheduled')
      .sort((a, b) => a.scheduled_start - b.scheduled_start);

    return {
      classCount: classIds.length,
      studentCount: studentIds.size,
      attendanceRate: classId ? await this.getAttendanceRate({ classId }) : 0,
      courseCompletionRate: 0,
      submissionRate: classId ? await this.getSubmissionRate(classId) : 0,
      pendingReviews: this.cache.teacher_reviews.filter((r) => r.status === 'draft').length,
      focusStudents: this.cache.concerns.filter((c) => c.status !== 'resolved').length,
      upcomingSessions: upcoming,
      abilitySummary,
      highFreqDifficulties: classId ? await this.getHighFreqDifficulties(classId) : [],
    };
  }
}
