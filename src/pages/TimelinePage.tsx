import { useMemo, useState } from 'react';
import { db } from '../data/repository';
import { useAuth } from '../auth/AuthContext';
import { useRepository } from '../hooks/useRepository';
import { Button, EmptyState, LoadingState, PageHeader, Tag } from '../components/ui';
import { formatDate } from '../lib/format';
import { useDemoMode } from '../lib/demoMode';
import type { AttendanceStatus, ClassSession, LearningRecord, Lesson } from '../data/types';

/** 合并后的时间线条目：已有学习记录 / 缺席无记录 / 已到课但记录待补 */
interface TimelineEntry {
  id: string;
  studentId: string;
  nickname: string;
  className: string;
  session?: ClassSession;
  lesson?: Lesson;
  attendanceStatus?: AttendanceStatus;
  record?: LearningRecord;
}

export default function TimelinePage() {
  const { principal } = useAuth();
  const isTeacher = principal?.role === 'teacher' || principal?.role === 'admin';
  const studentId = principal?.studentId;

  const [classFilter, setClassFilter] = useState('all');
  const [studentFilter, setStudentFilter] = useState('all');
  const [editing, setEditing] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const { readOnly } = useDemoMode();

  const { data, loading } = useRepository(
    ['learning_records', 'attendance', 'class_sessions', 'lessons', 'students', 'enrollments', 'classes'],
    async (d) => {
      const [records, attendance, sessions, lessons, students, enrollments, classes] = await Promise.all([
        d.learningRecords.list(),
        d.attendance.list(),
        d.classSessions.list(),
        d.lessons.list(),
        d.students.list(),
        d.enrollments.list(),
        d.classes.list(),
      ]);
      const sessionMap = new Map(sessions.map((s) => [s.id, s]));
      const lessonMap = new Map(lessons.map((l) => [l.id, l]));
      const studentMap = new Map(students.map((s) => [s.id, s]));
      const classMap = new Map(classes.map((c) => [c.id, c]));
      const studentClass = new Map(enrollments.map((e) => [e.student_id, e.class_id]));

      // 已有学习记录的条目
      const recordEntries: TimelineEntry[] = records.map((r) => {
        const session = sessionMap.get(r.class_session_id);
        const lesson = session ? lessonMap.get(session.lesson_id) : undefined;
        const st = studentMap.get(r.student_id);
        const cid = studentClass.get(r.student_id);
        return {
          id: r.id,
          studentId: r.student_id,
          nickname: st?.nickname ?? '未知学员',
          className: (cid ? classMap.get(cid) : undefined)?.name ?? '—',
          session,
          lesson,
          record: r,
        };
      });

      // 以考勤为基准补全：缺席无记录 / 已到课但记录待补
      const lrKeySet = new Set(records.map((r) => `${r.class_session_id}:${r.student_id}`));
      const placeholderEntries: TimelineEntry[] = [];
      for (const a of attendance) {
        const session = sessionMap.get(a.class_session_id);
        if (!session || session.status !== 'done') continue;
        const key = `${a.class_session_id}:${a.student_id}`;
        const hasRecord = lrKeySet.has(key);
        if (a.status === 'absent' || !hasRecord) {
          const st = studentMap.get(a.student_id);
          const cid = studentClass.get(a.student_id);
          placeholderEntries.push({
            id: a.id,
            studentId: a.student_id,
            nickname: st?.nickname ?? '未知学员',
            className: (cid ? classMap.get(cid) : undefined)?.name ?? '—',
            session,
            lesson: session ? lessonMap.get(session.lesson_id) : undefined,
            attendanceStatus: a.status,
            record: undefined,
          });
        }
      }

      const entries = [...recordEntries, ...placeholderEntries];
      return { entries, students, classes, enrollments };
    },
  );

  // —— 班级筛选联动学员下拉（hook 必须在提前返回之前，避免条件 hook）——
  const studentOptions = useMemo(() => {
    if (!isTeacher || !data) return [];
    const { students, enrollments } = data;
    if (classFilter !== 'all') {
      const ids = new Set(
        enrollments.filter((e) => e.class_id === classFilter).map((e) => e.student_id),
      );
      return students.filter((s) => ids.has(s.id));
    }
    return students;
  }, [isTeacher, classFilter, data]);

  // —— 可见记录：按角色/筛选过滤并倒序 ——
  const visible = useMemo(() => {
    if (!data) return [];
    let list = data.entries;
    if (!isTeacher) {
      list = list.filter((j) => j.studentId === studentId);
    } else {
      if (studentFilter !== 'all') {
        list = list.filter((j) => j.studentId === studentFilter);
      }
      if (classFilter !== 'all') {
        const classStudentIds = new Set(
          data.enrollments.filter((e) => e.class_id === classFilter).map((e) => e.student_id),
        );
        list = list.filter((j) => classStudentIds.has(j.studentId));
      }
    }
    return [...list].sort(
      (a, b) => (b.session?.scheduled_start ?? 0) - (a.session?.scheduled_start ?? 0),
    );
  }, [data, isTeacher, studentFilter, classFilter, studentId]);

  if (loading || !data) return <LoadingState />;
  const { classes } = data;

  return (
    <>
      <PageHeader title="学习时间线" desc="按课程时间回溯每位学员的课堂表现与成长轨迹（含缺席与待补场次）" />

      <div className="filters">
        {isTeacher ? (
          <>
            <select
              className="select"
              value={classFilter}
              onChange={(e) => {
                setClassFilter(e.target.value);
                setStudentFilter('all');
              }}
            >
              <option value="all">全部班级</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="select"
              value={studentFilter}
              onChange={(e) => setStudentFilter(e.target.value)}
            >
              <option value="all">全部学员</option>
              {studentOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nickname}
                </option>
              ))}
            </select>
          </>
        ) : (
          <span className="muted">以下是你自己的学习记录</span>
        )}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="暂无学习记录"
          hint={isTeacher ? '当前筛选条件下没有记录' : '你还没有学习记录'}
        />
      ) : (
        <div className="timeline">
          {visible.map((j) => {
            const isAbsent = j.attendanceStatus === 'absent';
            if (!j.record) {
              return (
                <div key={j.id} className="tl-item">
                  <div className="tl-date">{formatDate(j.session?.scheduled_start)}</div>
                  <div className="tl-title">
                    {j.lesson?.title ?? '课程'}
                    {isTeacher && (
                      <span className="muted" style={{ marginLeft: 8 }}>
                        {j.nickname} · {j.className}
                      </span>
                    )}
                  </div>
                  <div className="col" style={{ gap: 4, fontSize: 'var(--fs-secondary)' }}>
                    <Tag tone={isAbsent ? 'danger' : 'accent'}>
                      {isAbsent ? '缺席无记录' : '已到课但记录待补'}
                    </Tag>
                    <span>
                      {isAbsent
                        ? '该场次学员缺席，不产生课堂学习记录。'
                        : '学员已出勤，但本场学习记录尚未填写（教师可补全）。'}
                    </span>
                  </div>
                </div>
              );
            }
            const r = j.record;
            return (
              <div key={j.id} className="tl-item">
                <div className="tl-date">{formatDate(j.session?.scheduled_start)}</div>
                <div className="tl-title">{j.lesson?.title ?? '课程'}</div>
                {isTeacher && (
                  <div className="muted" style={{ fontSize: 'var(--fs-secondary)' }}>
                    {j.nickname} · {j.className}
                  </div>
                )}
                <div className="col" style={{ gap: 4, fontSize: 'var(--fs-secondary)' }}>
                  <span>预习：{r.prep}</span>
                  <span>练习完成度：{r.exercise_completion}</span>
                  <span>课堂问题：{r.problems}</span>
                  {r.need_help && <Tag tone="danger">需要帮助</Tag>}
                  <span>教师建议：{r.next_suggestion}</span>

                  {isTeacher && !readOnly && (
                    <div className="form-row" style={{ marginTop: 6 }}>
                      <label>教师观察（内部）</label>
                      {editing === r.id ? (
                        <div>
                          <textarea
                            className="textarea"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="记录课堂内部观察…"
                          />
                          <div className="row" style={{ marginTop: 6 }}>
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={async () => {
                                await db.learningRecords.update(r.id, {
                                  teacher_observation: note,
                                });
                                setEditing(null);
                              }}
                            >
                              保存
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                              取消
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="row" style={{ justifyContent: 'space-between' }}>
                          <span>{r.teacher_observation || '（未填写）'}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setNote(r.teacher_observation);
                              setEditing(r.id);
                            }}
                          >
                            编辑观察
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
