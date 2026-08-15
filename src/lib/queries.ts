import type { DataLayer } from '../data/repository/DataLayer';
import type {
  Student,
  ClassRow,
  Teacher,
  Attendance,
  Submission,
  SubmissionStatus,
  Assignment,
  Lesson,
  ClassSession,
  LearningRecord,
  AbilityAssessment,
  Concern,
  Course,
} from '../data/types';
import type { StudentCategory } from './format';
import { ATTENDANCE_LABEL } from './format';

// ============================================================
// 纯查询函数：组合 DataLayer 读取，供页面与测试复用。
// 页面一律通过这些函数（而非直接读浏览器本地存储）取数。
// ============================================================

export function inferCategory(id: string): StudentCategory {
  const n = Number(id.replace(/\D/g, ''));
  if (n <= 8) return 'normal';
  if (n <= 13) return 'behind';
  if (n <= 17) return 'progress';
  return 'strong';
}

/** 已上课程（场次 done）对应的作业 id 集合：提交率分母应只计已发布/已到期的作业 */
export function doneAssignmentIds(assignments: { id: string; class_session_id: string | null }[], sessions: { id: string; status: string }[]): Set<string> {
  const doneSessionIds = new Set(sessions.filter((s) => s.status === 'done').map((s) => s.id));
  return new Set(
    assignments.filter((a) => a.class_session_id && doneSessionIds.has(a.class_session_id)).map((a) => a.id),
  );
}

// ============================================================
// 教师作业页：筛选 + 默认排序 + 分页（纯函数，供页面与测试复用）
// ============================================================

export interface WorksFilter {
  role: 'teacher' | 'student';
  /** 教师：班级筛选 */
  classId?: string;
  /** 教师：学员筛选 */
  studentId?: string;
  /** 教师：课节筛选（按 assignment.lesson_id 过滤） */
  lessonId?: string;
  /** 状态筛选（已排除 'all' 的纯状态值） */
  status?: SubmissionStatus;
  /** 学员：仅看本人 */
  viewerStudentId?: string;
}

/**
 * 默认排序优先级：待批改 / 需修改 置顶，便于教师优先处理；
 * 同优先级内按 updated_at 倒序（最近活动在前）。
 */
const WORKS_STATUS_PRIORITY: Record<SubmissionStatus, number> = {
  to_review: 0,
  need_revise: 1,
  pending: 2,
  completed: 3,
  excellent: 3,
};

export function selectWorksSubmissions(
  subs: Submission[],
  opts: {
    assignments: Pick<Assignment, 'id' | 'lesson_id' | 'class_id'>[];
    filter: WorksFilter;
  },
): Submission[] {
  const { assignments, filter } = opts;
  const asgById = new Map(assignments.map((a) => [a.id, a]));
  const filtered = subs.filter((s) => {
    // 学员只看本人
    if (filter.role === 'student' && s.student_id !== filter.viewerStudentId) return false;
    const asg = asgById.get(s.assignment_id);
    // 教师按班级 / 学员 / 课节筛选
    if (filter.role === 'teacher') {
      if (filter.classId && asg?.class_id !== filter.classId) return false;
      if (filter.studentId && s.student_id !== filter.studentId) return false;
      if (filter.lessonId && asg?.lesson_id !== filter.lessonId) return false;
    }
    // 状态筛选（两端通用）
    if (filter.status && s.status !== filter.status) return false;
    return true;
  });
  return filtered.sort((a, b) => {
    const pa = WORKS_STATUS_PRIORITY[a.status] ?? 9;
    const pb = WORKS_STATUS_PRIORITY[b.status] ?? 9;
    if (pa !== pb) return pa - pb;
    return b.updated_at - a.updated_at;
  });
}

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** 分页：页码越界自动钳制到合法范围。 */
export function paginate<T>(list: T[], page: number, pageSize: number): PageResult<T> {
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: list.slice(start, start + pageSize),
    page: safePage,
    pageSize,
    total,
    totalPages,
  };
}

export interface ClassStat {
  classRow: ClassRow;
  teacher: Teacher | undefined;
  course: Course | undefined;
  studentCount: number;
  attendanceRate: number;
  submissionRate: number; // 提交率：所有非 pending 状态占比
  completionRate: number; // 完成率：仅 completed + excellent 占比
  courseProgress: number; // 课程进度：已上场次 / 总场次
}

