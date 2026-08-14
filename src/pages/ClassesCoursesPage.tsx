import { useNavigate } from 'react-router-dom';
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
} from '../components/ui';
import { getClassesWithStats } from '../lib/queries';
import { ABILITY_LABEL, rateText } from '../lib/format';

export default function ClassesCoursesPage() {
  const navigate = useNavigate();
  const { data, loading } = useRepository(
    ['classes', 'enrollments', 'attendance', 'submissions', 'assignments', 'class_sessions', 'courses', 'lessons'],
    async (db) => {
      const [classes, courses, lessons] = await Promise.all([
        getClassesWithStats(db),
        db.courses.list(),
        db.lessons.list(),
      ]);
      return { classes, courses, lessons };
    },
  );

  if (loading || !data) return <LoadingState />;

  return (
    <>
      <PageHeader title="班级与课程" desc="查看各班学情概览，以及课程的整体安排与课次能力维度" />

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
    </>
  );
}
