import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AppShell } from './components/AppShell';
import LoginPage from './pages/LoginPage';
import TeacherOverviewPage from './pages/TeacherOverviewPage';
import StudentHomePage from './pages/StudentHomePage';
import StudentProfilePage from './pages/StudentProfilePage';
import ClassesCoursesPage from './pages/ClassesCoursesPage';
import StudentsListPage from './pages/StudentsListPage';
import SettingsPage from './pages/SettingsPage';
import WorksPage from './pages/WorksPage';
import TimelinePage from './pages/TimelinePage';
import CourseMapPage from './pages/CourseMapPage';
import PracticeRoomPage from './pages/PracticeRoomPage';
import AssessmentsPage from './pages/cp2/AssessmentsPage';
import { Cp2Placeholder } from './pages/cp2/Cp2Placeholder';
import ReviewsPage from './pages/cp2/ReviewsPage';
import CommunicationsPage from './pages/cp2/CommunicationsPage';
import AlertsPage from './pages/cp2/AlertsPage';
import TodosPage from './pages/cp2/TodosPage';
import TeacherScheduleListPage from './pages/TeacherScheduleListPage';
import TeacherScheduleDetailPage from './pages/TeacherScheduleDetailPage';
import StudentAssessmentsPage from './pages/cp2/StudentAssessmentsPage';
import { isCp2Enabled, isStudentPortalEnabled } from './lib/featureFlags';
// CP2.1 内部开发页：仅 import.meta.env.DEV 下注册，不进入正式导航、不向用户开放
import AssessmentsDevPage from './pages/cp2/AssessmentsDevPage';
import StudentAssessmentsDevPage from './pages/cp2/StudentAssessmentsDevPage';
import type { ReactNode } from 'react';
import { roleHome } from './lib/routeHome';
import { DemoModeProvider, isDemoMode, useDemoMode } from './lib/demoMode';

/** 登录态恢复中的占位（supabase 异步恢复会话期间），避免守卫在恢复完成前误判未登录 */
function AuthRestoring() {
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#8A8F98',
      }}
    >
      正在恢复登录…
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { principal, ready } = useAuth();
  // 只读演示模式：跳过登录校验，直接使用演示身份渲染
  if (isDemoMode()) return <>{children}</>;
  // 会话恢复中：先占位，等 ready 后再判定，否则刷新页面会被误踢回登录页
  if (!ready) return <AuthRestoring />;
  if (!principal) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RoleOnly({ role, children }: { role: 'teacher' | 'student'; children: ReactNode }) {
  const { principal, ready } = useAuth();
  // 只读演示模式：放行所有角色守卫（演示身份恒为教师）
  if (!isDemoMode()) {
    if (!ready) return <AuthRestoring />;
    if (!principal) return <Navigate to="/login" replace />;
    // 运营管理员视同该端角色放行（admin 统管教师端与学员端）
    if (principal.role !== role && principal.role !== 'admin') {
      // 越权访问：按当前 principal.role 返回本人首页（学员→/s/home，教师/运营→/t/overview）
      return <Navigate to={roleHome(principal.role)} replace />;
    }
  }
  return <>{children}</>;
}

function HomeRedirect() {
  const { principal, ready } = useAuth();
  if (!ready) return <AuthRestoring />;
  if (!principal) return <Navigate to="/login" replace />;
  // 演示态：跳转时保留 demo 参数，避免 SPA 跳转丢失只读身份（教师 → ?demo=1，学员 → ?demo=student）
  const demoQ = isDemoMode()
    ? principal.role === 'teacher'
      ? '?demo=1'
      : '?demo=student'
    : '';
  return <Navigate to={roleHome(principal.role) + demoQ} replace />;
}

