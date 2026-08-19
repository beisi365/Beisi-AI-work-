import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../data/repository';
import { useAuth } from '../auth/AuthContext';
import { useRepository } from '../hooks/useRepository';
import {
  studentSubmit,
  teacherReturn,
  teacherComplete,
  teacherMarkExcellent,
} from '../lib/submissionService';
import {
  Button,
  Card,
  EmptyState,
  Field,
  LoadingState,
  PageHeader,
  ProgressBar,
  Tag,
  Tabs,
  Toast,
} from '../components/ui';
import { Sparkline } from '../components/charts';
import { getStudentDashboard, type StudentDashboard } from '../lib/queries';
import {
  StudentArchiveModal,
  StudentEditModal,
  StudentTransferModal,
} from '../components/StudentModals';
import {
  ABILITY_LABEL,
  ABILITY_ORDER,
  ATTENDANCE_LABEL,
  ATTENDANCE_TONE,
  CATEGORY_LABEL,
  CATEGORY_TONE,
  formatDate,
  LEVEL_LABEL,
  levelToNum,
  rateText,
  SUBMISSION_LABEL,
  SUBMISSION_TONE,
  TEACHER_GRADE_ACTIONS,
  teacherCanGrade,
} from '../lib/format';
import type {
  Attendance,
  AttendanceStatus,
  ClassSession,
  Principal,
  WorkVersion,
  AbilityAssessment,
  AiAnalysis,
  TeacherReview,
} from '../data/types';

type TabKey = 'overview' | 'attendance' | 'works' | 'ability' | 'records';

