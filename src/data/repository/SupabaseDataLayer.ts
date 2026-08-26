import type {
  AbilityDimension,
  AbilityLevel,
  ClassSession,
  OperationLog,
  Principal,
  TableName,
} from '../types';
import type {
  DataLayer,
  DifficultyRow,
  OverviewStats,
  Query,
  Repository,
  RowOf,
} from './DataLayer';
import { getSupabase, isSupabaseEnabled } from '../../lib/supabaseClient';
import {
  assertSubmissionStatusChange,
  ForbiddenError,
  type ChangeActor,
} from '../../lib/submissionStatusGuards';
import {
  assertStudentSelfEdit,
  filterTeacherSystemFields,
  STUDENT_PRODUCED_TABLES,
} from '../../lib/studentFieldGuard';
import { canRead, canWrite, type PermContext } from './permissions';

/** repo 属性名（camelCase）→ 物理表名（snake_case） */
const TABLE_OF: Record<string, string> = {
  users: 'users',
  students: 'students',
  teachers: 'teachers',
  classes: 'classes',
  enrollments: 'enrollments',
  courses: 'courses',
  lessons: 'lessons',
  classSessions: 'class_sessions',
  attendance: 'attendance',
  assignments: 'assignments',
  submissions: 'submissions',
  workVersions: 'work_versions',
  learningRecords: 'learning_records',
  abilityAssessments: 'ability_assessments',
  teacherReviews: 'teacher_reviews',
  aiAnalysis: 'ai_analysis',
  communications: 'communications',
  concerns: 'concerns',
  todos: 'todos',
  files: 'files',
  operationLogs: 'operation_logs',
};

const TABLE_NAMES = Object.values(TABLE_OF);

function tableName(repoName: string): string {
  const t = TABLE_OF[repoName];
  if (!t) throw new Error(`未知仓库：${repoName}`);
  return t;
}

function normalizeStudent(s: any): RowOf<'students'> {
  return {
    ...s,
    self_intro: s.self_intro ?? '',
    ai_baseline: s.ai_baseline ?? null,
    teacher_tags: Array.isArray(s.teacher_tags) ? s.teacher_tags : [],
    learning_suggestion: s.learning_suggestion ?? null,
    teacher_observation: s.teacher_observation ?? null,
    archived_at: s.archived_at ?? null,
  } as RowOf<'students'>;
}

export class SupabaseDataLayer implements DataLayer {
  private idc = 0;
  private listeners = new Map<TableName, Set<() => void>>();
  // 本地覆盖值（仅功能开关等，非业务数据；用内存 Map，不触碰浏览器存储架构约束）
  private localMem = new Map<string, string>();
  private enrollCache: RowOf<'enrollments'>[] | null = null;

  private genId(p: string): string {
    return `${p}_${Date.now().toString(36)}_${(++this.idc).toString(36)}`;
  }

