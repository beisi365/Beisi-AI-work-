import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useRepository } from '../hooks/useRepository';
import {
  Button,
  Card,
  Grid,
  LoadingState,
  PageHeader,
  ProgressBar,
  SectionTitle,
  Tag,
  Toast,
} from '../components/ui';
import { getClassesWithStats } from '../lib/queries';
import { ABILITY_LABEL, formatDate, rateText, SESSION_LABEL } from '../lib/format';
import { ENROLLMENT_STATUS } from '../lib/enrollment';
import { AttendanceRegisterModal, AttendanceHistoryModal } from '../components/StudentModals';
import { useDemoMode } from '../lib/demoMode';

export default function ClassesCoursesPage() {
  const navigate = useNavigate();
  const { principal } = useAuth();
  const actor = { actorId: principal?.teacherId ?? '', actorRole: 'teacher' as const };
  const { readOnly } = useDemoMode();
  const [toast, setToast] = useState('');
  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(''), 2600);
  };

  // 课次与出勤弹窗状态
  const [attOpen, setAttOpen] = useState(false);
  const [attClassId, setAttClassId] = useState('');
  const [attSessionId, setAttSessionId] = useState('');
  const [histOpen, setHistOpen] = useState(false);
  const [histClassId, setHistClassId] = useState('');
  const [histSessionId, setHistSessionId] = useState<string | null>(null);

  const openRegister = (classId: string, sessionId: string) => {
    setAttClassId(classId);
    setAttSessionId(sessionId);
    setAttOpen(true);
  };
  const openHistory = (classId: string, sessionId: string | null) => {
    setHistClassId(classId);
    setHistSessionId(sessionId);
    setHistOpen(true);
  };

  const { data, loading } = useRepository(
    ['classes', 'enrollments', 'attendance', 'submissions', 'assignments', 'class_sessions', 'courses', 'lessons', 'students'],
    async (db) => {
      const [classes, courses, lessons, sessions, attendance, enrollments, students] = await Promise.all([
        getClassesWithStats(db),
        db.courses.list(),
        db.lessons.list(),
        db.classSessions.list(),
        db.attendance.list(),
        db.enrollments.list(),
        db.students.list(),
      ]);
      return { classes, courses, lessons, sessions, attendance, enrollments, students };
    },
  );

  if (loading || !data) return <LoadingState />;

  const lessonById = new Map(data.lessons.map((l) => [l.id, l]));
  const studentById = new Map(data.students.map((s) => [s.id, s]));
  const enrolledOfClass = (classId: string) =>
    data.enrollments
      .filter((e) => e.class_id === classId && e.status === ENROLLMENT_STATUS.ACTIVE)
      .map((e) => studentById.get(e.student_id))
      .filter((s): s is NonNullable<typeof s> => !!s && !s.archived_at);

  return (
    <>
      <PageHeader title="班级与课程" desc="查看各班学情概览、课次出勤登记，以及课程的整体安排与课次能力维度" />

      <Grid min={300}>
        {data.classes.map((c) => (
          <Card key={c.classRow.id} title={c.classRow.name}>
            <div className="stack">
              <div className="spread">
                <span className="muted">负责教师</span>
                <span>{c.teacher?.name ?? '—'}</span>
              </div>
              <div className="spread">
                <span className="muted">课程</span>
                <span>{c.course?.title ?? '—'}</span>
              </div>
              <div className="spread">
                <span className="muted">学员人数</span>
                <strong>
                  {c.studentCount} / {c.classRow.capacity}
                </strong>
              </div>

              <div>
                <div className="spread">
                  <span className="muted">出勤率</span>
                  <strong style={{ color: 'var(--color-accent)' }}>{rateText(c.attendanceRate)}</strong>
                </div>
                <ProgressBar value={c.attendanceRate} tone="accent" />
              </div>

              <div>
                <div className="spread">
                  <span className="muted">提交率</span>
                  <strong style={{ color: 'var(--color-accent)' }}>{rateText(c.submissionRate)}</strong>
                </div>
                <ProgressBar value={c.submissionRate} tone="accent" />
              </div>

              <div>
                <div className="spread">
                  <span className="muted">完成率</span>
                  <strong style={{ color: 'var(--color-accent)' }}>{rateText(c.completionRate)}</strong>
                </div>
                <ProgressBar value={c.completionRate} tone="accent" />
              </div>

              <div className="spread">
                <span className="muted">计划</span>
                <span>{c.classRow.schedule}</span>
              </div>
              <div className="spread">
                <span className="muted">起止日期</span>
                <span>
                  {c.classRow.start_date} ~ {c.classRow.end_date}
                </span>
              </div>

              <Button variant="primary" size="sm" onClick={() => navigate(`/t/students?class=${c.classRow.id}`)}>
                查看学员
              </Button>
            </div>
          </Card>
        ))}
      </Grid>

      <SectionTitle>课次与出勤</SectionTitle>
      {data.classes.map((c) => {
        const sessionsOfClass = data.sessions
          .filter((s) => s.class_id === c.classRow.id)
          .sort((a, b) => b.scheduled_start - a.scheduled_start);
        const enrolled = enrolledOfClass(c.classRow.id);
        return (
          <Card
            key={`sess-${c.classRow.id}`}
            title={c.classRow.name}
            desc={`共 ${sessionsOfClass.length} 次课 · 在读 ${enrolled.length} 人`}
          >
            {sessionsOfClass.length === 0 ? (
              <div className="empty-compact">该班级暂无课次</div>
            ) : (
              <table className="ltable">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>课次</th>
                    <th>状态</th>
                    <th>考勤进度</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sessionsOfClass.map((s) => {
                    const recorded = data.attendance.filter((a) => a.class_session_id === s.id).length;
                    return (
                      <tr key={s.id}>
                        <td>{formatDate(s.scheduled_start)}</td>
                        <td>
                          <strong>{lessonById.get(s.lesson_id)?.title ?? '课程'}</strong>
                        </td>
                        <td>
                          <Tag tone={s.status === 'done' ? 'neutral' : s.status === 'scheduled' ? 'accent' : 'weak'}>
                            {SESSION_LABEL[s.status] ?? s.status}
                          </Tag>
                        </td>
                        <td className="muted">
                          已登记 {recorded}/{enrolled.length}
                        </td>
                        <td>
                          <div className="row-actions">
                            {!readOnly && (
                              <Button variant="primary" size="sm" onClick={() => openRegister(c.classRow.id, s.id)}>
                                登记出勤
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" onClick={() => openHistory(c.classRow.id, s.id)}>
                              查看出勤
                            </Button>
                            <span title="规划中">
                              <Button variant="ghost" size="sm" disabled>
                                教学记录
                              </Button>
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <div style={{ marginTop: 12 }}>
              <Button variant="ghost" size="sm" onClick={() => openHistory(c.classRow.id, null)}>
                本班出勤历史与累计出勤率
              </Button>
            </div>
          </Card>
        );
      })}

      <SectionTitle>课程与课次</SectionTitle>
      {data.courses.map((co) => {
        const ls = data.lessons
          .filter((l) => l.course_id === co.id)
          .sort((a, b) => a.seq - b.seq);
        return (
          <Card key={co.id} title={co.title} desc={co.target_audience}>
            <p className="muted" style={{ marginTop: 0 }}>
              {co.description}
            </p>
            <div>
              <table className="ltable">
                <thead>
                  <tr>
                    <th style={{ width: 56 }}>序号</th>
                    <th>课次</th>
                    <th>能力维度</th>
                    <th>预计时长</th>
                    <th>作业简述</th>
                  </tr>
                </thead>
                <tbody>
                  {ls.map((l) => (
                    <tr key={l.id}>
                      <td className="muted">{l.seq}</td>
                      <td>
                        <strong>{l.title}</strong>
                      </td>
                      <td>
                        <Tag tone="neutral">{ABILITY_LABEL[l.ability_dimension]}</Tag>
                      </td>
                      <td className="muted">{l.est_time}</td>
                      <td className="muted">{l.homework}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}

      <AttendanceRegisterModal
        open={attOpen}
        onClose={() => setAttOpen(false)}
        actor={actor}
        defaultClassId={attClassId}
        defaultSessionId={attSessionId}
        onSaved={() => flash('出勤已登记')}
      />
      <AttendanceHistoryModal
        open={histOpen}
        onClose={() => setHistOpen(false)}
        classId={histClassId}
        sessionId={histSessionId}
      />
      {toast && <Toast tone="success">{toast}</Toast>}
    </>
  );
}
