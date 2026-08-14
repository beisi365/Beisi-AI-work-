import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { db } from '../data/repository';
import { ROLE_LABEL } from '../lib/format';
import { Avatar } from './ui';
import { isCp2Enabled, type Cp2Module } from '../lib/featureFlags';

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
  | 'todos';

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
  { to: '/t/classes', label: '班级与课程', icon: 'classes' },
  { to: '/t/students', label: '学员档案', icon: 'students' },
  { to: '/t/works', label: '作业与作品', icon: 'works' },
  { to: '/t/timeline', label: '学习时间线', icon: 'timeline' },
  { to: '/t/course-map', label: '课程地图', icon: 'course-map' },
];

const STUDENT_NAV: NavItem[] = [
  { to: '/s/home', label: '学习首页', icon: 'home' },
  { to: '/s/course-map', label: '课程地图', icon: 'course-map' },
  { to: '/s/works', label: '我的作业', icon: 'works' },
  { to: '/s/timeline', label: '我的时间线', icon: 'timeline' },
  { to: '/s/profile', label: '我的档案', icon: 'profile' },
];

interface Cp2NavItem extends NavItem {
  flag: Cp2Module;
}

// CP2 导航项：flag 关闭时不加入正式导航（未在导航显示为可用入口）
const CP2_TEACHER_NAV: Cp2NavItem[] = [
  { to: '/t/assessments', label: '能力评估', icon: 'assessments', flag: 'assessments' },
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
  const { principal, logout } = useAuth();
  const navigate = useNavigate();
  if (!principal) return null;

  const baseNav = principal.role === 'teacher' ? TEACHER_NAV : STUDENT_NAV;
  const cp2Nav = (principal.role === 'teacher' ? CP2_TEACHER_NAV : CP2_STUDENT_NAV).filter(
    (it) => isCp2Enabled(it.flag),
  );
  const nav = [...baseNav, ...cp2Nav];
  const name = principal.role === 'teacher' ? `教师 ${principal.teacherId}` : `学员 ${principal.studentId}`;

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
          <button className="btn btn--ghost btn--sm" onClick={onReset}>
            重置演示数据
          </button>
        </div>
      </aside>

      <div className="content">
        <header className="topbar">
          <div className="topbar-role">
            <Avatar name={principal.role === 'teacher' ? '师' : '学'} size={32} />
            <div>
              <div className="topbar-name">{name}</div>
              <div className="topbar-sub">{ROLE_LABEL[principal.role]} · 演示角色</div>
            </div>
          </div>
          <button className="btn btn--ghost btn--sm" onClick={() => { logout(); navigate('/login'); }}>
            退出登录
          </button>
        </header>
        <main className="main">
          <Outlet />
        </main>
      </div>

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
    </div>
  );
}