  /** 通用取单行（绕过 repo，供守卫内部使用） */
  private async getRow(table: string, id: string): Promise<any | null> {
    const client = getSupabase();
    const { data, error } = await client.from(table).select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  private ctx(): PermContext {
    const enroll = this.enrollCache ?? [];
    return {
      isEnrolled: (studentId, classId) =>
        enroll.some((e) => e.student_id === studentId && e.class_id === classId),
    };
  }

  private async getEnrollments(): Promise<RowOf<'enrollments'>[]> {
    if (this.enrollCache) return this.enrollCache;
    const all = await this.enrollments.list();
    this.enrollCache = all as RowOf<'enrollments'>[];
    return this.enrollCache;
  }

  private makeRepo<R extends { id: string }>(repoName: string): Repository<R> {
    const self = this;
    const t = tableName(repoName);
    return {
      async list(q?: Query<R>): Promise<R[]> {
        const client = getSupabase();
        let qb = client.from(t).select('*');
        if (q?.where) {
          for (const [k, v] of Object.entries(q.where as Record<string, unknown>)) {
            qb = qb.eq(k, v as never);
          }
        }
        if (q?.orderBy) {
          qb = qb.order(q.orderBy as string, { ascending: !q.desc });
        }
        if (q?.limit) qb = qb.limit(q.limit);
        const { data, error } = await qb;
        if (error) throw new Error(error.message);
        let rows = (data ?? []) as any[];
        if (t === 'students') rows = rows.map((r) => normalizeStudent(r));
        return rows as R[];
      },
      async get(id: string): Promise<R | null> {
        const client = getSupabase();
        const { data, error } = await client.from(t).select('*').eq('id', id).maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return null;
        return (t === 'students' ? normalizeStudent(data) : data) as R;
      },
      async insert(row: any, actor?: ChangeActor): Promise<R> {
        const client = getSupabase();
        if (
          actor &&
          actor.actorRole === 'student' &&
          (STUDENT_PRODUCED_TABLES as readonly string[]).includes(t)
        ) {
          const sid = row.student_id as string | undefined;
          if (sid) {
            const stu = await self.getRow(t, sid);
            if (stu && stu.archived_at) {
              throw new ForbiddenError('账号已归档，无法新增作品或学习数据');
            }
          }
        }
        const now = Date.now();
        const full = {
          ...row,
          id: row.id ?? self.genId(t.slice(0, 2)),
          created_at: now,
          updated_at: now,
          created_by: row.created_by ?? actor?.actorId ?? 'system',
        };
        const { data, error } = await client.from(t).insert(full).select().maybeSingle();
        if (error) throw new Error(error.message);
        self.emit([repoName as TableName]);
        return (t === 'students' ? normalizeStudent(data) : data) as R;
      },
      async update(id: string, patch: any, actor?: ChangeActor): Promise<R> {
        const client = getSupabase();
        const current = await self.getRow(t, id);
        if (!current) throw new Error(`${t} ${id} not found`);
        const patchAny = { ...patch };
        if (t === 'submissions' && patchAny.status !== undefined && patchAny.status !== (current as any).status) {
          assertSubmissionStatusChange(
            (current as any).status,
            patchAny.status,
            actor,
          );
        }
        if (t === 'students' && actor) {
          if (actor.actorRole === 'student') {
            assertStudentSelfEdit(id, actor, patchAny);
          } else if (actor.actorRole === 'teacher') {
            const filtered = filterTeacherSystemFields(patchAny);
            for (const k of Object.keys(patchAny)) {
              if (!(k in filtered)) delete patchAny[k];
            }
          }
        }
        const updated = { ...patchAny, updated_at: Date.now() };
        const { data, error } = await client
          .from(t)
          .update(updated)
          .eq('id', id)
          .select()
          .maybeSingle();
        if (error) throw new Error(error.message);
        self.emit([repoName as TableName]);
        return (t === 'students' ? normalizeStudent(data) : data) as R;
      },
      async remove(id: string): Promise<void> {
        const client = getSupabase();
        const { error } = await client.from(t).delete().eq('id', id);
        if (error) throw new Error(error.message);
        self.emit([repoName as TableName]);
      },
    };
  }

  users = this.makeRepo<RowOf<'users'>>('users');
  students = this.makeRepo<RowOf<'students'>>('students');
  teachers = this.makeRepo<RowOf<'teachers'>>('teachers');
  classes = this.makeRepo<RowOf<'classes'>>('classes');
  enrollments = this.makeRepo<RowOf<'enrollments'>>('enrollments');
  courses = this.makeRepo<RowOf<'courses'>>('courses');
  lessons = this.makeRepo<RowOf<'lessons'>>('lessons');
  classSessions = this.makeRepo<RowOf<'class_sessions'>>('classSessions');
  attendance = this.makeRepo<RowOf<'attendance'>>('attendance');
  assignments = this.makeRepo<RowOf<'assignments'>>('assignments');
  submissions = this.makeRepo<RowOf<'submissions'>>('submissions');
  workVersions = this.makeRepo<RowOf<'work_versions'>>('workVersions');
  learningRecords = this.makeRepo<RowOf<'learning_records'>>('learningRecords');
  abilityAssessments = this.makeRepo<RowOf<'ability_assessments'>>('abilityAssessments');
  teacherReviews = this.makeRepo<RowOf<'teacher_reviews'>>('teacherReviews');
  aiAnalysis = this.makeRepo<RowOf<'ai_analysis'>>('aiAnalysis');
  communications = this.makeRepo<RowOf<'communications'>>('communications');
  concerns = this.makeRepo<RowOf<'concerns'>>('concerns');
  todos = this.makeRepo<RowOf<'todos'>>('todos');
  files = this.makeRepo<RowOf<'files'>>('files');
  operationLogs = this.makeRepo<RowOf<'operation_logs'>>('operationLogs');

  // —— 订阅（用 Supabase Realtime 触发刷新） ——
  subscribe(tables: TableName[], listener: () => void): () => void {
    for (const t of tables) {
      if (!this.listeners.has(t)) this.listeners.set(t, new Set());
      this.listeners.get(t)!.add(listener);
    }
    if (isSupabaseEnabled) {
      const client = getSupabase();
      const channel = client
        .channel('aiwb-realtime')
        .on('postgres_changes', { event: '*', schema: 'public' }, () => {
          listener();
        })
        .subscribe();
      return () => {
        tables.forEach((t) => this.listeners.get(t)?.delete(listener));
        client.removeChannel(channel);
      };
    }
    return () => {
      tables.forEach((t) => this.listeners.get(t)?.delete(listener));
    };
  }

  private emit(tables: TableName[]) {
    for (const t of tables) this.listeners.get(t)?.forEach((l) => l());
  }

  // —— 权限过滤 ——
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
    await this.getEnrollments();
    const repo = (this as unknown as Record<string, Repository<T>>)[table] as Repository<T>;
    const all = await repo.list(where as Query<T>);
    return all.filter((r) => this.canRead(p, table, r)) as T[];
  }

