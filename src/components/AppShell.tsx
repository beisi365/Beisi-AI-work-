import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { db } from '../data/repository';
import { ROLE_LABEL } from '../lib/format';
import { Avatar } from './ui';
import { isCp2Enabled, type Cp2Module } from '../lib/featureFlags';
import { useDemoMode, DEMO_PRINCIPAL, DEMO_STUDENT_PRINCIPAL } from '../lib/demoMode';
import { roleHome } from '../lib/routeHome';

type IconKey =
  | 'overview'
  | 'classes'
  | 'students'
  | 'works'
  | 'timeline'
  | 'course-map'
  | 'home'
  | 'profile'
  | 'assessments'
  | 'reviews'
  | 'communications'
  | 'alerts'
  | 'todos'
  | 'reports'
  | 'settings'
  | 'schedule'
  | 'more';

function Icon({ k }: { k: IconKey }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const paths: Record<IconKey, JSX.Element> = {
    overview: (
      <>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </>
    ),
    classes: (
      <>
        <path d="M3 8l9-4 9 4-9 4-9-4z" />
        <path d="M7 10v4c0 1 2.5 2 5 2s5-1 5-2v-4" />
      </>
    ),
    students: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
        <path d="M16 6.5a3 3 0 010 5.8" />
      </>
    ),
    works: (
      <>
        <path d="M4 7l8-4 8 4v10l-8 4-8-4V7z" />
        <path d="M4 7l8 4 8-4M12 11v10" />
      </>
    ),
    timeline: (
      <>
        <path d="M5 4v16" />
        <circle cx="5" cy="8" r="2" />
        <circle cx="5" cy="16" r="2" />
        <path d="M7 8h7M7 16h9" />
      </>
    ),
    'course-map': (
      <>
        <path d="M9 4l6 2 6-2v14l-6 2-6-2-6 2V6l6-2z" />
        <path d="M9 4v14M15 6v14" />
      </>
    ),
    home: (
      <>
        <path d="M4 11l8-6 8 6" />
        <path d="M6 10v9h12v-9" />
      </>
    ),
    profile: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6" />
      </>
    ),
    assessments: <path d="M4 19V10M10 19V5M16 19v-7M21 19V9" />,
    reviews: <path d="M5 7l1.5 1.5L9 6M5 13l1.5 1.5L9 12M12 7h7M12 13h7" />,
    communications: <path d="M4 5h16v11H9l-5 4z" />,
    alerts: <path d="M12 4l9 16H3zM12 10v5M12 17.5v.5" />,
    todos: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 12l3 3 5-6" />
      </>
    ),
    reports: <path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6" />,
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
      </>
    ),
    schedule: (
      <>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M3 9h18M8 2v4M16 2v4" />
      </>
    ),
    more: (
      <>
        <circle cx="6" cy="12" r="1.4" />
        <circle cx="12" cy="12" r="1.4" />
        <circle cx="18" cy="12" r="1.4" />
      </>
    ),
  };
  return (
    <svg {...common} aria-hidden>
      {paths[k]}
    </svg>
  );
}

interface NavItem {
  to: string;
  label: string;
  icon: IconKey;
  end?: boolean;
}

const TEACHER_NAV: NavItem[] = [
  { to: '/t/overview', label: '教学总览', icon: 'overview' },
  { to: '/t/students', label: '学员档案', icon: 'students' },
  { to: '/t/classes', label: '课程与出勤', icon: 'classes' },
  { to: '/t/works', label: '作业与作品', icon: 'works' },
  { to: '/t/assessments', label: '考核中心', icon: 'assessments' },
  { to: '/t/schedule', label: '教师排班', icon: 'schedule' },
  { to: '/t/reports', label: '成长报告', icon: 'reports' },
  { to: '/t/settings', label: '系统设置', icon: 'settings' },
];

const STUDENT_NAV: NavItem[] = [
  { to: '/s/home', label: '学习首页', icon: 'home' },
  { to: '/s/course-map', label: '课程地图', icon: 'course-map' },
  { to: '/s/works', label: '我的作业', icon: 'works' },
  { to: '/s/timeline', label: '我的时间线', icon: 'timeline' },
  { to: '/s/profile', label: '我的档案', icon: 'profile' },
];

