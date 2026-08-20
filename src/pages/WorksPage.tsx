import { Fragment, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../data/repository';
import AssignmentModal from '../components/AssignmentModal';
import { useAuth } from '../auth/AuthContext';
import { useRepository } from '../hooks/useRepository';
import {
  studentSubmit,
  teacherReturn,
  teacherComplete,
  teacherMarkExcellent,
} from '../lib/submissionService';
import { Button, EmptyState, LoadingState, PageHeader, Tag } from '../components/ui';
import {
  SUBMISSION_LABEL,
  SUBMISSION_TONE,
  TEACHER_GRADE_ACTIONS,
  TEACHER_COMMENT_LABEL,
  teacherCanGrade,
  formatDate,
  formatDateTime,
} from '../lib/format';
import { selectWorksSubmissions, paginate } from '../lib/queries';
import { useDemoMode } from '../lib/demoMode';
import type { SubmissionStatus, WorkVersion, TeacherReview, Assignment } from '../data/types';

// —— 教师结构化评价标签（轻量，不评分、不排名、不强制） ——
const TAG_CATEGORIES: { key: string; options: string[] }[] = [
  { key: '完成度', options: ['超出预期', '达标', '基本完成', '未达标'] },
  { key: 'AI工具熟练度', options: ['熟练使用', '能独立完成', '需指导', '不熟悉'] },
  { key: '提示词能力', options: ['结构清晰', '目标明确', '需优化', '偏弱'] },
  { key: '创意', options: ['有亮点', '中规中矩', '可拓展'] },
  { key: '判断力', options: ['独立思考', '需引导', '偏差明显'] },
  { key: '需要加强', options: ['排版', '逻辑', '主题表达', '技术实现', '提示词'] },
  { key: '下一步目标', options: ['尝试多模态', '深化主题', '提升完成度', '加强练习'] },
];

function parseReviewTags(s?: string | null): Record<string, string[]> {
  if (!s) return {};
  try {
    const obj = JSON.parse(s);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const out: Record<string, string[]> = {};
      for (const k of Object.keys(obj)) {
        const v = (obj as Record<string, unknown>)[k];
        if (Array.isArray(v)) out[k] = v as string[];
      }
      return out;
    }
  } catch {
    /* 容忍损坏数据 */
  }
  return {};
}

function reviewTagEntries(s?: string | null): [string, string][] {
  const parsed = parseReviewTags(s);
  return Object.entries(parsed).flatMap(([cat, arr]) => arr.map((opt) => [cat, opt] as [string, string]));
}

function hasReviewTags(s?: string | null): boolean {
  return reviewTagEntries(s).length > 0;
}

function serializeReviewTags(tags: Record<string, string[]>): string {
  return JSON.stringify(tags);
}

const ALL_STATUS: SubmissionStatus[] = ['pending', 'to_review', 'need_revise', 'completed', 'excellent'];
const PAGE_SIZE = 20;

