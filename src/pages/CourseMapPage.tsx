import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useRepository } from '../hooks/useRepository';
import { PageHeader, Card, SectionTitle, Tag, Field, LoadingState, EmptyState } from '../components/ui';
import { RankBar } from '../components/charts';
import { ABILITY_LABEL } from '../lib/format';

export default function CourseMapPage() {
  const { principal } = useAuth();
  const navigate = useNavigate();
  const prefix = principal?.role === 'student' ? '/s' : '/t';
  const isStudent = principal?.role === 'student';
  const studentId = principal?.studentId;

  const { data, loading } = useRepository(
    ['courses', 'lessons', 'class_sessions', 'enrollments', 'classes'],
    async (db) => {
      const [courses, lessons, sessions, enrollments, classes] = await Promise.all([
        db.courses.list(),
        db.lessons.list(),
        db.classSessions.list(),
        db.enrollments.list(),
        db.classes.list(),
      ]);
      const course = courses.find((c) => c.id === 'co1') ?? courses[0];
      const courseLessons = (course ? lessons.filter((l) => l.course_id === course.id) : lessons)
        .slice()
        .sort((a, b) => a.seq - b.seq);

      let studentClassId: string | undefined;
      if (isStudent && studentId) {
        studentClassId = enrollments.find((e) => e.student_id === studentId)?.class_id;
      }
      const scopeSessions = isStudent
        ? sessions.filter((s) => s.class_id === studentClassId)
        : sessions;
      const doneLessonIds = new Set(
        scopeSessions.filter((s) => s.status === 'done').map((s) => s.lesson_id),
      );

      let currentLessonId: string | null = null;
      for (const l of courseLessons) {
        if (!doneLessonIds.has(l.id)) {
          currentLessonId = l.id;
          break;
        }
      }

      const classId = isStudent ? studentClassId : classes[0]?.id;
      const difficulties = classId ? await db.getHighFreqDifficulties(classId) : [];
      return { course, lessons: courseLessons, doneLessonIds, currentLessonId, difficulties, isStudent, studentClassId };
    },
  );

  if (loading || !data) return <LoadingState />;

  const { course, lessons, doneLessonIds, currentLessonId, difficulties } = data;

  if (lessons.length === 0) {
    return (
      <div>
        <PageHeader title="课程地图" desc="12 节 AI 应用实战课，点击进入 AI 实操教室" />
        <EmptyState title="暂无课程数据" hint="数据层尚未生成课次内容。" />
      </div>
    );
  }

  const maxCount = difficulties.reduce((m, d) => Math.max(m, d.count), 0) || 1;

  return (
    <div>
      <PageHeader title="课程地图" desc="12 节 AI 应用实战课，点击进入 AI 实操教室" />

      {course && (
        <Card title={course.title} desc={course.description}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            <Field label="总课节">
              <Tag tone="accent">{course.total_lessons} 节</Tag>
            </Field>
            <Field label="目标人群">{course.target_audience || '—'}</Field>
          </div>
        </Card>
      )}

      <SectionTitle>课程地图</SectionTitle>
      <div className="map-grid">
        {lessons.map((l) => {
          const done = doneLessonIds.has(l.id);
          const current = !done && l.id === currentLessonId;
          const cls = ['map-node'];
          if (done) cls.push('map-node--done');
          else if (current) cls.push('map-node--current');
          return (
            <div
              key={l.id}
              className={cls.join(' ')}
              onClick={() => navigate(`${prefix}/course-map/${l.id}`)}
              style={{ cursor: 'pointer' }}
            >
              <div className="map-seq">第 {l.seq} 节</div>
              <div className="card-title">{l.title}</div>
              <div>
                <Tag tone="neutral">{ABILITY_LABEL[l.ability_dimension]}</Tag>
              </div>
              <div className="muted">预计时长：{l.est_time || '—'}</div>
              <div className="muted">作业：{l.homework || '—'}</div>
            </div>
          );
        })}
      </div>

      {difficulties.length > 0 && (
        <Card title="高频学习困难排行" desc={isStudent ? '橙色为与你相关的困难项' : '按出现频次排序'}>
          {difficulties.map((d) => {
            const highlight = isStudent && studentId ? d.affectedStudents.includes(studentId) : false;
            return (
              <RankBar
                key={d.problem}
                label={d.problem}
                count={d.count}
                max={maxCount}
                hint={d.suggestedAction}
                highlight={highlight}
              />
            );
          })}
        </Card>
      )}
    </div>
  );
}