  // —— 操作日志 ——
  async getOperationLogs(where?: Partial<OperationLog>): Promise<OperationLog[]> {
    return (await this.operationLogs.list({ where } as Query<OperationLog>)) as OperationLog[];
  }
  appendLog(user_id: string, action: string, target: string, changes: unknown): void {
    // 同步签名；云端为网络写入，fire-and-forget（不阻塞业务）
    if (isSupabaseEnabled) {
      void getSupabase()
        .from('operation_logs')
        .insert({
          id: this.genId('ol'),
          user_id,
          action,
          target,
          changes: JSON.stringify(changes ?? null),
          created_at: Date.now(),
        });
    }
  }

  // —— 重置/导入导出（云端模式语义不同） ——
  async reset(): Promise<void> {
    throw new Error('云端模式不支持「重置演示数据」：数据由 Supabase 共享管理，请联系管理员。');
  }
  async exportJSON(): Promise<string> {
    const client = getSupabase();
    const out: Record<string, unknown[]> = {};
    for (const t of TABLE_NAMES) {
      const { data, error } = await client.from(t).select('*');
      if (error) throw new Error(error.message);
      out[t] = data ?? [];
    }
    return JSON.stringify(out);
  }
  async importJSON(_json: string): Promise<void> {
    throw new Error('云端模式不支持整体导入：请用 Supabase 后台或迁移脚本管理数据。');
  }

  // —— 事务（云端为顺序执行，非原子；真正原子性需 Postgres RPC，后续补） ——
  async transaction<T>(fn: (db: DataLayer) => Promise<T>): Promise<T> {
    return fn(this);
  }

  // —— 本地覆盖值（仅功能开关；内存态，刷新即丢，够用） ——
  getLocalValue(key: string): string | null {
    return this.localMem.get(key) ?? null;
  }
  setLocalValue(key: string, value: string): void {
    this.localMem.set(key, value);
  }
  removeLocalValue(key: string): void {
    this.localMem.delete(key);
  }

  // ============================================================
  // 聚合统计（沿用 LocalDataLayer 的 JS 计算逻辑：先拉行再算）
  // ============================================================
  private async fetchAll(t: string): Promise<any[]> {
    const client = getSupabase();
    const { data, error } = await client.from(t).select('*');
    if (error) throw new Error(error.message);
    return (data ?? []) as any[];
  }

  async getAttendanceRate(scope: { classId?: string; classSessionId?: string }): Promise<number> {
    const rows = await this.fetchAll('attendance');
    let filtered = rows;
    if (scope.classSessionId) filtered = rows.filter((a) => a.class_session_id === scope.classSessionId);
    else if (scope.classId) {
      const sessions = await this.fetchAll('class_sessions');
      const ids = new Set(sessions.filter((s) => s.class_id === scope.classId).map((s) => s.id));
      filtered = rows.filter((a) => ids.has(a.class_session_id));
    }
    if (filtered.length === 0) return 0;
    const attended = filtered.filter((a) => a.status === 'present' || a.status === 'late').length;
    return attended / filtered.length;
  }

