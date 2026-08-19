import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../data/repository';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../components/ui';
import { HeroSphere } from '../components/HeroSphere';
import type { Principal, Student, Teacher, User } from '../data/types';
import { CATEGORY_LABEL, type StudentCategory } from '../lib/format';
import { isStudentPortalEnabled } from '../lib/featureFlags';

interface StuView extends Student {
  user?: User;
  category: StudentCategory;
}

/** 演示用登录：仅做「教师 / 学员」角色切换，不实现真实账号认证 */
export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [students, setStudents] = useState<StuView[]>([]);
  const [blocked, setBlocked] = useState<string | null>(null);
  const studentPortalEnabled = isStudentPortalEnabled();
  const rolesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      const [ts, sts, us] = await Promise.all([
        db.teachers.list(),
        db.students.list(),
        db.users.list(),
      ]);
      setTeachers(ts);
      setStudents(
        sts.map((s) => ({
          ...s,
          user: us.find((u) => u.id === s.user_id),
          category: inferCategory(s.id),
        })),
      );
    })();
  }, []);

  const enterAsTeacher = (t: Teacher) => {
    const p: Principal = {
      userId: t.user_id,
      role: 'teacher',
      teacherId: t.id,
    };
    login(p);
    navigate('/t/overview');
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
              <p className="hero-login-hint">点击下方任一教师账号即可登录（演示用，仅做角色切换）</p>
              <div className="hero-role-grid">
                {teachers.map((t) => (
                  <button
                    key={t.id}
                    className="hero-role-opt"
                    onClick={() => enterAsTeacher(t)}
                  >
                    <Avatar name="师" size={36} />
                    <div>
                      <div className="hero-role-name">{t.name}</div>
                      <div className="hero-role-sub">{t.subjects}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {studentPortalEnabled ? (
              <div id="role-student" className="hero-role-block">
                <h3 className="hero-login-title">以学员身份进入（示例账号）</h3>
                <p className="hero-login-hint">
                  学员端仅能看到本人数据，看不到其他学员与教师内部备注
                </p>
                <div className="hero-role-grid">
                  {students.map((s) => (
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

      <footer className="hero-foot">© AI 培训学习工作台 · 演示版本</footer>
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