/** 学员端关闭时的提示页：显示「学员端暂未开放」并可返回教师登录 */
function StudentPortalClosed() {
  const navigate = useNavigate();
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-head">
          <h1>AI 培训学习工作台</h1>
          <div className="alert-info" style={{ marginTop: 16 }}>
            学员端暂未开放（当前为教师主导模式）。
          </div>
          <button
            type="button"
            className="btn btn--primary"
            style={{ marginTop: 16 }}
            onClick={() => navigate('/login')}
          >
            返回教师登录
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 学员端可达性守卫：置于 /s 路由最外层。
 * 无论是否登录，关闭学员端时直接访问 /s/* 均展示关闭提示，而非静默跳登录或越权重定向。
 * 学员端路由定义保留（页面/数据/权限守卫/测试不删除），仅通过开关控制可达性。
 */
function StudentPortalGuard({ children }: { children: ReactNode }) {
  if (!isStudentPortalEnabled()) return <StudentPortalClosed />;
  return <>{children}</>;
}

/**
 * 演示态 URL 参数保持器：SPA 内部导航（侧栏 NavLink、页面内 navigate）可能丢失 ?demo 参数，
 * 导致刷新后退出演示态或学员端守卫误判。此组件在演示态下监听路由变化，
 * 若当前 URL 已无 demo 参数则自动 replace 补回（教师 → ?demo=1，学员 → ?demo=student）。
 */
function DemoParamKeeper() {
  const { demo } = useDemoMode();
  const { principal } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!demo || !principal) return;
    const q = new URLSearchParams(location.search);
    if (q.has('demo') || q.has('readonly') || q.get('mode') === 'demo') return;
    const roleQ = principal.role === 'teacher' ? '?demo=1' : '?demo=student';
    navigate(location.pathname + roleQ, { replace: true });
  }, [demo, principal, location.pathname, location.search, navigate]);

  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <DemoModeProvider demo={isDemoMode()}>
        <BrowserRouter>
          <DemoParamKeeper />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<HomeRedirect />} />

          {/* 教师端 */}
          <Route
            path="/t"
            element={
              <RequireAuth>
                <RoleOnly role="teacher">
                  <AppShell />
                </RoleOnly>
              </RequireAuth>
            }
          >
            <Route path="overview" element={<TeacherOverviewPage />} />
            <Route path="classes" element={<ClassesCoursesPage />} />
            <Route path="students" element={<StudentsListPage />} />
            <Route path="students/:id" element={<StudentProfilePage />} />
            <Route path="works" element={<WorksPage />} />
            <Route path="timeline" element={<TimelinePage />} />
            <Route path="course-map" element={<CourseMapPage />} />
            <Route path="course-map/:lessonId" element={<PracticeRoomPage />} />
            {/* 考核中心：导航一级入口（能力评估统一命名）。CP2.1 已实现真实能力评估页，
                故始终注册路由指向真实 AssessmentsPage，避免导航死链；reports/settings 仍为规划占位。
                注意：此路由暴露的是已构建的评估页，并非 P2.1 范围外的“正式考核”工作流。 */}
            <Route path="assessments" element={<AssessmentsPage />} />
            <Route path="reviews" element={<ReviewsPage />} />
            <Route path="communications" element={<CommunicationsPage />} />
            <Route path="alerts" element={<AlertsPage />} />
            <Route path="todos" element={<TodosPage />} />
            {/* 教师排班（时间排版表）：总表总览 + 单老师下钻编辑 */}
            <Route path="schedule" element={<TeacherScheduleListPage />} />
            <Route path="schedule/:teacherId" element={<TeacherScheduleDetailPage />} />
            {/* 仅开发环境：CP2.1 能力评估内部测试路由（featureFlags.assessments 仍为 false，不进正式导航） */}
            {import.meta.env.DEV && <Route path="dev/assessments" element={<AssessmentsDevPage />} />}
            {/* P2.1 规划中模块：进入一级导航但内容为「规划中」占位，阶段验收后替换真实实现 */}
            <Route path="reports" element={<Cp2Placeholder title="成长报告" phase="P2.3 之后" />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          {/* 学员端：教师主导模式下默认关闭。StudentPortalGuard 置于路由最外层，
              无论是否登录，直接访问 /s/* 均显示「学员端暂未开放」并可返回教师登录。
              学员端路由本身不删除（保留页面/权限守卫/测试），仅通过开关控制可达性。 */}
          <Route
            path="/s"
            element={
              <StudentPortalGuard>
                <RequireAuth>
                  <RoleOnly role="student">
                    <AppShell />
                  </RoleOnly>
                </RequireAuth>
              </StudentPortalGuard>
            }
          >
            <Route path="home" element={<StudentHomePage />} />
            <Route path="course-map" element={<CourseMapPage />} />
            <Route path="course-map/:lessonId" element={<PracticeRoomPage />} />
            <Route path="works" element={<WorksPage />} />
            <Route path="timeline" element={<TimelinePage />} />
            <Route path="profile" element={<StudentProfilePage />} />
            {/* CP2 模块路由：学员侧只读入口，导航显示与可访问性均由功能开关控制。assessments 已开放 */}
            {isCp2Enabled('assessments') && <Route path="assessments" element={<StudentAssessmentsPage />} />}
            <Route path="reviews" element={<ReviewsPage />} />
            <Route path="communications" element={<CommunicationsPage />} />
            {/* 仅开发环境：学员只读能力评估内部测试路由 */}
            {import.meta.env.DEV && <Route path="dev/assessments" element={<StudentAssessmentsDevPage />} />}
            {/* 兜底：未定义的 /s/* 子路径。关闭态由外层 StudentPortalGuard 拦截显示关闭页；
                开启态则重定向到学员首页，避免空白页。 */}
            <Route path="*" element={<Navigate to="/s/home" replace />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </DemoModeProvider>
    </AuthProvider>
  );
}
