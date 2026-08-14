import { useNavigate } from 'react-router-dom';
import { useRepository } from '../hooks/useRepository';
import { Button, Card, EmptyState, Grid, LoadingState, PageHeader, ProgressBar, StatTile, Tag } from '../components/ui';
import { RankBar } from '../components/charts';
import {
  getClassesWithStats,
  getFocusStudents,
  getUpcomingSessions,
} from '../lib/queries';
import { CATEGORY_LABEL, CATEGORY_TONE } from '../lib/format';
import type { DifficultyRow } from '../data/repository/DataLayer';
import type { ClassSession } from '../data/types';
import { formatDate, rateText, SESSION_LABEL } from '../lib/format';

function mergeDifficulties(lists: DifficultyRow[]): DifficultyRow[] {
  const map = new Map<string, DifficultyRow>();
  for (const d of lists) {
    const cur = map.get(d.problem);
    if (cur) {
      cur.count += d.count;
      cur.affectedStudents = Array.from(new Set([...cur.affectedStudents, ...d.affectedStudents]));
    } else {
      map.set(d.problem, { ...d, affectedStudents: [...d.affectedStudents] });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export default function TeacherOverviewPage() {
  const navigate = useNavigate();
  const { data, loading } = useRepository(
    ['classes', 'students', 'enrollments', 'attendance', 'submissions', 'assignments', 'class_sessions', 'concerns', 'learning_records', 'lessons'],
    async (d) => {
      const [classes, focus, upcoming, d1, d2, subs] = await Promise.all([
        getClassesWithStats(d),
        getFocusStudents(d),
        getUpcomingSessions(d),
        d.getHighFreqDifficulties('cl1'),
        d.getHighFreqDifficulties('cl2'),
        d.submissions.list(),
      ]);
      const difficulties = mergeDifficulties([...d1, ...d2]);
      const avgAtt =
        classes.reduce((s, c) => s + c.attendanceRate, 0) / (classes.length || 1);
      const avgSub =
        classes.reduce((s, c) => s + c.submissionRate, 0) / (classes.length || 1);
      const avgComp =
        classes.reduce((s, c) => s + c.completionRate, 0) / (classes.length || 1);
      // 待批改：学员已提交、教师尚未评定（to_review）。submitted 已合并入 to_review。
      const pendingGrading = subs.filter((s) => s.status === 'to_review').length;
      return { classes, focus, upcoming, difficulties, avgAtt, avgSub, avgComp, pendingGrading };
    },
  );

  if (loading || !data) return <LoadingState />;

  const totalStudents = data.classes.reduce((s, c) => s + c.studentCount, 0);
  const focusByClass = (classId: string) =>
    data.focus.filter((f) => f.classRow?.id === classId).length;

  return (
    <>
      <PageHeader
        title="教学总览"
        desc="今天要跟进什么、哪些学员需要关注、班级目前学得怎么样"
        actions={
          <>
            <Button variant="primary" onClick={() => navigate('/t/works')}>
              去批改作业
            </Button>
            <Button onClick={() => navigate('/t/students')}>学员档案</Button>
          </>
        }
      />

      {/* 顶部指标：普通指标不使用橙色，仅作信息呈现；5 项等分一行，移动端受控两列对齐 */}
      <div className="overview-stats">
        <StatTile label="班级数" value={data.classes.length} />
        <StatTile label="学员总数" value={totalStudents} />
        <StatTile label="平均出勤率" value={rateText(data.avgAtt)} />
        <StatTile label="平均提交率" value={rateText(data.avgSub)} />
        <StatTile label="平均完成率" value={rateText(data.avgComp)} />
      </div>

      {/* 今日待办：橙色用于重点行动与待办 */}
      <SectionWrap title="今日待办">
        <Card>
          <div className="todo-top">
            <div className="todo-grade">
              <span className="todo-num">{data.pendingGrading}</span>
              <span className="todo-unit">份作业待批改</span>
            </div>
            <Button variant="primary" size="sm" onClick={() => navigate('/t/works')}>
              去批改作业
            </Button>
          </div>
          <div className="divider" />
          <div className="sub-label">需关注学员</div>
          {data.focus.length === 0 ? (
            <div className="empty-compact">暂无需要特别关注的学员</div>
          ) : (
            <div className="list">
              {data.focus.map((f) => (
                <div
                  key={f.student.id}
                  className="list-item clickable"
                  onClick={() => navigate(`/t/students/${f.student.id}`)}
                >
                  <div className="focus-main">
                    <div className="row" style={{ gap: 8 }}>
                      <strong>{f.student.nickname}</strong>
                      <span className="focus-cat"><Tag tone={CATEGORY_TONE[f.category]}>{CATEGORY_LABEL[f.category]}</Tag></span>
                      {f.classRow && <span className="muted">{f.classRow.name}</span>}
                    </div>
                    <div className="muted focus-risk">
                      {f.reasons[0]}
                      {f.reasons.length > 1 && (
                        <span className="focus-diag"> · {f.reasons.slice(1).join(' · ')}</span>
                      )}
                    </div>
                  </div>
                  <div className="focus-metrics">
                    <span className="metric">
                      <b>{rateText(f.attendanceRate)}</b>
                      <i>出勤</i>
                    </span>
                    <span className="metric">
                      <b>{rateText(f.submissionRate)}</b>
                      <i>提交</i>
                    </span>
                    <Tag tone="accent">档案</Tag>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </SectionWrap>

      {/* 高频学习困难：无数据时缩短卡片高度 */}
      <SectionWrap title="高频学习困难">
        <Card desc="来自课堂学习记录，按出现次数排序（非词云）">
          {data.difficulties.filter((d) => d.count > 0).length === 0 ? (
            <div className="empty-compact">暂无学习困难记录</div>
          ) : (
            <div>
              {data.difficulties
                .filter((d) => d.count > 0)
                .slice(0, 8)
                .map((d) => (
                  <RankBar
                    key={d.problem}
                    label={d.problem}
                    count={d.count}
                    max={data.difficulties[0]?.count || 1}
                    hint={`影响 ${d.affectedStudents.length} 名学员 · 建议：${d.suggestedAction}`}
                  />
                ))}
            </div>
          )}
        </Card>
      </SectionWrap>

      <SectionWrap title="班级目前学得怎么样">
        <Grid min={300}>
          {data.classes.map((c) => (
            <Card
              key={c.classRow.id}
              title={c.classRow.name}
              desc={c.teacher?.name}
              actions={<Tag tone="neutral">{c.course?.title}</Tag>}
            >
              <div className="stack">
                <div className="spread">
                  <span className="muted">学员</span>
                  <strong>{c.studentCount} 人</strong>
                </div>
                <div className="spread">
                  <span className="muted">出勤率</span>
                  <strong>{rateText(c.attendanceRate)}</strong>
                </div>
                <div className="spread">
                  <span className="muted">提交率</span>
                  <strong>{rateText(c.submissionRate)}</strong>
                </div>
                <div className="spread">
                  <span className="muted">完成率</span>
                  <strong>{rateText(c.completionRate)}</strong>
                </div>
                <div>
                  <div className="spread" style={{ marginBottom: 6 }}>
                    <span className="muted">课程进度</span>
                    <span className="muted">{Math.round(c.courseProgress * 100)}%</span>
                  </div>
                  <ProgressBar value={c.courseProgress} showLabel={false} />
                </div>
                <div className="spread">
                  <span className="muted">需关注</span>
                  {focusByClass(c.classRow.id) > 0 ? (
                    <Tag tone="danger">{focusByClass(c.classRow.id)} 人</Tag>
                  ) : (
                    <span className="muted">0</span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/t/students?class=${c.classRow.id}`)}
                >
                  查看班级学员
                </Button>
              </div>
            </Card>
          ))}
        </Grid>
      </SectionWrap>

      <SectionWrap title="近期课程安排">
        <Card>
          {data.upcoming.length === 0 ? (
            <EmptyState title="近期暂无排课" />
          ) : (
            <div className="list">
              {data.upcoming.slice(0, 6).map((s: ClassSession) => (
                <SessionLine key={s.id} s={s} />
              ))}
            </div>
          )}
        </Card>
      </SectionWrap>
    </>
  );
}

function SectionWrap({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="section-title">{title}</h2>
      {children}
    </section>
  );
}

function SessionLine({ s }: { s: ClassSession }) {
  return (
    <div className="list-item">
      <div>
        <div className="row" style={{ gap: 8 }}>
          <strong>{formatDate(s.scheduled_start)}</strong>
          <Tag tone="weak">{SESSION_LABEL[s.status]}</Tag>
        </div>
        <div className="muted" style={{ fontSize: 'var(--fs-secondary)' }}>
          {s.location} · {s.delivery_mode === 'online' ? '线上' : s.delivery_mode === 'offline' ? '线下' : '混合'}
        </div>
      </div>
      <span className="muted">{formatDate(s.scheduled_start)}</span>
    </div>
  );
}
