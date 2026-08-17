import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useRepository } from '../hooks/useRepository';
import {
  Button,
  Card,
  EmptyState,
  Grid,
  LoadingState,
  PageHeader,
  ProgressBar,
  StatTile,
  Tag,
  Toast,
} from '../components/ui';
import { RankBar } from '../components/charts';
import { getTeacherOverview, type TeacherOverview } from '../lib/queries';
import { CATEGORY_LABEL, CATEGORY_TONE, formatDate, rateText, SESSION_LABEL } from '../lib/format';
import type { ClassSession } from '../data/types';
import { StudentCreateModal, AttendanceRegisterModal, TeacherObservationModal } from '../components/StudentModals';

export default function TeacherOverviewPage() {
  const navigate = useNavigate();
  const { principal } = useAuth();
  const actor = { actorId: principal?.teacherId ?? '', actorRole: 'teacher' as const };

  // —— 快捷操作弹窗状态 ——
  const [createOpen, setCreateOpen] = useState(false);
  const [attOpen, setAttOpen] = useState(false);
  const [obsOpen, setObsOpen] = useState(false);
  const [toast, setToast] = useState('');
  const flash = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(''), 2600);
  };

  // 所有数字均来自真实查询（getTeacherOverview 组合 DataLayer 读取）
  const { data, loading } = useRepository(
    [
      'classes',
      'teachers',
      'courses',
      'students',
      'enrollments',
      'class_sessions',
      'attendance',
      'submissions',
      'assignments',
      'lessons',
      'ability_assessments',
      'concerns',
      'learning_records',
    ],
    async (d) => getTeacherOverview(d),
  );

  if (loading || !data) return <LoadingState />;
  const ov: TeacherOverview = data;

  const focusByClass = (classId: string) => ov.focusStudents.filter((f) => f.classRow?.id === classId).length;

  return (
    <>
      <PageHeader
        title="教学总览"
        desc="今天要跟进什么、哪些学员需要关注、班级目前学得怎么样"
      />

      {/* 快捷操作：均进入现有真实页面或弹窗；批量导入为规划项，不实现上传 */}
      <Card>
        <div className="quick-actions">
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
            + 新增学员
          </Button>
          <Button size="sm" onClick={() => setAttOpen(true)}>
            登记出勤
          </Button>
          <Button size="sm" onClick={() => navigate('/t/works')}>
            登记作品
          </Button>
          <Button size="sm" onClick={() => navigate('/t/assessments')}>
            发起考核
          </Button>
          <Button size="sm" onClick={() => setObsOpen(true)}>
            添加教师观察
          </Button>
          <span title="规划中：批量导入将在后续阶段开放">
            <Button size="sm" variant="ghost" disabled>
              批量导入（规划中）
            </Button>
          </span>
        </div>
      </Card>

      {/* 顶部指标：5 项等分一行，移动端受控两列对齐 */}
      <div className="overview-stats">
        <StatTile label="班级数" value={ov.classes.length} />
        <StatTile label="学员总数" value={ov.totalStudents} />
        <StatTile label="平均出勤率" value={rateText(ov.avgAttendanceRate)} />
        <StatTile label="平均提交率" value={rateText(ov.avgSubmissionRate)} />
        <StatTile label="平均完成率" value={rateText(ov.avgCompletionRate)} />
      </div>

      {/* 今日与待办：橙色用于重点行动 */}
      <SectionWrap title="今日与待办">
        <div className="todo-grid">
          <TodoTile
            num={ov.todaySessions.length}
            unit="节今日课程"
            onClick={() => navigate('/t/classes')}
          />
          <TodoTile
            num={ov.pendingGrading}
            unit="份待批作业"
            accent
            onClick={() => navigate('/t/works')}
          />
          <TodoTile
            num={ov.attendanceToRegister.length}
            unit="场待登记出勤"
            accent
            onClick={() => setAttOpen(true)}
          />
          <TodoTile
            num={ov.pendingAssessments}
            unit="项待完成考核"
            accent
            onClick={() => navigate('/t/assessments')}
          />
        </div>
      </SectionWrap>

      {/* 重点关注学员 */}
      <SectionWrap title="重点关注学员">
        <Card>
          {ov.focusStudents.length === 0 ? (
            <div className="empty-compact">暂无需要特别关注的学员</div>
          ) : (
            <div className="list">
              {ov.focusStudents.map((f) => (
                <div
                  key={f.student.id}
                  className="list-item clickable"
                  onClick={() => navigate(`/t/students/${f.student.id}`)}
                >
                  <div className="focus-main">
                    <div className="row" style={{ gap: 8 }}>
                      <strong>{f.student.nickname}</strong>
                      <span className="focus-cat">
                        <Tag tone={CATEGORY_TONE[f.category]}>{CATEGORY_LABEL[f.category]}</Tag>
                      </span>
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

      {/* 连续缺席学员 */}
      <SectionWrap title="连续缺席学员">
        <Card desc="最长连续缺席 ≥ 2 场的学员">
          {ov.consecutiveAbsent.length === 0 ? (
            <div className="empty-compact">暂无连续缺席学员</div>
          ) : (
            <div className="list">
              {ov.consecutiveAbsent.map((x) => (
                <div
                  key={x.student.id}
                  className="list-item clickable"
                  onClick={() => navigate(`/t/students/${x.student.id}`)}
                >
                  <div className="focus-main">
                    <div className="row" style={{ gap: 8 }}>
                      <strong>{x.student.nickname}</strong>
                      {x.classRow && <span className="muted">{x.classRow.name}</span>}
                    </div>
                    <div className="muted">连续缺席 {x.count} 场</div>
                  </div>
                  <Tag tone="danger">需跟进</Tag>
                </div>
              ))}
            </div>
          )}
        </Card>
      </SectionWrap>

      {/* 长期未提交作品学员 */}
      <SectionWrap title="长期未提交作品学员">
        <Card desc="存在「已上场次作业」仍为待提交状态的学员">
          {ov.longNoSubmission.length === 0 ? (
            <div className="empty-compact">暂无长期未提交作品的学员</div>
          ) : (
            <div className="list">
              {ov.longNoSubmission.map((x) => (
                <div
                  key={x.student.id}
                  className="list-item clickable"
                  onClick={() => navigate(`/t/students/${x.student.id}`)}
                >
                  <div className="focus-main">
                    <div className="row" style={{ gap: 8 }}>
                      <strong>{x.student.nickname}</strong>
                      {x.classRow && <span className="muted">{x.classRow.name}</span>}
                    </div>
                    <div className="muted">{x.pendingCount} 份作业待提交</div>
                  </div>
                  <Tag tone="danger">待提交</Tag>
                </div>
              ))}
            </div>
          )}
        </Card>
      </SectionWrap>

      {/* 最近新增学员 */}
      <SectionWrap title="最近新增学员">
        <Card desc="演示“现在”前 30 天内创建的学员">
          {ov.recentStudents.length === 0 ? (
            <div className="empty-compact">近期暂无新增学员</div>
          ) : (
            <div className="list">
              {ov.recentStudents.map((s) => (
                <div
                  key={s.id}
                  className="list-item clickable"
                  onClick={() => navigate(`/t/students/${s.id}`)}
                >
                  <div className="focus-main">
                    <div className="row" style={{ gap: 8 }}>
                      <strong>{s.nickname}</strong>
                    </div>
                    <div className="muted">创建于 {formatDate(s.created_at ?? 0)}</div>
                  </div>
                  <Tag tone="neutral">查看</Tag>
                </div>
              ))}
            </div>
          )}
        </Card>
      </SectionWrap>

      {/* 即将结业班级 */}
      <SectionWrap title="即将结业班级">
        <Card desc="演示“现在”起 30 天内结课且在进行中的班级">
          {ov.graduatingClasses.length === 0 ? (
            <div className="empty-compact">近期暂无即将结业的班级</div>
          ) : (
            <div className="list">
              {ov.graduatingClasses.map((g) => (
                <div key={g.classRow.id} className="list-item clickable" onClick={() => navigate(`/t/students?class=${g.classRow.id}`)}>
                  <div className="focus-main">
                    <div className="row" style={{ gap: 8 }}>
                      <strong>{g.classRow.name}</strong>
                      <span className="muted">{g.studentCount} 名在读</span>
                    </div>
                    <div className="muted">还剩 {g.daysLeft} 天结课</div>
                  </div>
                  <Tag tone="accent">查看班级</Tag>
                </div>
              ))}
            </div>
          )}
        </Card>
      </SectionWrap>

      {/* 今日课程 */}
      <SectionWrap title="今日课程">
        <Card>
          {ov.todaySessions.length === 0 ? (
            <EmptyState title="今日暂无排课" />
          ) : (
            <div className="list">
              {ov.todaySessions.map((s: ClassSession) => (
                <SessionLine key={s.id} s={s} />
              ))}
            </div>
          )}
        </Card>
      </SectionWrap>

      {/* 近期课程安排 */}
      <SectionWrap title="近期课程安排">
        <Card>
          {ov.upcomingSessions.length === 0 ? (
            <EmptyState title="近期暂无排课" />
          ) : (
            <div className="list">
              {ov.upcomingSessions.slice(0, 6).map((s: ClassSession) => (
                <SessionLine key={s.id} s={s} />
              ))}
            </div>
          )}
        </Card>
      </SectionWrap>

      {/* 高频学习困难 */}
      <SectionWrap title="高频学习困难">
        <Card desc="来自课堂学习记录，按出现次数排序（非词云）">
          {ov.difficulties.filter((d) => d.count > 0).length === 0 ? (
            <div className="empty-compact">暂无学习困难记录</div>
          ) : (
            <div>
              {ov.difficulties
                .filter((d) => d.count > 0)
                .slice(0, 8)
                .map((d) => (
                  <RankBar
                    key={d.problem}
                    label={d.problem}
                    count={d.count}
                    max={ov.difficulties[0]?.count || 1}
                    hint={`影响 ${d.affectedStudents.length} 名学员 · 建议：${d.suggestedAction}`}
                  />
                ))}
            </div>
          )}
        </Card>
      </SectionWrap>

      {/* 班级与在读学员概况 */}
      <SectionWrap title="班级与在读学员概况">
        <Grid min={300}>
          {ov.classes.map((c) => (
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
                <Button variant="ghost" size="sm" onClick={() => navigate(`/t/students?class=${c.classRow.id}`)}>
                  查看班级学员
                </Button>
              </div>
            </Card>
          ))}
        </Grid>
      </SectionWrap>

      {/* 快捷操作弹窗 */}
      <StudentCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        actor={actor}
        onSaved={() => flash('学员已新增')}
      />
      <AttendanceRegisterModal
        open={attOpen}
        onClose={() => setAttOpen(false)}
        actor={actor}
        onSaved={() => flash('出勤已登记')}
      />
      <TeacherObservationModal
        open={obsOpen}
        onClose={() => setObsOpen(false)}
        actor={actor}
        onSaved={() => flash('观察已记录')}
      />
      {toast && <Toast tone="success">{toast}</Toast>}
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

function TodoTile({
  num,
  unit,
  accent,
  onClick,
}: {
  num: number;
  unit: string;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`todo-tile${accent && num > 0 ? ' todo-tile--accent' : ''}`} onClick={onClick}>
      <span className="todo-num">{num}</span>
      <span className="todo-unit">{unit}</span>
    </button>
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