  async getSubmissionRate(classId: string): Promise<number> {
    const [sessions, assignments, submissions, enrollments] = await Promise.all([
      this.fetchAll('class_sessions'),
      this.fetchAll('assignments'),
      this.fetchAll('submissions'),
      this.fetchAll('enrollments'),
    ]);
    const doneSessionIds = new Set(
      sessions.filter((s) => s.class_id === classId && s.status === 'done').map((s) => s.id),
    );
    const classAssignmentIds = new Set(
      assignments
        .filter((a) => a.class_id === classId && a.class_session_id && doneSessionIds.has(a.class_session_id))
        .map((a) => a.id),
    );
    const expected = classAssignmentIds.size * enrollments.filter((e) => e.class_id === classId).length;
    if (expected === 0) return 0;
    const done = submissions.filter(
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
    const rows = await this.fetchAll('ability_assessments');
    const result = {} as Record<AbilityDimension, AbilityLevel | null>;
    for (const d of dims) {
      const snaps = rows
        .filter(
          (a) =>
            a.student_id === studentId &&
            a.dimension === d &&
            (a.status === undefined || a.status === 'published'),
        )
        .sort((a, b) => a.assessed_at - b.assessed_at);
      const latest = snaps[snaps.length - 1];
      result[d] = latest ? latest.teacher_confirmed_level ?? latest.level : null;
    }
    return result;
  }

  async getAbilityHistory(studentId: string, dimension: AbilityDimension) {
    const rows = await this.fetchAll('ability_assessments');
    return rows
      .filter(
        (a) =>
          a.student_id === studentId &&
          a.dimension === dimension &&
          (a.status === undefined || a.status === 'published'),
      )
      .sort((a, b) => a.assessed_at - b.assessed_at);
  }

  async getRevisionCount(submissionId: string): Promise<number> {
    const rows = await this.fetchAll('work_versions');
    return rows.filter((w) => w.submission_id === submissionId).length;
  }

  async getHighFreqDifficulties(classId: string): Promise<DifficultyRow[]> {
    const [records, sessions, lessons, courses] = await Promise.all([
      this.fetchAll('learning_records'),
      this.fetchAll('class_sessions'),
      this.fetchAll('lessons'),
      this.fetchAll('courses'),
    ]);
    const sessionIds = new Set(sessions.filter((s) => s.class_id === classId).map((s) => s.id));
    const map = new Map<string, DifficultyRow>();
    for (const lr of records) {
      const session = sessions.find((s) => s.id === lr.class_session_id);
      if (!session || !sessionIds.has(session.id)) continue;
      if (!lr.problems || lr.problems === '无') continue;
      const lesson = lessons.find((l) => l.id === session.lesson_id);
      const course = courses.find((c) => c.id === lesson?.course_id);
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
    const [classes, enrollments, sessions, reviews, concerns, ability] = await Promise.all([
      this.fetchAll('classes'),
      this.fetchAll('enrollments'),
      this.fetchAll('class_sessions'),
      this.fetchAll('teacher_reviews'),
      this.fetchAll('concerns'),
      this.fetchAll('ability_assessments'),
    ]);
    const classIds = classId ? [classId] : classes.map((c: any) => c.id);
    const studentIds = new Set(
      enrollments.filter((e: any) => classIds.includes(e.class_id)).map((e: any) => e.student_id),
    );
    const dims: AbilityDimension[] = [
      'basics',
      'requirement',
      'prompt',
      'operation',
      'judgement',
      'application',
    ];
    const levelToNum = (l: AbilityLevel) => ({ L1: 1, L2: 2, L3: 3, L4: 4 }[l] ?? 0);
    const abilitySummary = {} as Record<AbilityDimension, { avg: number; dist: Record<AbilityLevel, number> }>;
    for (const d of dims) {
      const dist: Record<AbilityLevel, number> = { L1: 0, L2: 0, L3: 0, L4: 0 };
      let sum = 0;
      let n = 0;
      for (const sid of studentIds) {
        const snaps = ability
          .filter(
            (a: any) =>
              a.student_id === sid &&
              a.dimension === d &&
              (a.status === undefined || a.status === 'published'),
          )
          .sort((a: any, b: any) => a.assessed_at - b.assessed_at);
        const latest = snaps[snaps.length - 1];
          const cur = latest ? (latest.teacher_confirmed_level ?? latest.level) : null;
          if (cur) {
            const lvl = cur as AbilityLevel;
            dist[lvl] += 1;
            sum += levelToNum(lvl);
            n += 1;
          }
      }
      abilitySummary[d] = { avg: n ? sum / n : 0, dist };
    }
    const upcoming = sessions
      .filter((s: any) => classIds.includes(s.class_id) && s.status === 'scheduled')
      .sort((a: any, b: any) => a.scheduled_start - b.scheduled_start) as ClassSession[];

    return {
      classCount: classIds.length,
      studentCount: studentIds.size,
      attendanceRate: classId ? await this.getAttendanceRate({ classId }) : 0,
      courseCompletionRate: 0,
      submissionRate: classId ? await this.getSubmissionRate(classId) : 0,
      pendingReviews: reviews.filter((r: any) => r.status === 'draft').length,
      focusStudents: concerns.filter((c: any) => c.status !== 'resolved').length,
      upcomingSessions: upcoming,
      abilitySummary,
      highFreqDifficulties: classId ? await this.getHighFreqDifficulties(classId) : [],
    };
  }
}