export async function getClassesWithStats(db: DataLayer): Promise<ClassStat[]> {
  const [classes, teachers, courses, enrollments, sessions, assignments, attendance, submissions] =
    await Promise.all([
      db.classes.list(),
      db.teachers.list(),
      db.courses.list(),
      db.enrollments.list(),
      db.classSessions.list(),
      db.assignments.list(),
      db.attendance.list(),
      db.submissions.list(),
    ]);
  return classes.map((c) => {
    const enrolled = enrollments.filter((e) => e.class_id === c.id).map((e) => e.student_id);
    const sessionIds = new Set(sessions.filter((s) => s.class_id === c.id).map((s) => s.id));
    const att = attendance.filter((a) => sessionIds.has(a.class_session_id));
    const attended = att.filter((a) => a.status === 'present' || a.status === 'late').length;
    const classAssignmentIds = doneAssignmentIds(
      assignments.filter((a) => a.class_id === c.id),
      sessions,
    );
    const expected = classAssignmentIds.size * enrolled.length;
    const done = submissions.filter(
      (s) => classAssignmentIds.has(s.assignment_id) && s.status !== 'pending',
    ).length;
    const completed = submissions.filter(
      (s) =>
        classAssignmentIds.has(s.assignment_id) &&
        (s.status === 'completed' || s.status === 'excellent'),
    ).length;
    const classSessions = sessions.filter((s) => s.class_id === c.id);
    const courseProgress = classSessions.length
      ? classSessions.filter((s) => s.status === 'done').length / classSessions.length
      : 0;
    return {
      classRow: c,
      teacher: teachers.find((t) => t.id === c.teacher_id),
      course: courses.find((co) => co.id === c.course_id),
      studentCount: enrolled.length,
      attendanceRate: att.length ? attended / att.length : 0,
      submissionRate: expected ? done / expected : 0,
      completionRate: expected ? completed / expected : 0,
      courseProgress,
    };
  });
}

export interface StudentWithClass {
  student: Student;
  classRow: ClassRow | undefined;
  enrollmentStatus: string;
  category: StudentCategory;
  attendanceRate: number;
  submissionRate: number; // 提交率：所有非 pending 状态占比
  completionRate: number; // 完成率：仅 completed + excellent 占比
}

export async function getStudentsWithClass(
  db: DataLayer,
  opts: { includeArchived?: boolean } = {},
): Promise<StudentWithClass[]> {
  const includeArchived = opts.includeArchived ?? false;
  const [students, enrollments, classes, attendance, submissions, assignments, sessions] = await Promise.all([
    db.students.list(),
    db.enrollments.list(),
    db.classes.list(),
    db.attendance.list(),
    db.submissions.list(),
    db.assignments.list(),
    db.classSessions.list(),
  ]);
  return students
    .filter((s) => includeArchived || !s.archived_at)
    .map((s) => {
      // 优先取在读报名（调班后旧报名为“已转班”，不应驱动当前班级）
      const en =
        enrollments.find((e) => e.student_id === s.id && e.status === '在读') ??
        enrollments.find((e) => e.student_id === s.id);
      const cid = en?.class_id;
    const classRow = classes.find((c) => c.id === cid);
    // 出勤率（基于该学员真实考勤）
    const sAtt = attendance.filter((a) => a.student_id === s.id);
    const attended = sAtt.filter((a) => a.status === 'present' || a.status === 'late').length;
    const attendanceRate = sAtt.length ? attended / sAtt.length : 0;
    // 提交率 / 完成率（分母 = 该班级已上场次绑定的作业数，与班级/档案口径一致）
    const expected = cid ? doneAssignmentIds(assignments.filter((a) => a.class_id === cid), sessions).size : 0;
    const sSub = submissions.filter((x) => x.student_id === s.id);
    const submissionRate = expected ? sSub.filter((x) => x.status !== 'pending').length / expected : 0;
    const completionRate = expected
      ? sSub.filter((x) => x.status === 'completed' || x.status === 'excellent').length / expected
      : 0;
    return {
      student: s,
      classRow,
      enrollmentStatus: en?.status ?? '—',
      category: inferCategory(s.id),
      attendanceRate,
      submissionRate,
      completionRate,
    };
  });
}

export interface StudentDashboard {
  student: Student;
  classRow: ClassRow | undefined;
  attendance: Attendance[];
  attendanceRate: number;
  submissions: (Submission & { assignment?: Assignment; lesson?: Lesson })[];
  submissionRate: number; // 提交率：所有非 pending 状态占比
  completionRate: number; // 完成率：仅 completed + excellent 占比
  learningRecords: (LearningRecord & { session?: ClassSession; lesson?: Lesson })[];
  sessions: ClassSession[];
  lessons: Lesson[];
  ability: Awaited<ReturnType<DataLayer['getAbilityCurrent']>>;
  concerns: Concern[];
}