export default function WorksPage() {
  const { principal } = useAuth();
  const isTeacher = principal?.role === 'teacher';
  const myStudentId = principal?.studentId ?? '';
  const { readOnly } = useDemoMode();

  // —— 所有 hooks 必须在 early-return 之前调用，hooks 顺序需保持稳定 ——
  const [searchParams] = useSearchParams();
  const [classFilter, setClassFilter] = useState('all');
  const [studentFilter, setStudentFilter] = useState(() => searchParams.get('student') ?? 'all');
  const [lessonFilter, setLessonFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') ?? 'all');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [content, setContent] = useState('');
  // 教师填写评语：当前正在编辑评语的作业 id 与草稿文本
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  // 教师结构化标签（轻量，不评分、不排名），按类别映射到标签数组
  const [commentTags, setCommentTags] = useState<Record<string, string[]>>({});

  // 作业新建 / 编辑弹窗状态
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const openAssignment = (a?: Assignment | null) => {
    setEditingAssignment(a ?? null);
    setAssignmentOpen(true);
  };

  // 从总览跳转带参数时，自动应用初始筛选（单向：URL → state）
  useEffect(() => {
    const st = searchParams.get('status');
    const student = searchParams.get('student');
    if (st) setStatusFilter(st);
    if (student) setStudentFilter(student);
  }, [searchParams]);

  const { data, loading } = useRepository(
    [
      'submissions',
      'assignments',
      'lessons',
      'students',
      'work_versions',
      'classes',
      'teacher_reviews',
      'files',
      'courses',
      'class_sessions',
    ],
    async (d) => {
      const [subs, assignments, lessons, students, workVersions, classes, teacherReviews, files, courses, classSessions] =
        await Promise.all([
          d.submissions.list(),
          d.assignments.list(),
          d.lessons.list(),
          d.students.list(),
          d.workVersions.list(),
          d.classes.list(),
          d.teacherReviews.list(),
          d.files.list(),
          d.courses.list(),
          d.classSessions.list(),
        ]);
      return {
        subs,
        assignments,
        lessons,
        students,
        workVersions,
        classes,
        teacherReviews,
        files,
        courses,
        classSessions,
      };
    },
  );

  // 版本按 submission 分组并按版本号升序
  const versBySub = useMemo(() => {
    if (!data) return new Map<string, WorkVersion[]>();
    const m = new Map<string, WorkVersion[]>();
    for (const w of data.workVersions) {
      const arr = m.get(w.submission_id) ?? [];
      arr.push(w);
      m.set(w.submission_id, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.version_no - b.version_no);
    return m;
  }, [data]);

  const asgById = useMemo(() => (data ? new Map(data.assignments.map((a) => [a.id, a])) : new Map()), [data]);
  const lessonById = useMemo(() => (data ? new Map(data.lessons.map((l) => [l.id, l])) : new Map()), [data]);
  const studentById = useMemo(() => (data ? new Map(data.students.map((s) => [s.id, s])) : new Map()), [data]);
  const classById = useMemo(() => (data ? new Map(data.classes.map((c) => [c.id, c])) : new Map()), [data]);
  const fileById = useMemo(() => (data ? new Map(data.files.map((f) => [f.id, f])) : new Map()), [data]);
  const reviewByKey = useMemo(() => {
    const m = new Map<string, TeacherReview>();
    if (data) for (const r of data.teacherReviews) m.set(`${r.student_id}::${r.ref_lesson_id}`, r);
    return m;
  }, [data]);

  const filtered = useMemo(
    () =>
      data
        ? selectWorksSubmissions(data.subs, {
            assignments: data.assignments,
            filter: {
              role: isTeacher ? 'teacher' : 'student',
              // 下拉框的 "全部" 哨兵值不能作为真实 ID 传入过滤逻辑，需规范化为 undefined
              classId: isTeacher && classFilter !== 'all' ? classFilter : undefined,
              studentId: isTeacher && studentFilter !== 'all' ? studentFilter : undefined,
              lessonId: isTeacher && lessonFilter !== 'all' ? lessonFilter : undefined,
              status: statusFilter !== 'all' ? (statusFilter as SubmissionStatus) : undefined,
              viewerStudentId: myStudentId,
            },
          })
        : [],
    [data, isTeacher, classFilter, studentFilter, lessonFilter, statusFilter, myStudentId],
  );

  const pageResult = useMemo(() => paginate(filtered, page, PAGE_SIZE), [filtered, page]);

  // —— early-return 必须在所有 hooks 之后 ——
  if (!principal) return null;
  if (loading || !data) return <LoadingState />;

  const { subs } = data;

  const resetPage = () => setPage(1);

  const colCount = isTeacher ? 8 : 6;

  // 由学员 + 课节定位教师评语（teacher_reviews 以 student_id + ref_lesson_id 关联）
  const reviewFor = (studentId: string, lessonId: string | null | undefined) =>
    lessonId ? reviewByKey.get(`${studentId}::${lessonId}`) : undefined;

  // 页码列表：页面不多时全部展示；过多时窗口化并保留首尾与省略号
  const totalPages = pageResult.totalPages;
  const cur = pageResult.page;
  let pageNumbers: (number | '…')[];
  if (totalPages <= 9) {
    pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);
  } else {
    const start = Math.max(2, cur - 2);
    const end = Math.min(totalPages - 1, cur + 2);
    pageNumbers = [1];
    if (start > 2) pageNumbers.push('…');
    for (let i = start; i <= end; i++) pageNumbers.push(i);
    if (end < totalPages - 1) pageNumbers.push('…');
    pageNumbers.push(totalPages);
  }

  const toggleTag = (cat: string, opt: string) => {
    setCommentTags((prev) => {
      const cur = prev[cat] ?? [];
      const next = cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt];
      const out: Record<string, string[]> = { ...prev };
      if (next.length) out[cat] = next;
      else delete out[cat];
      return out;
    });
  };

  // 行内展开详情
  const renderDetail = (submissionId: string) => {
    const s = subs.find((x) => x.id === submissionId)!;
    const asg = asgById.get(s.assignment_id);
    const lessonId = asg?.lesson_id;
    const vers = versBySub.get(s.id) ?? [];
    const review = reviewFor(s.student_id, lessonId);
    const courseNameOf = (lid: string | undefined): string => {
      if (!lid) return '—';
      const ls = data.lessons.find((l) => l.id === lid);
      const c = ls ? data.courses.find((cc) => cc.id === ls.course_id) : undefined;
      return c ? c.title : '未知课程';
    };
    const sessionLabelOf = (sid: string | null | undefined): string => {
      if (!sid) return '未绑定';
      const cs = data.classSessions.find((x) => x.id === sid);
      return cs ? `${cs.status === 'done' ? '已上' : '待上'} · ${formatDate(cs.scheduled_start)}` : '—';
    };
    return (
      <div className="col" style={{ gap: 12 }}>
        {/* 作业信息：展示绑定班级 / 课程 / 课节 / 课次，教师可编辑 */}
        <div>
          <div className="muted" style={{ fontSize: 'var(--fs-secondary)', marginBottom: 6 }}>
            作业信息
          </div>
          {asg ? (
            <div className="review-box">
              <div className="row spread" style={{ gap: 12, flexWrap: 'wrap' }}>
                <span><strong>班级：</strong>{classById.get(asg.class_id)?.name ?? '—'}</span>
                <span><strong>课程：</strong>{courseNameOf(asg.lesson_id)}</span>
                <span><strong>课节：</strong>{lessonById.get(asg.lesson_id)?.title ?? '—'}</span>
                <span><strong>课次：</strong>{sessionLabelOf(asg.class_session_id)}</span>
              </div>
              <div style={{ marginTop: 8 }}><strong>标题：</strong>{asg.title}</div>
              <div style={{ marginTop: 4 }}><strong>要求：</strong>{asg.requirements || '—'}</div>
              <div style={{ marginTop: 4 }}><strong>截止：</strong>{asg.due_date || '—'}</div>
              <div style={{ marginTop: 4 }}><strong>评分标准：</strong>{asg.rubric || '—'}</div>
            </div>
          ) : (
            <span className="muted">作业信息缺失</span>
          )}
          {isTeacher && asg && !readOnly && (
            <div style={{ marginTop: 8 }}>
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  openAssignment(asg);
                }}
              >
                编辑作业
              </Button>
            </div>
          )}
        </div>

        {/* 教师评语（来自 teacher_reviews，已存在数据，无则占位） */}
        <div>
          <div className="muted" style={{ fontSize: 'var(--fs-secondary)', marginBottom: 6 }}>
            教师评语
          </div>
          {review && (review.teacher_text || hasReviewTags(review.tags)) ? (
            <div className="review-box">
              {review.teacher_text && <div>{review.teacher_text}</div>}
              {hasReviewTags(review.tags) && (
                <div className="att-summary-chips" style={{ marginTop: review.teacher_text ? 8 : 0 }}>
                  {reviewTagEntries(review.tags).map(([cat, opt]) => (
                    <span key={`${cat}-${opt}`} className="tag-chip tag-chip--on">
                      {cat}：{opt}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <span className="muted">暂无教师评语</span>
          )}
        </div>

        <div>
          <div className="muted" style={{ fontSize: 'var(--fs-secondary)', marginBottom: 6 }}>
            作品版本（{vers.length}）
          </div>
          <div className="version-list">
            {vers.map((v) => {
              const file = v.snapshot_file_id ? fileById.get(v.snapshot_file_id) : undefined;
              return (
                <div key={v.id} className={`version-item${v.is_final ? ' version-item--final' : ''}`}>
                  <div className="col" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                    <div className="spread">
                      <span>
                        第 {v.version_no} 版{v.is_final ? '（终稿）' : ''}
                      </span>
                      <span className="muted" style={{ fontSize: 'var(--fs-secondary)' }}>
                        {formatDateTime(v.created_at)}
                      </span>
                    </div>
                    {file ? (
                      <div className="version-file">
                        <span className="file-name">{file.name}</span>
                        {file.mock_url ? (
                          <a
                            className="btn-supplement"
                            href={file.mock_url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            预览/下载
                          </a>
                        ) : (
                          <span className="muted">（无预览链接）</span>
                        )}
                      </div>
                    ) : (
                      <div className="version-text">{v.content?.trim() ? v.content : '（无文本内容）'}</div>
                    )}
                  </div>
                </div>
              );
            })}
            {vers.length === 0 && <span className="muted">尚未提交作品</span>}
          </div>
        </div>

        {isTeacher && !readOnly ? (
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
            {commentFor === s.id ? (
              <div className="form-row" style={{ width: '100%' }}>
                <label>填写评语（仅保存评语，不改变作业状态）</label>
                <textarea
                  className="textarea"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="输入对本次作业的评语…"
                />
                <div className="form-row" style={{ marginTop: 10 }}>
                  <label>结构化标签（可选，不评分、不排名、不强制）</label>
                  {TAG_CATEGORIES.map((cat) => (
                    <div key={cat.key} className="att-summary-chips">
                      <span className="muted" style={{ marginRight: 4 }}>{cat.key}：</span>
                      {cat.options.map((opt) => {
                        const on = (commentTags[cat.key] ?? []).includes(opt);
                        return (
                          <button
                            type="button"
                            key={opt}
                            className={`tag-chip${on ? ' tag-chip--on' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTag(cat.key, opt);
                            }}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <div className="row">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!commentText.trim()}
                    onClick={async () => {
                      const existing = reviewFor(s.student_id, lessonId);
                      let reviewId = existing?.id;
                      if (existing) {
                        await db.teacherReviews.update(existing.id, {
                          teacher_text: commentText.trim(),
                          tags: serializeReviewTags(commentTags),
                        });
                      } else {
                        const created = await db.teacherReviews.insert({
                          student_id: s.student_id,
                          ref_lesson_id: lessonId ?? null,
                          teacher_id: principal?.teacherId ?? '',
                          tags: serializeReviewTags(commentTags),
                          ai_draft: '',
                          teacher_text: commentText.trim(),
                          status: 'confirmed',
                          created_by: principal?.userId ?? '',
                          confirmed_at: Date.now(),
                        } as never);
                        reviewId = created.id;
                      }
                      if (reviewId) await db.submissions.update(s.id, { teacher_review_id: reviewId }, { actorId: principal?.teacherId ?? '', actorRole: 'teacher' });
                      setCommentText('');
                      setCommentTags({});
                      setCommentFor(null);
                    }}
                  >
                    保存评语
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setCommentFor(null)}>
                    取消
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  setCommentText(review?.teacher_text ?? '');
                  setCommentTags(parseReviewTags(review?.tags));
                  setCommentFor(s.id);
                }}
              >
                {TEACHER_COMMENT_LABEL}
              </Button>
            )}
          </div>
        ) : (
          !readOnly && (
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
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  setAddingFor(s.id);
                }}
              >
                新增作品版本
              </Button>
            )}
          </div>
          )
        )}
      </div>
    );
  };

  return (
    <>
      <PageHeader
        title="作业与作品"
        desc={
          isTeacher
            ? '紧凑管理列表：待批改 / 需修改 优先置顶，支持班级 / 学员 / 课节 / 状态筛选与分页。'
            : '查看我的作业与作品版本，可新增版本并重新提交。'
        }
      />

      {/* —— 筛选条 —— */}
      <div className="filters">
        {isTeacher && (
          <>
            <select
              className="select"
              value={classFilter}
              onChange={(e) => {
                setClassFilter(e.target.value);
                resetPage();
              }}
            >
              <option value="all">全部班级</option>
              {data.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="select"
              value={studentFilter}
              onChange={(e) => {
                setStudentFilter(e.target.value);
                resetPage();
              }}
            >
              <option value="all">全部学员</option>
              {data.students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nickname}
                </option>
              ))}
            </select>
            <select
              className="select"
              value={lessonFilter}
              onChange={(e) => {
                setLessonFilter(e.target.value);
                resetPage();
              }}
            >
              <option value="all">全部课节</option>
              {data.lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          </>
        )}
        <select
          className="select"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            resetPage();
          }}
        >
          <option value="all">全部状态</option>
          {ALL_STATUS.map((st) => (
            <option key={st} value={st}>
              {SUBMISSION_LABEL[st]}
            </option>
          ))}
        </select>
        {isTeacher && !readOnly && (
          <div style={{ marginLeft: 'auto' }}>
            <Button variant="primary" size="sm" onClick={() => openAssignment()}>
              新建作业
            </Button>
          </div>
        )}
      </div>

      {/* —— 作业目录（教师布置的作业，含新建 / 未提交作业，可直接查看与编辑） —— */}
      {isTeacher && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">作业目录（教师布置）</div>
          <div className="assignment-dir">
            {data.assignments.map((a) => {
              const cls = classById.get(a.class_id);
              const ls = lessonById.get(a.lesson_id);
              const course = ls ? data.courses.find((c) => c.id === ls.course_id) : undefined;
              return (
                <div key={a.id} className="row spread assignment-dir-row">
                  <div className="col" style={{ gap: 2, minWidth: 0 }}>
                    <strong>{a.title}</strong>
                    <span className="muted" style={{ fontSize: 'var(--fs-secondary)' }}>
                      {cls?.name ?? '—'} · {course?.title ?? '未知课程'} · {ls?.title ?? '—'}
                      {a.due_date ? ` · 截止 ${a.due_date}` : ''}
                    </span>
                  </div>
                  {!readOnly && (
                    <Button size="sm" variant="ghost" onClick={() => openAssignment(a)}>
                      编辑
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* —— 作业管理列表 —— */}
      {pageResult.total === 0 ? (
        <EmptyState title="没有符合条件的作业" hint="换个筛选条件试试。" />
      ) : (
        <>
          <div className="table-wrap">
            <table className="stable works-table">
              <thead>
                <tr>
                  {isTeacher && <th>学员</th>}
                  {isTeacher && <th>班级</th>}
                  <th>作业</th>
                  <th>课节</th>
                  <th>状态</th>
                  <th>提交时间</th>
                  <th>版本</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {pageResult.items.map((s) => {
                  const asg = asgById.get(s.assignment_id);
                  const lesson = asg ? lessonById.get(asg.lesson_id) : undefined;
                  const student = studentById.get(s.student_id);
                  const classRow = asg ? classById.get(asg.class_id) : undefined;
                  const vers = versBySub.get(s.id) ?? [];
                  const latestTime = vers.length ? Math.max(...vers.map((v) => v.created_at)) : s.updated_at;
                  const expanded = expandedId === s.id;
                  return (
                    <Fragment key={s.id}>
                      <tr className="clickable" onClick={() => setExpandedId(expanded ? null : s.id)}>
                        {isTeacher && <td data-label="学员">{student?.nickname ?? '—'}</td>}
                        {isTeacher && <td data-label="班级">{classRow?.name ?? '—'}</td>}
                        <td data-label="作业">{asg?.title ?? '—'}</td>
                        <td data-label="课节">{lesson?.title ?? '—'}</td>
                        <td data-label="状态">
                          <Tag tone={SUBMISSION_TONE[s.status]}>{SUBMISSION_LABEL[s.status]}</Tag>
                        </td>
                        <td data-label="提交时间">{formatDateTime(latestTime)}</td>
                        <td data-label="版本">{vers.length}</td>
                        <td data-label="操作">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedId(expanded ? null : s.id);
                            }}
                          >
                            {expanded ? '收起' : '查看'}
                          </Button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="expand-row">
                          <td colSpan={colCount} data-label="详情">
                            {renderDetail(s.id)}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* —— 分页 —— */}
          <div className="pager">
            <span className="muted">
              共 {pageResult.total} 条｜第 {pageResult.page}/{pageResult.totalPages} 页
            </span>
            <div className="row">
              <Button
                size="sm"
                variant="ghost"
                disabled={pageResult.page <= 1}
                onClick={() => setPage(1)}
              >
                首页
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pageResult.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                上一页
              </Button>
              {pageNumbers.map((pn, i) =>
                pn === '…' ? (
                  <Button key={`e${i}`} size="sm" variant="ghost" disabled>
                    …
                  </Button>
                ) : (
                  <Button
                    key={pn}
                    size="sm"
                    variant={pn === pageResult.page ? 'primary' : 'ghost'}
                    onClick={() => setPage(pn)}
                  >
                    {pn}
                  </Button>
                ),
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={pageResult.page >= pageResult.totalPages}
                onClick={() => setPage((p) => Math.min(pageResult.totalPages, p + 1))}
              >
                下一页
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pageResult.page >= pageResult.totalPages}
                onClick={() => setPage(pageResult.totalPages)}
              >
                末页
              </Button>
            </div>
          </div>
        </>
      )}
      <AssignmentModal
        open={assignmentOpen}
        assignment={editingAssignment}
        onClose={() => setAssignmentOpen(false)}
        onSaved={() => {}}
      />
    </>
  );
}