// 移动端底部导航：最多 5 项（首页 / 学员 / 教学 / 考核 / 更多）。
// 课程与出勤、学习预警、教师待办、成长报告、系统设置收入“更多”抽屉，避免主栏挤压变形。
export const MOBILE_TEACHER_NAV: NavItem[] = [
  { to: '/t/overview', label: '首页', icon: 'overview' },
  { to: '/t/students', label: '学员', icon: 'students' },
  { to: '/t/works', label: '教学', icon: 'works' },
  { to: '/t/assessments', label: '考核', icon: 'assessments' },
];

// “更多”抽屉内的次级导航（与桌面端一致，仅折叠展示）。
// 学习预警 / 教师待办 受 featureFlags 门控：开关关闭时对应入口消失。
type MoreItem = NavItem & { flag?: Cp2Module };
const MOBILE_TEACHER_MORE: MoreItem[] = [
  { to: '/t/classes', label: '课程与出勤', icon: 'classes' },
  { to: '/t/schedule', label: '教师排班', icon: 'schedule' },
  { to: '/t/alerts', label: '学习预警', icon: 'alerts', flag: 'alerts' },
  { to: '/t/todos', label: '教师待办', icon: 'todos', flag: 'todos' },
  { to: '/t/reports', label: '成长报告', icon: 'reports' },
  { to: '/t/settings', label: '系统设置', icon: 'settings' },
];

/** 教师移动端“更多”抽屉内容：受开关门控，关闭则对应入口消失。供单元测试断言。 */
export function getTeacherMobileMoreNav(): NavItem[] {
  return MOBILE_TEACHER_MORE.filter((it) => !it.flag || isCp2Enabled(it.flag));
}

/** 完整导航（桌面侧栏 / 移动端抽屉通用）：基础导航 + 受开关门控的 CP2 入口。供单元测试断言。 */
export function getNav(isTeacher: boolean): NavItem[] {
  const base = isTeacher ? TEACHER_NAV : STUDENT_NAV;
  const cp2 = (isTeacher ? CP2_TEACHER_NAV : CP2_STUDENT_NAV).filter((it) => isCp2Enabled(it.flag));
  return [...base, ...cp2];
}

interface Cp2NavItem extends NavItem {
  flag: Cp2Module;
}

// CP2 导航项：flag 关闭时不加入正式导航（未在导航显示为可用入口）。
// 注意：能力评估已统一命名为「考核中心」并进入教师一级导航（TEACHER_NAV），此处不再单独列出。
const CP2_TEACHER_NAV: Cp2NavItem[] = [
  { to: '/t/reviews', label: '评审管理', icon: 'reviews', flag: 'reviews' },
  { to: '/t/communications', label: '教学沟通', icon: 'communications', flag: 'communications' },
  { to: '/t/alerts', label: '学习预警', icon: 'alerts', flag: 'alerts' },
  { to: '/t/todos', label: '教师待办', icon: 'todos', flag: 'todos' },
];

const CP2_STUDENT_NAV: Cp2NavItem[] = [
  { to: '/s/assessments', label: '我的评估', icon: 'assessments', flag: 'assessments' },
  { to: '/s/reviews', label: '我的评语', icon: 'reviews', flag: 'reviews' },
  { to: '/s/communications', label: '沟通记录', icon: 'communications', flag: 'communications' },
];