export default function StudentProfilePage({ studentId: propId }: { studentId?: string }) {
  const { principal } = useAuth();
  const { id: paramId } = useParams();
  const navigate = useNavigate();
  const sid = propId ?? paramId ?? principal?.studentId ?? '';
  const isTeacher = principal?.role === 'teacher';
  const [tab, setTab] = useState<TabKey>('overview');

  // —— P1 交互弹窗状态 ——
  const [editOpen, setEditOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [toastTone, setToastTone] = useState<'success' | 'danger'>('success');
  const actor = isTeacher
    ? ({ actorId: principal?.teacherId ?? '', actorRole: 'teacher' } as const)
    : ({ actorId: principal?.studentId ?? '', actorRole: 'student' } as const);
  const flash = (m: string, tone: 'success' | 'danger' = 'success') => {
    setToastTone(tone);
    setToast(m);
    window.setTimeout(() => setToast(''), 2600);
  };

  const { data, loading } = useRepository(
    [
      'students',
      'enrollments',
      'classes',
      'attendance',
      'submissions',
      'assignments',
      'lessons',
      'class_sessions',
      'learning_records',
      'work_versions',
      'ability_assessments',
      'concerns',
      'ai_analysis',
      'teacher_reviews',
    ],
    async (d) => {
      const dash = await getStudentDashboard(d, sid);
      const workVersions = await d.workVersions.list();
      const aiAnalysis = await d.aiAnalysis.list();
      const teacherReviews = await d.teacherReviews.list();
      return { dash, workVersions, aiAnalysis, teacherReviews };
    },
  );

  if (loading || !data) return <LoadingState />;
  const { dash, workVersions, aiAnalysis, teacherReviews } = data;
  const archived = !!dash.student.archived_at;

  const tabItems: { key: TabKey; label: string }[] = [
    { key: 'overview', label: '概览' },
    { key: 'attendance', label: '出勤' },
    { key: 'works', label: '作业作品' },
    { key: 'ability', label: '能力' },
    { key: 'records', label: '学习记录' },
  ];

  return (
    <>
      <PageHeader
        title={dash.student.nickname}
        desc={dash.classRow ? `${dash.classRow.name} · ${dash.classRow.schedule}` : '学员档案'}
        actions={
          isTeacher ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
                ← 返回列表
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}>
                编辑档案
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setTransferOpen(true)}>
                调班
              </Button>
              <Button
                size="sm"
                variant={archived ? 'primary' : 'danger'}
                onClick={() => setArchiveOpen(true)}
              >
                {archived ? '恢复' : '归档'}
              </Button>
              <Tag tone={CATEGORY_TONE[inferCat(sid)]}>{CATEGORY_LABEL[inferCat(sid)]}</Tag>
            </>
          ) : (
            <>
              {archived ? (
                <Tag tone="neutral">账号已归档</Tag>
              ) : (
                <Button size="sm" variant="primary" onClick={() => setEditOpen(true)}>
                  编辑我的资料
                </Button>
              )}
              <Tag tone="neutral">我的档案</Tag>
            </>
          )
        }
      />

      <Card padded={false}>
        <div style={{ padding: 'var(--sp-4)' }}>
          <Tabs items={tabItems} active={tab} onChange={setTab} />
        </div>
      </Card>

      {tab === 'overview' && (
        <>
          {isTeacher && <TeacherFocusCard dash={dash} />}
          <LearningSummary dash={dash} />
          <div className="two-col" style={{ marginTop: 'var(--sp-4)' }}>
          <Card title="基本信息">
            <Field label="昵称">{dash.student.nickname}</Field>
            <Field label="年龄段">{dash.student.age_range}</Field>
            <Field label="职业">{dash.student.occupation}</Field>
            <Field label="学习目标">{dash.student.goal}</Field>
            <Field label="每周时长">{dash.student.weekly_hours} 小时</Field>
            <Field label="设备 / 系统">{dash.student.devices} / {dash.student.os}</Field>
            <Field label="办公软件">{dash.student.office_software}</Field>
            <Field label="使用 AI 工具">{dash.student.ai_tools_used}</Field>
            <Field label="自助能力">{dash.student.can_self_service ? '可自助' : '需协助'}</Field>
            <Field label="付费 AI">{dash.student.uses_paid_ai ? '是' : '否'}</Field>
            {dash.student.self_intro ? (
              <Field label="自我介绍">{dash.student.self_intro}</Field>
            ) : null}
          </Card>
          <Card title="学习概况">
            <Field label="出勤率">
              <ProgressBar value={dash.attendanceRate} tone="accent" showLabel />
              <span className="muted" style={{ marginLeft: 8 }}>{rateText(dash.attendanceRate)}</span>
            </Field>
            <Field label="提交率">
              <ProgressBar value={dash.submissionRate} tone="accent" showLabel />
              <span className="muted" style={{ marginLeft: 8 }}>{rateText(dash.submissionRate)}</span>
            </Field>
            <Field label="完成率">
              <ProgressBar value={dash.completionRate} tone="success" showLabel />
              <span className="muted" style={{ marginLeft: 8 }}>{rateText(dash.completionRate)}</span>
            </Field>
            <Field label="所属班级">{dash.classRow?.name ?? '—'}</Field>
            <Field label="班级安排">{dash.classRow?.schedule ?? '—'}</Field>
            {isTeacher && dash.concerns.length > 0 && (
              <Field label="关注事项">
                {dash.concerns.map((c) => (
                  <Tag key={c.id} tone="danger">
                    {c.type}
                  </Tag>
                ))}
              </Field>
            )}
          </Card>
          </div>

          {isTeacher ? (
            <Card
              title="教师内部档案"
              desc="仅教师可见，不对学员展示，也不允许学员修改"
              className="internal-card"
              style={{ marginTop: 'var(--sp-4)' }}
            >
              <div className="internal-head">
                <span className="internal-badge">仅教师可见</span>
              </div>
              <Field label="AI 基线分析">{dash.student.ai_baseline || '—'}</Field>
              <Field label="学员档案标签">{(dash.student.teacher_tags || []).join('、') || '—'}</Field>
              <Field label="长期观察记录">{dash.student.teacher_observation || '—'}</Field>
              <Field label="学习建议（学员可见，作为后续学习建议）">
                {dash.student.learning_suggestion || '—'}
              </Field>
            </Card>
          ) : (
            <Card
              title="学习建议"
              desc="由教师给出，学员可见只读"
              style={{ marginTop: 'var(--sp-4)' }}
            >
              <Field label="学习建议">{dash.student.learning_suggestion || '暂无教师建议'}</Field>
            </Card>
          )}
        </>
      )}

      {tab === 'attendance' && (
        <Card title="出勤记录" desc={'共 ' + dash.attendance.length + ' 次'}>
          {dash.attendance.length === 0 ? (
            <EmptyState title="暂无出勤记录" />
          ) : (
            <table className="ltable">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>状态</th>
                  {isTeacher && <th>备注</th>}
                  {isTeacher && <th>操作</th>}
                </tr>
              </thead>
              <tbody>
                {dash.attendance.map((a) => (
                  <tr key={a.id}>
                    <td>{formatDate(a.time)}</td>
                    <td>
                      <Tag tone={ATTENDANCE_TONE[a.status]}>{ATTENDANCE_LABEL[a.status]}</Tag>
                    </td>
                    {isTeacher && (
                      <td>{a.note ? a.note : <span className="muted">—</span>}</td>
                    )}
                    {isTeacher && (
                      <td>
                        <select
                          className="select"
                          value={a.status}
                          onChange={async (e) => {
                            const next = e.target.value as AttendanceStatus;
                            try {
                              await db.attendance.update(a.id, { status: next });
                              flash('出勤状态已更新');
                            } catch (err) {
                              flash('出勤更新失败：' + (err instanceof Error ? err.message : '未知错误'), 'danger');
                            }
                          }}
                        >
                          {(['present', 'late', 'leave', 'absent'] as AttendanceStatus[]).map((s) => (
                            <option key={s} value={s}>
                              {ATTENDANCE_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === 'works' && (
        <WorksTab
          sid={sid}
          isTeacher={isTeacher}
          archived={archived}
          principal={principal}
          submissions={dash.submissions}
          workVersions={workVersions}
          aiAnalysis={aiAnalysis}
          teacherReviews={teacherReviews}
        />
      )}

      {tab === 'ability' && (
        <Card title="能力评估（六维）" desc="当前水平与历史变化">
          <div className="ability-grid">
            {ABILITY_ORDER.map((dim) => (
              <AbilityCell key={dim} sid={sid} dim={dim} current={dash.ability[dim]} />
            ))}
          </div>
          <p className="muted" style={{ fontSize: 'var(--fs-secondary)', marginTop: 'var(--sp-4)' }}>
            以上为能力摘要；完整能力评估、横向对比与批量管理将在检查点2开放。
          </p>
        </Card>
      )}

      {tab === 'records' && (
        <Card title="学习记录时间线" desc="按课程时间排序；缺席与「已到课但记录待补」也会列出，可展开查看每场">
          <RecordsTimeline
            isTeacher={isTeacher}
            studentId={sid}
            attendance={dash.attendance}
            sessions={dash.sessions}
            records={dash.learningRecords}
            lessons={dash.lessons}
          />
        </Card>
      )}

      {!isTeacher && archived && (
        <Card title="账号已归档" style={{ marginTop: 'var(--sp-4)' }}>
          <div className="alert-warn">
            该账号已归档，暂时无法编辑资料或产生新的作品/学习数据。如需恢复访问，请联系老师。
          </div>
        </Card>
      )}

      <StudentEditModal
        open={editOpen}
        student={dash.student}
        isTeacher={isTeacher}
        actor={actor}
        onClose={() => setEditOpen(false)}
        onSaved={() => flash(isTeacher ? '档案已更新' : '资料已保存')}
      />
      <StudentTransferModal
        open={transferOpen}
        student={dash.student}
        actor={actor}
        onClose={() => setTransferOpen(false)}
        onSaved={() => flash('调班成功')}
      />
      <StudentArchiveModal
        open={archiveOpen}
        student={dash.student}
        actor={actor}
        onClose={() => setArchiveOpen(false)}
        onSaved={() => flash('操作成功')}
      />
      {toast && <Toast tone={toastTone}>{toast}</Toast>}
    </>
  );
}

// ============================================================
// 作业作品 Tab
// ============================================================
function WorksTab({
  sid,
  isTeacher,
  archived,
  principal,
  submissions,
  workVersions,
  aiAnalysis,
  teacherReviews,
}: {
  sid: string;
  isTeacher: boolean;
  archived: boolean;
  principal: Principal | null;
  submissions: NonNullable<Awaited<ReturnType<typeof getStudentDashboard>>['submissions']>;
  workVersions: WorkVersion[];
  aiAnalysis: AiAnalysis[];
  teacherReviews: TeacherReview[];
}) {
  const navigate = useNavigate();
  void navigate;
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [content, setContent] = useState('');

  return (
    <div className="stack" style={{ marginTop: 'var(--sp-4)' }}>
      {submissions.map((s) => {
        const vers = workVersions
          .filter((w) => w.submission_id === s.id)
          .sort((a, b) => a.version_no - b.version_no);
        const finalV = vers.find((v) => v.is_final) ?? vers[vers.length - 1];
        const ai = isTeacher && s.ai_review_id ? aiAnalysis.find((x) => x.id === s.ai_review_id) : undefined;
        const tr = s.teacher_review_id
          ? teacherReviews.find((x) => x.id === s.teacher_review_id)
          : undefined;
        const canStudentEdit = sid === s.student_id;
        return (
          <Card
            key={s.id}
            title={s.assignment?.title ?? '作业'}
            desc={s.lesson?.title}
            actions={<Tag tone={SUBMISSION_TONE[s.status]}>{SUBMISSION_LABEL[s.status]}</Tag>}
          >
            <div className="stack">
              <div className="spread">
                <span className="muted">状态</span>
                <Tag tone={SUBMISSION_TONE[s.status]}>{SUBMISSION_LABEL[s.status]}</Tag>
              </div>
              {isTeacher && (
                <div className="grade-actions">
                  <span className="muted" style={{ fontSize: 'var(--fs-secondary)' }}>
                    教师评定：
                  </span>
                  {TEACHER_GRADE_ACTIONS.map((a) => (
                    <Button
                      key={a.to}
                      size="sm"
                      variant={a.variant}
                      disabled={!teacherCanGrade(s.status)}
                      onClick={async (e) => {
                        e.stopPropagation();
                        const actorId = principal?.teacherId ?? '';
                        if (a.to === 'need_revise') await teacherReturn(db, s.id, actorId);
                        else if (a.to === 'completed') await teacherComplete(db, s.id, actorId);
                        else if (a.to === 'excellent') await teacherMarkExcellent(db, s.id, actorId);
                      }}
                    >
                      {a.label}
                    </Button>
                  ))}
                </div>
              )}

              <div>
                <div className="muted" style={{ fontSize: 'var(--fs-secondary)', marginBottom: 4 }}>
                  作品版本（历史）
                </div>
                <div className="version-list">
                  {vers.map((v) => (
                    <div key={v.id} className={`version-item${v.is_final ? ' version-item--final' : ''}`}>
                      <span>第 {v.version_no} 版{v.is_final ? '（终稿）' : ''}</span>
                      <span className="muted" style={{ fontSize: 'var(--fs-secondary)' }}>
                        {v.content.slice(0, 30)}
                      </span>
                    </div>
                  ))}
                  {vers.length === 0 && <span className="muted">尚未提交作品</span>}
                </div>
              </div>

              {finalV && (
                <div className="form-row">
                  <label>终稿内容</label>
                  <div className="textarea" style={{ whiteSpace: 'pre-wrap' }}>
                    {finalV.content}
                  </div>
                </div>
              )}

              {ai && (
                <div className="ai-note">
                  <strong>演示版 AI 建议</strong>（仅用于流程测试，非真实模型）：{ai.content}
                </div>
              )}
              {tr && tr.status === 'confirmed' && (
                <div className="form-row">
                  <label>教师评价</label>
                  <div>
                    {tr.teacher_text}
                    <div className="muted" style={{ fontSize: 'var(--fs-secondary)', marginTop: 4 }}>
                      教师评审完整管理将在检查点2开放（当前仅展示已确认摘要）。
                    </div>
                  </div>
                </div>
              )}

              {canStudentEdit && !archived && (
                <div>
                  {addingFor === s.id ? (
                    <div className="form-row">
                      <label>新增一版作品内容</label>
                      <textarea
                        className="textarea"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="输入这一版的作品内容…"
                      />
                      <div className="row">
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={!content.trim()}
                          onClick={async () => {
                            await studentSubmit(db, s.id, s.student_id, content);
                            setContent('');
                            setAddingFor(null);
                          }}
                        >
                          保存为新版本
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setAddingFor(null)}>
                          取消
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setAddingFor(s.id)}>
                      + 新增作品版本
                    </Button>
                  )}
                </div>
              )}
              {canStudentEdit && archived && (
                <div className="muted" style={{ fontSize: 'var(--fs-secondary)' }}>
                  账号已归档，暂不能新增作品版本
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ============================================================
// 能力单元格（含历史 sparkline）
// ============================================================
function AbilityCell({ sid, dim, current }: { sid: string; dim: string; current: string | null }) {
  const { data } = useRepository(['ability_assessments'], async (d) => {
    const hist: AbilityAssessment[] = await d.getAbilityHistory(sid, dim as never);
    return hist;
  });
  const hist = data ?? [];
  const values = hist.map((h) => levelToNum(h.level));
  return (
    <div className="ability-cell">
      <div className="ac-top">
        <span className="ac-name">{ABILITY_LABEL[dim as keyof typeof ABILITY_LABEL] ?? dim}</span>
        <span className="ac-level">{current ? `${current} ${LEVEL_LABEL[current as keyof typeof LEVEL_LABEL]}` : '—'}</span>
      </div>
      <div style={{ marginTop: 6 }}>
        <Sparkline values={values} />
      </div>
    </div>
  );
}

// ============================================================
// 学习记录时间线（历史查看）
// 说明：绝不合并数据。连续的「缺席 / 记录待补」仅在界面默认折叠为一行摘要，
// 展开后保留每一场课程的日期、课程名称、独立状态与独立「补充记录」入口，确保历史可追溯。
// ============================================================
type LrItem = NonNullable<Awaited<ReturnType<typeof getStudentDashboard>>['learningRecords']>[number];
type RecKind = 'absent' | 'missing' | 'normal';
type RawRec = { att: Attendance; session: ClassSession; lr: LrItem | null; kind: RecKind };

function RecordsTimeline({
  isTeacher,
  studentId,
  attendance,
  sessions,
  records,
  lessons,
}: {
  isTeacher: boolean;
  studentId: string;
  attendance: Attendance[];
  sessions: ClassSession[];
  records: LrItem[];
  lessons: NonNullable<Awaited<ReturnType<typeof getStudentDashboard>>['lessons']>;
}) {
  const [localRecords, setLocalRecords] = useState<LrItem[]>(records);
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({
    prep: '良好',
    exercise_completion: '90%',
    problems: '',
    next_suggestion: '',
    teacher_observation: '',
  });

  useEffect(() => setLocalRecords(records), [records]);

  const sessionMap = new Map(sessions.map((s) => [s.id, s]));
  const lrBySession = new Map(localRecords.map((r) => [r.class_session_id, r]));
  const lessonMap = new Map(lessons.map((l) => [l.id, l]));
  const courseTitle = (session: ClassSession) => lessonMap.get(session.lesson_id)?.title ?? '课程';

  // 以考勤为基准列出全部已上场次：正常记录 / 缺席无记录 / 已到课但记录待补（全部保留，不合并）
  const raw = attendance
    .map((a) => {
      const session = sessionMap.get(a.class_session_id);
      if (!session) return null;
      const lr = lrBySession.get(a.class_session_id) ?? null;
      const isAbsent = a.status === 'absent';
      const isMissing = !isAbsent && !lr;
      const kind: RecKind = isAbsent ? 'absent' : isMissing ? 'missing' : 'normal';
      return { att: a, session, lr, kind } as RawRec;
    })
    .filter((x): x is RawRec => x !== null)
    .sort((a, b) => b.session.scheduled_start - a.session.scheduled_start);

  if (raw.length === 0) {
    return <EmptyState title="暂无学习记录" />;
  }

  // 分组：连续的「缺席 / 记录待补」归为一组（默认折叠）；正常记录逐条显示，不做折叠。
  const groups: { key: string; kind: RecKind; items: RawRec[]; collapsedByDefault: boolean }[] = [];
  let i = 0;
  while (i < raw.length) {
    const cur = raw[i];
    if (cur.kind === 'absent' || cur.kind === 'missing') {
      let j = i;
      while (j < raw.length && raw[j].kind === cur.kind) j++;
      groups.push({ key: `g-${i}`, kind: cur.kind, items: raw.slice(i, j), collapsedByDefault: j - i > 1 });
      i = j;
    } else {
      groups.push({ key: `g-${i}`, kind: cur.kind, items: [cur], collapsedByDefault: false });
      i++;
    }
  }

  const onSave = async (sessionId: string) => {
    const created = await db.learningRecords.insert({
      student_id: studentId,
      class_session_id: sessionId,
      prep: form.prep,
      exercise_completion: form.exercise_completion,
      problems: form.problems,
      next_suggestion: form.next_suggestion,
      teacher_observation: form.teacher_observation,
      need_help: false,
    } as never);
    setLocalRecords((prev) => [...prev, created as LrItem]);
    setAddingFor(null);
  };

  const renderItem = (it: RawRec) => {
    const { att, session, lr, kind } = it;
    const tone = kind === 'absent' ? 'danger' : kind === 'missing' ? 'accent' : 'neutral';
    const label = kind === 'absent' ? '缺席' : kind === 'missing' ? '记录待补' : '已记录';
    const desc =
      kind === 'absent'
        ? '该场次缺席，无课堂学习记录'
        : kind === 'missing'
          ? '已出勤，本场学习记录待补充'
          : `预习 ${lr?.prep ?? '—'} · 完成度 ${lr?.exercise_completion ?? '—'}${lr?.problems ? ' · ' + lr.problems : ''}`;
    return (
      <div key={att.id} className="rec-row">
        <div className="rec-top">
          <span className="rec-date">{formatDate(session.scheduled_start)}</span>
          <span className="rec-course">{courseTitle(session)}</span>
          <Tag tone={tone}>{label}</Tag>
        </div>
        <div className="rec-desc">{desc}</div>
        {kind === 'missing' && (
          <div className="rec-action">
            {isTeacher ? (
              <button type="button" className="btn-supplement" onClick={() => setAddingFor(session.id)}>
                补充记录
              </button>
            ) : (
              <span className="muted" style={{ fontSize: 'var(--fs-secondary)' }}>
                本场记录待补充，可联系教师补全
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="rec-list">
      {addingFor && sessionMap.get(addingFor) && (
        <div className="form-row rec-add">
          <label>补充学习记录（{courseTitle(sessionMap.get(addingFor)!)}）</label>
          <input
            className="input"
            value={form.prep}
            placeholder="预习情况"
            onChange={(e) => setForm({ ...form, prep: e.target.value })}
          />
          <input
            className="input"
            value={form.exercise_completion}
            placeholder="课堂练习完成度，如 90%"
            onChange={(e) => setForm({ ...form, exercise_completion: e.target.value })}
          />
          <input
            className="input"
            value={form.problems}
            placeholder="课堂问题（可选）"
            onChange={(e) => setForm({ ...form, problems: e.target.value })}
          />
          <textarea
            className="textarea"
            value={form.next_suggestion}
            placeholder="给学员的下一步建议（可选）"
            onChange={(e) => setForm({ ...form, next_suggestion: e.target.value })}
          />
          <div className="row">
            <Button size="sm" variant="primary" onClick={() => onSave(addingFor)}>
              保存记录
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAddingFor(null)}>
              取消
            </Button>
          </div>
        </div>
      )}

      {groups.map((g) => {
        if (g.items.length === 1) return renderItem(g.items[0]);
        const isCollapsed = collapsed[g.key] ?? g.collapsedByDefault;
        const tone = g.kind === 'absent' ? 'danger' : 'accent';
        const label = g.kind === 'absent' ? '缺席' : '记录待补';
        const times = g.items.map((it) => it.session.scheduled_start).sort((a, b) => a - b);
        const range = times.length > 1 ? `${md(times[0])} ~ ${md(times[times.length - 1])}` : md(times[0]);
        return (
          <div key={g.key} className="rec-group">
            <button
              type="button"
              className="rec-group-head"
              onClick={() => setCollapsed((p) => ({ ...p, [g.key]: !isCollapsed }))}
            >
              <span className="rec-collapse-icon">{isCollapsed ? '▸' : '▾'}</span>
              <span className="rec-group-title">连续 {g.items.length} 次{label}</span>
              <span className="rec-group-range">{range}</span>
              <Tag tone={tone}>{label}</Tag>
              <span className="muted rec-group-hint">
                {isCollapsed ? '（点击展开查看每场）' : '（点击收起）'}
              </span>
            </button>
            {!isCollapsed && <div className="rec-group-body">{g.items.map(renderItem)}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// 教师优先视图卡片（仅教师可见，置于概览顶部）
// 优先展示：当前班级与状态、最近一次出勤、最近一次作品、最近一次考核、
// 当前主要困难、下一步教学建议、待处理事项、最近三条成长记录。
// 全部基于真实数据；无数据项显示「暂无」，不生成模拟判断。
// ============================================================
function TeacherFocusCard({ dash }: { dash: StudentDashboard }) {
  const { classRow, student, attendance, submissions, ability, concerns, learningRecords, sessions, lessons } = dash;

  // 当前班级与状态
  const archived = !!student.archived_at;
  const statusText = archived ? '已归档' : '在读';
  const statusTone: 'neutral' | 'success' = archived ? 'neutral' : 'success';

  // 最近一次出勤（按考勤时间倒序）
  const lastAtt = [...attendance].sort((a, b) => b.time - a.time)[0];

  // 最近一次作品（提交，按创建时间倒序）
  const lastSub = [...submissions].sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))[0];

  // 最近一次考核（六维已评估维度计数）
  const assessedDims = ABILITY_ORDER.filter((d) => ability[d]);
  const abilityText = assessedDims.length ? `已评估 ${assessedDims.length}/6 维` : '暂无考核';

  // 当前主要困难：开放关注事项 + 近期课堂问题（真实数据）
  const concernTexts = concerns.map((c) => c.type);
  const recentProblems = learningRecords
    .filter((r) => r.problems && r.problems.trim())
    .slice(0, 2)
    .map((r) => r.problems);
  const difficulties = [...concernTexts, ...recentProblems];

  // 下一步教学建议：最近一条非空建议
  const nextSug = [...learningRecords]
    .filter((r) => r.next_suggestion && r.next_suggestion.trim())
    .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))[0]?.next_suggestion;

  // 待处理事项：待提交作业 + 开放关注事项
  const pendingSubs = submissions.filter((s) => s.status === 'pending').length;
  const todoParts: string[] = [];
  if (pendingSubs > 0) todoParts.push(`${pendingSubs} 份作业待提交`);
  if (concerns.length > 0) todoParts.push(`${concerns.length} 项关注事项`);
  const todoText = todoParts.length ? todoParts.join('；') : '暂无待处理事项';

  // 最近三条成长记录（按场次时间倒序）
  const sessionMap = new Map(sessions.map((s) => [s.id, s]));
  const lessonMap = new Map(lessons.map((l) => [l.id, l]));
  const courseTitle = (sid: string) => {
    const s = sessionMap.get(sid);
    return s ? lessonMap.get(s.lesson_id)?.title ?? '课程' : '课程';
  };
  const recentRecords = [...learningRecords]
    .sort((a, b) => {
      const sa = sessionMap.get(a.class_session_id)?.scheduled_start ?? a.created_at ?? 0;
      const sb = sessionMap.get(b.class_session_id)?.scheduled_start ?? b.created_at ?? 0;
      return sb - sa;
    })
    .slice(0, 3);

  const Item = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="focus-item">
      <div className="focus-label">{label}</div>
      <div className="focus-value">{children}</div>
    </div>
  );

  return (
    <Card
      title="教师优先视图"
      desc="仅教师可见：快速掌握该学员当前教学状态与下一步动作"
      className="teacher-focus-card"
    >
      <div className="focus-grid">
        <Item label="当前班级与状态">
          <div className="row" style={{ gap: 8 }}>
            <span>{classRow?.name ?? '未分班'}</span>
            <Tag tone={statusTone}>{statusText}</Tag>
          </div>
          {classRow?.schedule && <div className="muted" style={{ fontSize: 'var(--fs-secondary)' }}>{classRow.schedule}</div>}
        </Item>

        <Item label="最近一次出勤">
          {lastAtt ? (
            <div className="row" style={{ gap: 8 }}>
              <Tag tone={ATTENDANCE_TONE[lastAtt.status]}>{ATTENDANCE_LABEL[lastAtt.status]}</Tag>
              <span className="muted">{formatDate(lastAtt.time)}</span>
            </div>
          ) : (
            <span className="muted">暂无出勤记录</span>
          )}
        </Item>

        <Item label="最近一次作品">
          {lastSub ? (
            <div>
              <div>{lastSub.assignment?.title ?? '作业'}</div>
              <div className="row" style={{ gap: 6, marginTop: 4 }}>
                <Tag tone={SUBMISSION_TONE[lastSub.status]}>{SUBMISSION_LABEL[lastSub.status]}</Tag>
                {lastSub.lesson?.title && <span className="muted" style={{ fontSize: 'var(--fs-secondary)' }}>{lastSub.lesson.title}</span>}
              </div>
            </div>
          ) : (
            <span className="muted">暂无作品</span>
          )}
        </Item>

        <Item label="最近一次考核">
          <Tag tone={assessedDims.length ? 'accent' : 'neutral'}>{abilityText}</Tag>
        </Item>

        <Item label="当前主要困难">
          {difficulties.length === 0 ? (
            <span className="muted">暂无记录</span>
          ) : (
            <ul className="summary-list">
              {difficulties.slice(0, 4).map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
        </Item>

        <Item label="下一步教学建议">
          {nextSug ? nextSug : <span className="muted">暂无建议</span>}
        </Item>

        <Item label="待处理事项">{todoText}</Item>

        <Item label="最近三条成长记录">
          {recentRecords.length === 0 ? (
            <span className="muted">暂无成长记录</span>
          ) : (
            <ul className="focus-records">
              {recentRecords.map((r) => (
                <li key={r.id}>
                  <span className="muted" style={{ fontSize: 'var(--fs-secondary)' }}>
                    {sessionMap.get(r.class_session_id) ? formatDate(sessionMap.get(r.class_session_id)!.scheduled_start) : '—'}
                  </span>
                  <span style={{ marginLeft: 6 }}>{courseTitle(r.class_session_id)}</span>
                  <span className="muted" style={{ marginLeft: 6, fontSize: 'var(--fs-secondary)' }}>
                    预习 {r.prep} · 完成度 {r.exercise_completion}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Item>
      </div>
    </Card>
  );
}

function inferCat(id: string): 'normal' | 'behind' | 'progress' | 'strong' {
  const n = Number(id.replace(/\D/g, ''));
  if (n <= 8) return 'normal';
  if (n <= 13) return 'behind';
  if (n <= 17) return 'progress';
  return 'strong';
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const md = (ts: number) => {
  const d = new Date(ts);
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

// ============================================================
// 学习状态摘要（基于现有数据，不调用 AI、不新增数据表）
// ============================================================
function LearningSummary({ dash }: { dash: StudentDashboard }) {
  const { attendance, sessions, learningRecords, submissions, concerns, lessons } = dash;

  // 当前状态：完全基于真实指标与关注事项；无任何信号时显示「数据不足」
  const hasSignal = attendance.length > 0 || submissions.length > 0 || concerns.length > 0;
  const lowAtt = dash.attendanceRate < 0.85;
  const lowSub = dash.submissionRate < 0.8;
  const needsFocus = concerns.length > 0 || lowAtt || lowSub;
  const statusLabel = !hasSignal ? '数据不足' : needsFocus ? '需重点关注' : '正常跟进';
  const statusTone = !hasSignal ? 'neutral' : needsFocus ? 'danger' : 'success';

  // 最近 3 节变化（基于真实考勤 + 是否存在学习记录）
  const sessionMap = new Map(sessions.map((s) => [s.id, s]));
  const lrBySession = new Map(learningRecords.map((r) => [r.class_session_id, r]));
  const lessonMap = new Map(lessons.map((l) => [l.id, l]));
  const courseTitle = (session: ClassSession) => lessonMap.get(session.lesson_id)?.title ?? '课程';
  const last3 = attendance
    .map((a) => ({ a, session: sessionMap.get(a.class_session_id) }))
    .filter((x) => x.session)
    .sort((x, y) => y.session!.scheduled_start - x.session!.scheduled_start)
    .slice(0, 3);

  // 主要困难：开放关注事项 + 近期课堂问题（均为真实数据）
  const concernTexts = concerns.map((c) => c.type);
  const recentProblems = learningRecords
    .filter((r) => r.problems && r.problems.trim())
    .slice(0, 3)
    .map((r) => r.problems);
  const difficulties = [...concernTexts, ...recentProblems];

  // 最近作业状态
  const recentSubs = submissions.slice(0, 4);

  // 最近教师观察（真实数据）
  const observations = learningRecords
    .filter((r) => r.teacher_observation && r.teacher_observation.trim())
    .slice(0, 2);

  // 下次关注点：仅汇总真实待办；无数据时显示「暂无记录」，不生成模拟判断
  const pendingCount = submissions.filter((s) => s.status === 'pending').length;
  const focusParts: string[] = [];
  if (pendingCount > 0) focusParts.push(`补齐 ${pendingCount} 份待提交作业`);
  if (concerns.length > 0) focusParts.push(`关注：${concerns[0].type}`);
  const nextFocusText = focusParts.length ? focusParts.join('；') : '暂无记录';

  return (
    <Card title="学习状态摘要" desc="基于现有出勤、作业与课堂记录生成（无 AI 调用）">
      <div className="summary-grid">
        <div className="summary-block">
          <div className="summary-head">当前状态</div>
          <div className="row" style={{ gap: 8 }}>
            <Tag tone={statusTone}>{statusLabel}</Tag>
          </div>
          <div className="muted" style={{ fontSize: 'var(--fs-secondary)', marginTop: 6 }}>
            出勤 {rateText(dash.attendanceRate)} · 提交 {rateText(dash.submissionRate)} · 完成{' '}
            {rateText(dash.completionRate)}
          </div>
        </div>

        <div className="summary-block">
          <div className="summary-head">最近 3 节变化</div>
          <div className="col" style={{ gap: 4 }}>
            {last3.length === 0 ? (
              <span className="muted">暂无出勤记录</span>
            ) : (
              last3.map(({ a, session }) => {
                const isAbsent = a.status === 'absent';
                const hasRec = lrBySession.has(a.class_session_id);
                const tone = isAbsent ? 'danger' : hasRec ? 'neutral' : 'accent';
                const label = isAbsent ? '缺席' : hasRec ? '已记录' : '记录待补';
                return (
                  <div key={a.id} className="row" style={{ gap: 6, fontSize: 'var(--fs-secondary)' }}>
                    <Tag tone={tone}>{label}</Tag>
                    <span className="muted">
                      {formatDate(session!.scheduled_start)} · {courseTitle(session!)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="summary-block">
          <div className="summary-head">主要困难</div>
          {difficulties.length === 0 ? (
            <span className="muted">暂无记录</span>
          ) : (
            <ul className="summary-list">
              {difficulties.slice(0, 4).map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="summary-block">
          <div className="summary-head">待处理作业</div>
          <div className="col" style={{ gap: 4 }}>
            {recentSubs.length === 0 ? (
              <span className="muted">暂无作业</span>
            ) : (
              recentSubs.map((s) => (
                <div key={s.id} className="row" style={{ gap: 6, fontSize: 'var(--fs-secondary)' }}>
                  <Tag tone={SUBMISSION_TONE[s.status]}>{SUBMISSION_LABEL[s.status]}</Tag>
                  <span className="muted">{s.assignment?.title ?? '作业'}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="summary-block">
          <div className="summary-head">最近教师观察</div>
          {observations.length === 0 ? (
            <span className="muted">暂无教师观察记录</span>
          ) : (
            <div className="col" style={{ gap: 4 }}>
              {observations.map((r) => (
                <div key={r.id} className="muted" style={{ fontSize: 'var(--fs-secondary)' }}>
                  {r.teacher_observation}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="summary-block summary-block--wide">
          <div className="summary-head">下次关注点</div>
          <div className="muted">{nextFocusText}</div>
        </div>
      </div>
    </Card>
  );
}
