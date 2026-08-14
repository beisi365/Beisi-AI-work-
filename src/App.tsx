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
import type { ReactNode } from 'react';

function RequireAuth({ children }: { children: ReactNode }) {
  const { principal } = useAuth();
  if (!principal) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RoleOnly({ role, children }: { role: 'teacher' | 'student'; children: ReactNode }) {
  const { principal } = useAuth();
  if (!principal) return <Navigate to="/login" replace />;
  if (principal.role !== role) {
    return <Navigate to={role === 'teacher' ? '/t/overview' : '/s/home'} replace />;
  }
  return <>{children}</>;
}

function HomeRedirect() {
  const { principal } = useAuth();
  if (!principal) return <Navigate to="/login" replace />;
  return <Navigate to={principal.role === 'teacher' ? '/t/overview' : '/s/home'} replace />;
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
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
