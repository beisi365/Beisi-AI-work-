import type {
  TableName,
  Principal,
  AbilityDimension,
  AbilityLevel,
  User,
  Student,
  Teacher,
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
} from '../types';
import type {
  DataLayer,
  Repository,
  Query,
  NewRow,
  OverviewStats,
  DifficultyRow,
} from './DataLayer';
import { canRead, canWrite, type PermContext } from './permissions';
import { buildSeed, SEED_TABLE_NAMES, levelToNum } from '../seed';

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
    } else {
      this.cache = buildSeed() as unknown as Record<TableName, any[]>;
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
        return rows as R[];
      },
      async get(id: string): Promise<R | null> {
        return clone(arr().find((r) => r.id === id) ?? null) as R | null;
      },
      async insert(row: NewRow<R>): Promise<R> {
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
      async update(id: string, patch: Partial<R>): Promise<R> {
        const idx = arr().findIndex((r) => r.id === id);
        if (idx < 0) throw new Error(`${name} ${id} not found`);
        const updated = { ...arr()[idx], ...patch, id, updated_at: Date.now() } as R;
        arr()[idx] = updated;
        self.log('system', 'update', `${name}:${id}`, patch);
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
    return this.operationLogs.list(where as Query<OperationLog>);
  }

  async reset(): Promise<void> {
    this.cache = buildSeed() as unknown as Record<TableName, any[]>;
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
