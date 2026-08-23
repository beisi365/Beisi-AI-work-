import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../data/repository';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/ui';
import { HeroSphere } from '../components/HeroSphere';
import { CosmicBackground } from '../components/CosmicBackground';
import { TeacherEditModal } from '../components/TeacherEditModal';
import type { Principal, Student, Teacher, User } from '../data/types';
import { CATEGORY_LABEL, type StudentCategory } from '../lib/format';
import { isStudentPortalEnabled } from '../lib/featureFlags';
import { isDemoMode, getDemoPrincipal } from '../lib/demoMode';
import { roleHome } from '../lib/routeHome';

interface StuView extends Student {
  user?: User;
  category: StudentCategory;
  class_id?: string;
}

/** 演示用登录：仅做「教师 / 学员」角色切换，不实现真实账号认证 */
export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<StuView[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string; teacher_id?: string }[]>([]);
  const [activeClass, setActiveClass] = useState<string>('cl1');
  const [blocked, setBlocked] = useState<string | null>(null);
  const [editTeacher, setEditTeacher] = useState<Teacher | null>(null);
  const studentPortalEnabled = isStudentPortalEnabled();
  const rolesRef = useRef<HTMLDivElement | null>(null);

  // 只读演示模式：登录页直接跳过，按演示身份（教师/学员）进入对应首页，并保留 demo 参数
  useEffect(() => {
    if (isDemoMode()) {
      const role = getDemoPrincipal().role;
      navigate(roleHome(role) + (role === 'teacher' ? '?demo=1' : '?demo=student'));
    }
  }, [navigate]);

  useEffect(() => {
    (async () => {
      const [ts, sts, us, cls, ens] = await Promise.all([
        db.teachers.list(),
        db.students.list(),
        db.users.list(),
        db.classes.list(),
        db.enrollments.list(),
      ]);
      setTeachers(ts);
      setClasses(cls.map((c) => ({ id: c.id, name: c.name, teacher_id: c.teacher_id })));
      setStudents(
        sts.map((s) => ({
          ...s,
          class_id: ens.find((e) => e.student_id === s.id)?.class_id,
          user: us.find((u) => u.id === s.user_id),
          category: inferCategory(s.id),
        })),
      );
    })();
  }, []);

  // 按 5 个班将学员分 5 段渲染（每段标题=班级专长名，下含该班 25 名学员卡片）
  const studentsByClass = useMemo(() => {
    const order = ['cl1', 'cl2', 'cl3', 'cl4', 'cl5'];
    const nameOf = (cid: string) => classes.find((c) => c.id === cid)?.name ?? cid;
    return order.map((cid) => ({
      id: cid,
      name: nameOf(cid),
      students: students.filter((s) => s.class_id === cid),
    }));
  }, [students, classes]);

  // 默认只显示其中一个班的 25 名学员；通过顶部「老师·班级」切换标签查看其他班
  const teacherNameByClass = (cid: string) => {
    const cls = classes.find((c) => c.id === cid);
    return teachers.find((t) => t.id === cls?.teacher_id)?.name ?? '';
  };
  const activeGroup = studentsByClass.find((g) => g.id === activeClass) ?? studentsByClass[0];

  // 只读演示模式：登录页直接跳过（上方 useEffect 已导航至工作台），这里不渲染任何可交互内容
  if (isDemoMode()) return null;

  const enterAsTeacher = (t: Teacher) => {
    const p: Principal = {
      userId: t.user_id,
      role: 'teacher',
      teacherId: t.id,
    };
    login(p);
    navigate('/t/overview');
  };

  // 重置演示数据：清掉本地缓存的旧 seed 后刷新（仅 dev 演示模式）
  const resetDemoData = () => {
    if (!window.confirm('确认重置演示数据？\n\n这将清空本机的所有本地缓存（包括教师编辑、学员导入等），刷新后重新生成最新演示数据。')) return;
    void db.reset().then(() => location.reload());
  };

  const enterAsStudent = (s: StuView) => {
    // 归档账号禁止登录：展示提示页，不进入系统
    if (s.archived_at) {
      setBlocked(s.nickname);
      return;
    }
    const p: Principal = {
      userId: s.user_id ?? '',
      role: 'student',
      studentId: s.id,
    };
    login(p);
    navigate('/s/home');
  };

  // Hero CTA → 平滑滚动到对应角色入口区 + 短暂高亮
  const scrollToRole = (id: 'role-teacher' | 'role-student') => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.add('flash-highlight');
    window.setTimeout(() => el.classList.remove('flash-highlight'), 1200);
  };

  return (
    <div className="hero-login">
      {/* —— 全屏宇宙背景层（fixed inset:0, 整页沉浸式） —— */}
      <CosmicBackground />

      {/* —— 左侧暗晕：让标题在星海里仍可读 —— */}
      <div className="hero-vignette" aria-hidden="true" />

      {/* —— 内容层（z-index 1,盖在背景之上） —— */}
      <div className="login-page-wrap">
      {/* —— 顶部品牌导航 —— */}
      <header className="hero-nav">
        <div className="hero-brand">AI 培训学习工作台</div>
        <div className="hero-tagline">演示版 · 教师主导模式</div>
      </header>

      {/* —— Hero 分栏：文案 + 旋转球 —— */}
      <section className="hero-grid">
        <div className="hero-text">
          <div className="hero-tag">AI 时代的教学协作空间</div>
          <h1 className="hero-title">
            让每位老师拥有 AI 助教
            <br />
            让每位学员拥有专属教练
          </h1>
          <p className="hero-sub">
            课程、出勤、作业、能力评估与学员档案 — 一个工作台，跑通 AI 培训的全链路闭环。
            数据本地闭环，不依赖外网账号体系。
          </p>
          <div className="hero-ctas">
            <button
              className="hero-cta hero-cta--primary"
              onClick={() => scrollToRole('role-teacher')}
            >
              教师入口 →
            </button>
            {studentPortalEnabled && (
              <button
                className="hero-cta hero-cta--ghost"
                onClick={() => scrollToRole('role-student')}
              >
                学员入口
              </button>
            )}
          </div>
          <div className="hero-stats">
            <div className="hero-stat">
              <div className="hero-stat-num">课程 · 出勤</div>
              <div className="hero-stat-label">排课与场次登记</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-num">作业 · 评估</div>
              <div className="hero-stat-label">提交评审能力闭环</div>
            </div>
          </div>
        </div>

        <div className="hero-visual">
          <HeroSphere />
        </div>
      </section>

      {/* —— 角色入口区（实际登录入口） —— */}
      <section className="hero-login-section" id="login-roles" ref={rolesRef}>
        {blocked ? (
          <div className="hero-blocked">
            <div className="alert-warn" style={{ marginBottom: 16 }}>
              学员「{blocked}」的账号已归档，暂时无法登录。如需恢复访问，请联系老师。
            </div>
            <button
              type="button"
              className="hero-cta hero-cta--ghost"
              onClick={() => setBlocked(null)}
            >
              返回登录
            </button>
          </div>
        ) : (
          <>
            <div id="role-teacher" className="hero-role-block">
              <h3 className="hero-login-title">以教师身份进入</h3>
              <p className="hero-login-hint">点击卡片登录；悬停后点击 ✎ 编辑身份、教学内容与介绍</p>
              <div className="hero-role-grid">
                {teachers.map((t) => (
                  <div key={t.id} className="hero-role-card">
                    <button
                      type="button"
                      className="hero-role-opt"
                      onClick={() => enterAsTeacher(t)}
                    >
                      <Avatar name={t.name} size={36} />
                      <div className="hero-role-text">
                        <div className="hero-role-name">{t.name}</div>
                        <div className="hero-role-title">{t.title ?? 'AI 讲师'}</div>
                        <div className="hero-role-sub">{t.subjects}</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      className="hero-role-edit"
                      aria-label={`编辑 ${t.name} 的资料`}
                      title="编辑资料"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditTeacher(t);
                      }}
                    >
                      ✎
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {studentPortalEnabled ? (
              <div id="role-student" className="hero-role-block">
                <h3 className="hero-login-title">以学员身份进入（示例账号）</h3>
                <p className="hero-login-hint">
                  学员端仅能看到本人数据，看不到其他学员与教师内部备注
                </p>
                <div className="login-student-area">
                  <div className="login-class-tabs">
                    {studentsByClass.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        className={`login-class-tab${activeClass === g.id ? ' login-class-tab--active' : ''}`}
                        onClick={() => setActiveClass(g.id)}
                      >
                        <span className="login-class-tab-label">
                          {teacherNameByClass(g.id)} · {g.name}
                        </span>
                        <span className="login-class-tab-count">{g.students.length}</span>
                      </button>
                    ))}
                  </div>
                  {activeGroup && (
                    <div className="class-group" key={activeGroup.id}>
                      <div className="class-group-head">
                        <span className="class-group-name">{activeGroup.name}</span>
                        <span className="class-group-count">{activeGroup.students.length} 名</span>
                      </div>
                      <div className="hero-role-grid">
                        {activeGroup.students.map((s) => (
                          <button
                            key={s.id}
                            className="hero-role-opt"
                            onClick={() => enterAsStudent(s)}
                          >
                            <Avatar name={s.nickname} size={36} />
                            <div>
                              <div className="hero-role-name">{s.nickname}</div>
                              <div className="hero-role-sub">{CATEGORY_LABEL[s.category]}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="hero-role-block">
                <h3 className="hero-login-title">学员端</h3>
                <div className="alert-info">
                  学员端暂未开放（当前为教师主导模式）。如需启用，请在开发/测试环境或经授权后开启学员端开关。
                </div>
              </div>
            )}

            <div className="hero-login-note">
              {studentPortalEnabled
                ? '提示：学员端仅能看到本人数据，看不到其他学员、教师内部备注与 AI 草稿。教师端可见全部班级与学员。'
                : '当前为教师主导模式，仅支持教师登录与教学管理。'}
            </div>
          </>
        )}
      </section>

      {/* —— 教师编辑弹窗（演示用） —— */}
      <TeacherEditModal
        open={!!editTeacher}
        teacher={editTeacher}
        onClose={() => setEditTeacher(null)}
        onSaved={(updated) => {
          setTeachers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        }}
      />

      <footer className="hero-foot">
        <span>© AI 培训学习工作台 · 演示版本</span>
        <button
          type="button"
          className="hero-reset-btn"
          onClick={resetDemoData}
          title="清空本地缓存并刷新，重新生成最新演示数据"
        >
          ↺ 重置演示数据
        </button>
      </footer>
      </div>
    </div>
  );
}

/** 依据种子分类规则推断演示类别（与 seed.ts 配比一致：前8正常/后5需关注/再4进步/末3较强） */
function inferCategory(id: string): StudentCategory {
  const n = Number(id.replace(/\D/g, ''));
  if (n <= 8) return 'normal';
  if (n <= 13) return 'behind';
  if (n <= 17) return 'progress';
  return 'strong';
}