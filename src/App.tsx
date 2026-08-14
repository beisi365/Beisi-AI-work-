import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AppShell } from './components/AppShell';
import LoginPage from './pages/LoginPage';
import TeacherOverviewPage from './pages/TeacherOverviewPage';
import StudentHomePage from './pages/StudentHomePage';
import StudentProfilePage from './pages/StudentProfilePage';
import ClassesCoursesPage from './pages/ClassesCoursesPage';
import StudentsListPage from './pages/StudentsListPage';
import WorksPage from './pages/WorksPage';
import TimelinePage from './pages/TimelinePage';
import CourseMapPage from './pages/CourseMapPage';
import PracticeRoomPage from './pages/PracticeRoomPage';
import AssessmentsPage from './pages/cp2/AssessmentsPage';
import ReviewsPage from './pages/cp2/ReviewsPage';
import CommunicationsPage from './pages/cp2/CommunicationsPage';
import AlertsPage from './pages/cp2/AlertsPage';
import TodosPage from './pages/cp2/TodosPage';
import StudentAssessmentsPage from './pages/cp2/StudentAssessmentsPage';
import { isCp2Enabled } from './lib/featureFlags';
// CP2.1 内部开发页：仅 import.meta.env.DEV 下注册，不进入正式导航、不向用户开放
import AssessmentsDevPage from './pages/cp2/AssessmentsDevPage';
import StudentAssessmentsDevPage from './pages/cp2/StudentAssessmentsDevPage';
import type { ReactNode } from 'react';
import { roleHome } from './lib/routeHome';

function RequireAuth({ children }: { children: ReactNode }) {
  const { principal } = useAuth();
  if (!principal) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RoleOnly({ role, children }: { role: 'teacher' | 'student'; children: ReactNode }) {
  const { principal } = useAuth();
  if (!principal) return <Navigate to="/login" replace />;
  if (principal.role !== role) {
    // 越权访问：按当前 principal.role 返回本人首页（学员→/s/home，教师→/t/overview）
    return <Navigate to={roleHome(principal.role)} replace />;
  }
  return <>{children}</>;
}

function HomeRedirect() {
  const { principal } = useAuth();
  if (!principal) return <Navigate to="/login" replace />;
  return <Navigate to={roleHome(principal.role)} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
            {/* CP2 模块路由：导航显示与可访问性均由功能开关控制。assessments 已开放，其余待各 CP2.x 阶段实现 */}
            {isCp2Enabled('assessments') && <Route path="assessments" element={<AssessmentsPage />} />}
            <Route path="reviews" element={<ReviewsPage />} />
            <Route path="communications" element={<CommunicationsPage />} />
            <Route path="alerts" element={<AlertsPage />} />
            <Route path="todos" element={<TodosPage />} />
            {/* 仅开发环境：CP2.1 能力评估内部测试路由（featureFlags.assessments 仍为 false，不进正式导航） */}
            {import.meta.env.DEV && <Route path="dev/assessments" element={<AssessmentsDevPage />} />}
          </Route>

          {/* 学员端 */}
          <Route
            path="/s"
            element={
              <RequireAuth>
                <RoleOnly role="student">
                  <AppShell />
                </RoleOnly>
              </RequireAuth>
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
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
