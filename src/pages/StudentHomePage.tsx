import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useRepository } from '../hooks/useRepository';
import { Button, Card, EmptyState, LoadingState, PageHeader, StatTile, Tag } from '../components/ui';
import { RankBar } from '../components/charts';
import { getStudentDashboard, getUpcomingSessions } from '../lib/queries';
import { formatDate, rateText, SUBMISSION_LABEL, SUBMISSION_TONE } from '../lib/format';
import type { ClassSession } from '../data/types';

export default function StudentHomePage() {
  const { principal } = useAuth();
  const navigate = useNavigate();
  const sid = principal?.studentId ?? '';

  const { data, loading } = useRepository(
    ['students', 'enrollments', 'classes', 'attendance', 'submissions', 'assignments', 'lessons', 'class_sessions', 'learning_records'],
    async (d) => {
      const dash = await getStudentDashboard(d, sid);
      const upcoming = await getUpcomingSessions(d, dash.classRow?.id);
      const difficulties = dash.classRow ? await d.getHighFreqDifficulties(dash.classRow.id) : [];
      const doneSessions = (await d.classSessions.list()).filter(
        (s) => s.class_id === dash.classRow?.id && s.status === 'done',
      ).length;
      return { dash, upcoming, difficulties, doneSessions };
    },
  );

  if (loading || !data) return <LoadingState />;
  const { dash, upcoming, difficulties, doneSessions } = data;
  const pending = dash.submissions.filter((s) => s.status === 'pending');

  return (
    <>
      <PageHeader
        title={`${dash.student.nickname}的学习首页`}
        desc={dash.classRow ? `${dash.classRow.name} · 今天也加油` : '我的学习中心'}
        actions={
          <>
            <Button variant="primary" onClick={() => navigate('/s/works')}>
              去交作业
            </Button>
            <Button onClick={() => navigate('/s/course-map')}>课程地图</Button>
            <Button onClick={() => navigate('/s/timeline')}>我的时间线</Button>
          </>
        }
      />

      <div className="stat-grid">
        <StatTile label="我的出勤率" value={rateText(dash.attendanceRate)} accent />
        <StatTile label="我的提交率" value={rateText(dash.submissionRate)} accent />
        <StatTile label="我的完成率" value={rateText(dash.completionRate)} accent />
        <StatTile label="已完成课节" value={doneSessions} />
        <StatTile label="待提交作业" value={pending.length} accent={pending.length > 0} />
      </div>

      <div className="two-col" style={{ marginTop: 'var(--sp-4)' }}>
        <Card title="今天 / 近期要做什么" desc="待提交作业与近期课程">
          {pending.length === 0 && upcoming.length === 0 ? (
            <EmptyState title="暂时没有待办，继续保持" />
          ) : (
            <div className="list">
              {pending.map((s) => (
                <div key={s.id} className="list-item clickable" onClick={() => navigate('/s/works')}>
                  <div>
                    <div className="row" style={{ gap: 8 }}>
                      <strong>{s.assignment?.title ?? '作业'}</strong>
                      <Tag tone={SUBMISSION_TONE[s.status]}>{SUBMISSION_LABEL[s.status]}</Tag>
                    </div>
                    <div className="muted" style={{ fontSize: 'var(--fs-secondary)' }}>
                      {s.lesson?.title}
                    </div>
                  </div>
                  <Tag tone="accent">去提交</Tag>
                </div>
              ))}
              {upcoming.slice(0, 4).map((s: ClassSession) => (
                <div key={s.id} className="list-item">
                  <div>
                    <div className="row" style={{ gap: 8 }}>
                      <strong>{formatDate(s.scheduled_start)} 课程</strong>
                    </div>
                    <div className="muted" style={{ fontSize: 'var(--fs-secondary)' }}>
                      {s.location}
                    </div>
                  </div>
                  <Tag tone="neutral">待上课</Tag>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="课堂学习困难排行" desc="本班高频问题（标注了我遇到的）">
          {difficulties.filter((x) => x.count > 0).length === 0 ? (
            <div className="empty-compact">暂无学习困难记录</div>
          ) : (
            <div>
              {difficulties
                .filter((x) => x.count > 0)
                .slice(0, 6)
                .map((x) => (
                  <RankBar
                    key={x.problem}
                    label={x.problem}
                    count={x.count}
                    max={difficulties[0]?.count || 1}
                    highlight={x.affectedStudents.includes(sid)}
                    hint={x.affectedStudents.includes(sid) ? '我在其中 · 建议：' + x.suggestedAction : undefined}
                  />
                ))}
            </div>
          )}
        </Card>
      </div>

      <section>
        <h2 className="section-title">我的进度</h2>
        <Card title="能力雷达（当前水平）" desc="六维能力，越靠右越强">
          <div className="ability-grid">
            {Object.entries(dash.ability).map(([dim, lvl]) => (
              <div key={dim} className="ability-cell">
                <div className="ac-top">
                  <span className="ac-name">{dimLabel(dim)}</span>
                  <span className="ac-level">{lvl ?? '—'}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </>
  );
}

function dimLabel(d: string): string {
  const map: Record<string, string> = {
    basics: '基础认知',
    requirement: '需求拆解',
    prompt: '提示词',
    operation: '工具操作',
    judgement: '判断甄别',
    application: '应用落地',
  };
  return map[d] ?? d;
}
