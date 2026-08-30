import type {
  DBShape,
  TableName,
  Principal,
  AbilityDimension,
  AbilityLevel,
  ClassSession,
} from '../types';
import type { ChangeActor } from '../../lib/submissionStatusGuards';

// ============================================================
// 通用仓储接口
// ============================================================

export interface Query<T> {
  where?: Partial<T>;
  orderBy?: keyof T;
  desc?: boolean;
  limit?: number;
}

/** 从 DBShape 的表名提取单行类型 */
export type RowOf<K extends TableName> = DBShape[K] extends (infer R)[] ? R : never;

/** 新增时由实现自动补 id / created_at / updated_at / created_by */
export type NewRow<T> = Omit<T, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
  created_by?: string;
};

export interface Repository<T extends { id: string }> {
  /** 查询：where 过滤 + 排序 + 限量 */
  list(q?: Query<T>): Promise<T[]>;
  /** 取单条 */
  get(id: string): Promise<T | null>;
  /** 新增：自动维护时间戳与 created_by，并落操作日志 */
  insert(row: NewRow<T>, actor?: ChangeActor): Promise<T>;
  /** 局部更新：刷新 updated_at，写操作日志；actor 明确操作者，submissions 状态变更会被守卫校验 */
  update(id: string, patch: Partial<T>, actor?: ChangeActor): Promise<T>;
  /** 删除（按表删除策略校验 cascade/restrict/setnull） */
  remove(id: string): Promise<void>;
}

// ============================================================
// 聚合统计
// ============================================================

export interface DifficultyRow {
  problem: string;
  count: number;
  affectedStudents: string[];
  course: string;
  suggestedAction: string;
}

export interface AbilityDimSummary {
  avg: number; // L1–L4 映射为 1–4 的平均
  dist: Record<AbilityLevel, number>;
}

export interface OverviewStats {
  classCount: number;
  studentCount: number;
  attendanceRate: number; // 0–1
  courseCompletionRate: number;
  submissionRate: number;
  pendingReviews: number;
  focusStudents: number;
  upcomingSessions: ClassSession[];
  abilitySummary: Record<AbilityDimension, AbilityDimSummary>;
  highFreqDifficulties: DifficultyRow[]; // 高频学习困难排行（替代词云）
}

// ============================================================
// 统一数据层接口
// ============================================================

export interface DataLayer {
  // —— 21 张表的 Repository（T 为单行类型） ——
  users: Repository<RowOf<'users'>>;
  students: Repository<RowOf<'students'>>;
  teachers: Repository<RowOf<'teachers'>>;
  teacherSchedules: Repository<RowOf<'teacher_schedules'>>;
  classes: Repository<RowOf<'classes'>>;
  enrollments: Repository<RowOf<'enrollments'>>;
  courses: Repository<RowOf<'courses'>>;
  lessons: Repository<RowOf<'lessons'>>;
  classSessions: Repository<RowOf<'class_sessions'>>;
  attendance: Repository<RowOf<'attendance'>>;
  assignments: Repository<RowOf<'assignments'>>;
  submissions: Repository<RowOf<'submissions'>>;
  workVersions: Repository<RowOf<'work_versions'>>;
  learningRecords: Repository<RowOf<'learning_records'>>;
  abilityAssessments: Repository<RowOf<'ability_assessments'>>;
  teacherReviews: Repository<RowOf<'teacher_reviews'>>;
  aiAnalysis: Repository<RowOf<'ai_analysis'>>;
  communications: Repository<RowOf<'communications'>>;
  concerns: Repository<RowOf<'concerns'>>;
  todos: Repository<RowOf<'todos'>>;
  files: Repository<RowOf<'files'>>;
  operationLogs: Repository<RowOf<'operation_logs'>>;

  // —— 聚合统计 ——
  getOverviewStats(classId?: string): Promise<OverviewStats>;
  getAttendanceRate(scope: { classId?: string; classSessionId?: string }): Promise<number>;
  getSubmissionRate(classId: string): Promise<number>;
  getAbilityCurrent(studentId: string): Promise<Record<AbilityDimension, AbilityLevel | null>>;
  getAbilityHistory(studentId: string, dimension: AbilityDimension): Promise<DBShape['ability_assessments']>;
  getRevisionCount(submissionId: string): Promise<number>; // 来自 work_versions
  getHighFreqDifficulties(classId: string): Promise<DifficultyRow[]>;

  // —— 权限过滤（页面统一走 scoped） ——
  canRead(p: Principal, table: TableName, row: unknown): boolean;
  canWrite(p: Principal, table: TableName, row: unknown): boolean;
  queryScoped<T extends { id: string }>(
    p: Principal,
    table: TableName,
    where?: Partial<T>,
  ): Promise<T[]>;

  // —— 操作日志 ——
  getOperationLogs(where?: Partial<RowOf<'operation_logs'>>): Promise<RowOf<'operation_logs'>[]>;
  /** 显式写入一条操作日志，user_id 为真实操作人（禁止 system 硬编码），供业务服务记录高层动作 */
  appendLog(user_id: string, action: string, target: string, changes: unknown): void;

  // —— 重置 / 导入导出 ——
  reset(): Promise<void>;
  exportJSON(): Promise<string>;
  importJSON(json: string): Promise<void>;

  // —— 事务与回滚 ——
  /** 多表原子操作：fn 内任意一步失败，整体回滚到调用前状态并抛错 */
  transaction<T>(fn: (db: DataLayer) => Promise<T>): Promise<T>;

  // —— 订阅（页面刷新） ——
  /** 订阅若干表的变化，返回取消函数；实现内部用事件总线通知 */
  subscribe(tables: TableName[], listener: () => void): () => void;

  // —— 本地存储覆盖（统一访问点，键值读写仅在 LocalDataLayer 内落到浏览器存储） ——
  /** 读取本地存储中的覆盖值（如功能开关显式覆盖），无则返回 null */
  getLocalValue(key: string): string | null;
  /** 写入本地存储覆盖值 */
  setLocalValue(key: string, value: string): void;
  /** 删除本地存储覆盖值 */
  removeLocalValue(key: string): void;
}