export async function getStudentDashboard(db: DataLayer, studentId: string): Promise<StudentDashboard> {
  const [student, enrollments, classes, attendance, submissions, assignments, lessons, sessions, learningRecords, concerns, ability] =
    await Promise.all([
      db.students.get(studentId),
      db.enrollments.list(),
      db.classes.list(),
      db.attendance.list({ where: { student_id: studentId } } as never),
      db.submissions.list({ where: { student_id: studentId } } as never),
      db.assignments.list(),
      db.lessons.list(),
      db.classSessions.list(),
      db.learningRecords.list({ where: { student_id: studentId } } as never),
      db.concerns.list({ where: { student_id: studentId } } as never),
      db.getAbilityCurrent(studentId),
    ]);
  const en = enrollments.find((e) => e.student_id === studentId);
  const classRow = classes.find((c) => c.id === en?.class_id);
  const subJoined = submissions.map((s) => ({
    ...s,
    assignment: assignments.find((a) => a.id === s.assignment_id),
    lesson: lessons.find((l) => l.id === assignments.find((a) => a.id === s.assignment_id)?.lesson_id),
  }));
  const expected = doneAssignmentIds(
    assignments.filter((a) => a.class_id === classRow?.id),
    sessions,
  ).size;
  const submissionRate = expected ? subJoined.filter((s) => s.status !== 'pending').length / expected : 0;
  const completionRate = expected
    ? subJoined.filter((s) => s.status === 'completed' || s.status === 'excellent').length / expected
    : 0;
  const attRate = attendance.length
    ? attendance.filter((a) => a.status === 'present' || a.status === 'late').length / attendance.length
    : 0;
  const lrJoined = learningRecords.map((lr) => ({
    ...lr,
    session: sessions.find((s) => s.id === lr.class_session_id),
    lesson: lessons.find((l) => l.id === sessions.find((s) => s.id === lr.class_session_id)?.lesson_id),
  }));
  return {
    student: student as Student,
    classRow,
    attendance,
    attendanceRate: attRate,
    submissions: subJoined,
    submissionRate,
    completionRate,
    learningRecords: lrJoined,
    sessions,
    lessons,
    ability,
    concerns: concerns.filter((c) => c.status !== 'resolved'),
  };
}

export interface FocusStudent {
  student: Student;
  classRow: ClassRow | undefined;
  category: StudentCategory;
  reasons: string[];
  attendanceRate: number;
  submissionRate: number;
}

/** 需关注的学员：落后类别 / 出勤率低 / 提交率低 / 有未解决关注事项 */
export async function getFocusStudents(db: DataLayer): Promise<FocusStudent[]> {
  const [students, enrollments, classes, attendance, submissions, assignments, concerns, sessions] =
    await Promise.all([
      db.students.list(),
      db.enrollments.list(),
      db.classes.list(),
      db.attendance.list(),
      db.submissions.list(),
      db.assignments.list(),
      db.concerns.list(),
      db.classSessions.list(),
    ]);
  const out: FocusStudent[] = [];
  for (const s of students) {
    const en = enrollments.find((e) => e.student_id === s.id);
    const classRow = classes.find((c) => c.id === en?.class_id);
    const cat = inferCategory(s.id);
    const sessionIds = new Set(sessions.filter((cs) => cs.class_id === classRow?.id).map((cs) => cs.id));
    const att = attendance.filter((a) => a.student_id === s.id && sessionIds.has(a.class_session_id));
    const attRate = att.length
      ? att.filter((a) => a.status === 'present' || a.status === 'late').length / att.length
      : 1;
    const classAssignmentIds = doneAssignmentIds(
      assignments.filter((a) => a.class_id === classRow?.id),
      sessions,
    );
    const expected = classAssignmentIds.size;
    const done = submissions.filter(
      (sub) => sub.student_id === s.id && classAssignmentIds.has(sub.assignment_id) && sub.status !== 'pending',
    ).length;
    const subRate = expected ? done / expected : 1;
    const openConcerns = concerns.filter((c) => c.student_id === s.id && c.status !== 'resolved');
    const reasons: string[] = [];
    if (cat === 'behind') reasons.push('基础较弱需重点跟进');
    if (attRate < 0.85) reasons.push(`出勤率偏低（${Math.round(attRate * 100)}%）`);
    if (subRate < 0.8) reasons.push(`作业提交率偏低（${Math.round(subRate * 100)}%）`);
    openConcerns.forEach((c) => reasons.push(`关注事项：${c.type}`));
    if (reasons.length) {
      out.push({ student: s, classRow, category: cat, reasons, attendanceRate: attRate, submissionRate: subRate });
    }
  }
  // 排序：落后类别优先
  const rank: Record<StudentCategory, number> = { behind: 0, normal: 1, progress: 2, strong: 3 };
  return out.sort((a, b) => rank[a.category] - rank[b.category]);
}

export async function getUpcomingSessions(db: DataLayer, classId?: string): Promise<ClassSession[]> {
  const sessions = await db.classSessions.list();
  return sessions
    .filter((s) => (classId ? s.class_id === classId : true) && s.status === 'scheduled')
    .sort((a, b) => a.scheduled_start - b.scheduled_start);
}

export function attendanceSummary(att: Attendance[]): Record<string, number> {
  const r: Record<string, number> = { present: 0, late: 0, leave: 0, absent: 0 };
  for (const a of att) r[a.status] = (r[a.status] ?? 0) + 1;
  return r;
}

export function attendanceText(att: Attendance[]): string {
  const s = attendanceSummary(att);
  return Object.entries(s)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${ATTENDANCE_LABEL[k as keyof typeof ATTENDANCE_LABEL]} ${n}`)
    .join(' · ');
}

export interface AbilityHistoryPoint {
  assessed_at: number;
  level: string;
  source: string;
}

export async function getAbilityHistory(
  db: DataLayer,
  studentId: string,
  dimension: string,
): Promise<AbilityAssessment[]> {
  return db.getAbilityHistory(studentId, dimension as never);
}