export function AppShell() {
  const { principal, login, logout } = useAuth();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const { demo, readOnly } = useDemoMode();
  if (!principal) return null;

  // 演示态视角切换：在教师/学员只读视角间切换（分享演示可看两端），跳转保留 demo 参数保证刷新后身份不丢
  const switchDemoRole = (role: 'teacher' | 'student') => {
    const next = role === 'teacher' ? DEMO_PRINCIPAL : DEMO_STUDENT_PRINCIPAL;
    login(next);
    navigate(roleHome(role) + (role === 'teacher' ? '?demo=1' : '?demo=student'));
  };

  // 运营管理员归入教师端（统管全部教师与排班），仅学员落学员端导航
  const isTeacher = principal.role === 'teacher' || principal.role === 'admin';
  const nav = getNav(isTeacher);
  const name =
    principal.role === 'admin'
      ? '运营管理员'
      : isTeacher
        ? `教师 ${principal.teacherId}`
        : `学员 ${principal.studentId}`;

  const onReset = () => {
    if (window.confirm('确定要重置为初始演示数据吗？所有在本演示中的新增/修改都会丢失。')) {
      db.reset();
    }
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-dot" />
          AI 培训学习工作台
        </div>
        <nav className="nav">
          {nav.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) => `nav-item${isActive ? ' nav-item--active' : ''}`}
            >
              <Icon k={it.icon} />
              <span>{it.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          {!readOnly && (
            <button className="btn btn--ghost btn--sm" onClick={onReset}>
              重置演示数据
            </button>
          )}
        </div>
      </aside>

      <div className="content">
        {demo && (
          <div className="demo-banner">
            <span>演示模式 · 只读（仅供浏览，不可编辑）</span>
            <div className="demo-switch" role="group" aria-label="切换演示视角">
              <button
                type="button"
                className={`demo-switch-btn${principal.role === 'teacher' ? ' is-active' : ''}`}
                onClick={() => switchDemoRole('teacher')}
              >
                教师视角
              </button>
              <button
                type="button"
                className={`demo-switch-btn${principal.role === 'student' ? ' is-active' : ''}`}
                onClick={() => switchDemoRole('student')}
              >
                学员视角
              </button>
            </div>
          </div>
        )}
        <header className="topbar">
          <div className="topbar-role">
            <Avatar
              name={principal.role === 'admin' ? '管' : principal.role === 'teacher' ? '师' : '学'}
              size={32}
            />
            <div>
              <div className="topbar-name">{name}</div>
              {/* 真实登录（运营管理员等）不应标注「演示角色」，仅演示态标注 */}
              <div className="topbar-sub">
                {ROLE_LABEL[principal.role]}
                {readOnly ? ' · 演示角色' : ''}
              </div>
            </div>
          </div>
          {!readOnly && (
            <button className="btn btn--ghost btn--sm" onClick={() => { logout(); navigate('/login'); }}>
              退出登录
            </button>
          )}
        </header>
        <main className="main">
          <Outlet />
        </main>
      </div>

      {isTeacher ? (
        <nav className="mobile-tab">
          {MOBILE_TEACHER_NAV.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              className={({ isActive }) => `mtab${isActive ? ' mtab--active' : ''}`}
            >
              <Icon k={it.icon} />
              <span>{it.label}</span>
            </NavLink>
          ))}
          <button
            type="button"
            className={`mtab${moreOpen ? ' mtab--active' : ''}`}
            onClick={() => setMoreOpen((v) => !v)}
            aria-label="更多"
          >
            <Icon k="more" />
            <span>更多</span>
          </button>
        </nav>
      ) : (
        <nav className="mobile-tab">
          {nav.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              className={({ isActive }) => `mtab${isActive ? ' mtab--active' : ''}`}
            >
              <Icon k={it.icon} />
              <span>{it.label}</span>
            </NavLink>
          ))}
        </nav>
      )}

      {moreOpen && isTeacher && (
        <div className="more-sheet-overlay" onClick={() => setMoreOpen(false)}>
          <div className="more-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="more-sheet-title">更多</div>
            {getTeacherMobileMoreNav().map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                className="more-item"
                onClick={() => setMoreOpen(false)}
              >
                <Icon k={it.icon} />
                <span>{it.label}</span>
              </NavLink>
            ))}
            {!readOnly && (
              <button
                type="button"
                className="more-item more-item--danger"
                onClick={() => {
                  setMoreOpen(false);
                  onReset();
                }}
              >
                <Icon k="alerts" />
                <span>重置演示数据</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
