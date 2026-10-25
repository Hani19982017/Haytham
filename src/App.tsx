import React, { useState, useEffect } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { LanguageProvider, useLanguage } from './context/LanguageContext.js';
import { Header } from './components/common/Header.js';
import { Sidebar } from './components/common/Sidebar.js';
import { LoginView } from './components/auth/LoginView.js';
import { ProtectedRoute } from './components/auth/ProtectedRoute.js';

// Views
import { StudentDashboard } from './components/student/StudentDashboard.js';
import { RecommendationsView } from './components/student/RecommendationsView.js';
import { StudyPlanView } from './components/student/StudyPlanView.js';
import { WhatIfSimulator } from './components/student/WhatIfSimulator.js';
import { GpaImprovementView } from './components/student/GpaImprovementView.js';
import { CourseRegistrationView } from './components/student/CourseRegistrationView.js';
import { SummerTrainingView } from './components/student/SummerTrainingView.js';
import { AdvisorDashboard } from './components/advisor/AdvisorDashboard.js';
import { InstructorDashboard } from './components/instructor/InstructorDashboard.js';
import { AdminDashboard } from './components/admin/AdminDashboard.js';
import { DepartmentHeadDashboard } from './components/department/DepartmentHeadDashboard.js';
import { ProcessOfficerRecordsView } from './components/process/ProcessOfficerRecordsView.js';

// Helper to map URL pathname to sidebar tab
const getTabFromPath = (pathname: string): string => {
  const p = pathname.replace(/^\//, '');
  if (!p || p === 'student' || p === 'student/dashboard') return 'student-dashboard';
  if (p === 'student/recommendations') return 'student-recommendations';
  if (p === 'student/study-plan') return 'student-study-plan';
  if (p === 'student/what-if') return 'student-what-if';
  if (p === 'student/gpa-plan') return 'student-gpa-plan';
  if (p === 'student/registration') return 'student-registration';
  if (p === 'student/training') return 'student-training';

  if (p === 'advisor' || p === 'advisor/dashboard') return 'advisor-dashboard';
  if (p === 'advisor/plans') return 'advisor-plans';
  if (p === 'advisor/students') return 'advisor-students';

  if (p === 'instructor' || p === 'instructor/grades') return 'instructor-grades';
  if (p === 'instructor/attendance') return 'instructor-attendance';

  if (p === 'admin' || p === 'admin/dashboard') return 'admin-dashboard';
  if (p === 'admin/users') return 'admin-users';
  if (p === 'admin/courses') return 'admin-courses';
  if (p === 'admin/offerings') return 'admin-offerings';
  if (p === 'admin/rules') return 'admin-rules';
  if (p === 'admin/import') return 'admin-import';
  if (p === 'admin/audit') return 'admin-audit';

  if (p === 'department' || p === 'department/analytics') return 'head-analytics';
  if (p === 'department/hotspots') return 'head-hotspots';
  if (p === 'department/seats') return 'head-seats';

  if (p === 'process' || p === 'process/records') return 'process-records';

  return 'student-dashboard';
};

// Map sidebar tab selection back to URL route
const getPathFromTab = (tab: string): string => {
  switch (tab) {
    case 'student-dashboard':
      return '/student/dashboard';
    case 'student-recommendations':
      return '/student/recommendations';
    case 'student-study-plan':
      return '/student/study-plan';
    case 'student-what-if':
      return '/student/what-if';
    case 'student-gpa-plan':
      return '/student/gpa-plan';
    case 'student-registration':
      return '/student/registration';
    case 'student-training':
      return '/student/training';

    case 'advisor-dashboard':
      return '/advisor/dashboard';
    case 'advisor-plans':
      return '/advisor/plans';
    case 'advisor-students':
      return '/advisor/students';

    case 'instructor-grades':
      return '/instructor/grades';
    case 'instructor-attendance':
      return '/instructor/attendance';

    case 'admin-dashboard':
      return '/admin/dashboard';
    case 'admin-users':
      return '/admin/users';
    case 'admin-courses':
      return '/admin/courses';
    case 'admin-offerings':
      return '/admin/offerings';
    case 'admin-rules':
      return '/admin/rules';
    case 'admin-import':
      return '/admin/import';
    case 'admin-audit':
      return '/admin/audit';

    case 'head-analytics':
      return '/department/analytics';
    case 'head-hotspots':
      return '/department/hotspots';
    case 'head-seats':
      return '/department/seats';

    case 'process-records':
      return '/process/records';

    default:
      return '/student/dashboard';
  }
};

const DashboardLayout: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const currentTab = getTabFromPath(location.pathname);

  const handleSelectTab = (tab: string) => {
    navigate(getPathFromTab(tab));
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Header />
      <div className="flex-1 w-full max-w-[98%] 2xl:max-w-[1750px] mx-auto px-3 sm:px-4 lg:px-6 py-6 flex flex-col md:flex-row gap-5">
        <Sidebar currentTab={currentTab} onSelectTab={handleSelectTab} />
        <main className="flex-1 min-w-0">
          <Routes>
            {/* Student Protected Routes */}
            <Route
              path="/student/dashboard"
              element={<StudentDashboard onNavigateTab={handleSelectTab} />}
            />
            <Route
              path="/student/recommendations"
              element={<RecommendationsView onNavigateTab={handleSelectTab} />}
            />
            <Route path="/student/study-plan" element={<StudyPlanView onNavigateTab={handleSelectTab} />} />
            <Route path="/student/what-if" element={<WhatIfSimulator />} />
            <Route path="/student/gpa-plan" element={<GpaImprovementView onNavigateTab={handleSelectTab} />} />
            <Route path="/student/registration" element={<CourseRegistrationView />} />
            <Route path="/student/training" element={<SummerTrainingView />} />

            {/* Advisor Protected Routes */}
            <Route
              path="/advisor/*"
              element={
                <ProtectedRoute allowedRoles={['ACADEMIC_ADVISOR', 'ADMIN']}>
                  <AdvisorDashboard currentTab={currentTab} onNavigateTab={handleSelectTab} />
                </ProtectedRoute>
              }
            />

            {/* Instructor Protected Routes */}
            <Route
              path="/instructor/*"
              element={
                <ProtectedRoute allowedRoles={['INSTRUCTOR', 'ADMIN']}>
                  <InstructorDashboard currentTab={currentTab} onNavigateTab={handleSelectTab} />
                </ProtectedRoute>
              }
            />

            {/* Admin Protected Routes */}
            <Route
              path="/admin/*"
              element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <AdminDashboard currentTab={currentTab} onNavigateTab={handleSelectTab} />
                </ProtectedRoute>
              }
            />

            {/* Department Head Protected Routes */}
            <Route
              path="/department/*"
              element={
                <ProtectedRoute allowedRoles={['DEPARTMENT_HEAD', 'ADMIN']}>
                  <DepartmentHeadDashboard currentTab={currentTab} onNavigateTab={handleSelectTab} />
                </ProtectedRoute>
              }
            />

            {/* Process Officer Protected Routes */}
            <Route
              path="/process/*"
              element={
                <ProtectedRoute allowedRoles={['PROCESS_OFFICER', 'ADMIN']}>
                  <ProcessOfficerRecordsView />
                </ProtectedRoute>
              }
            />

            {/* Catch-all for inside protected area */}
            <Route path="*" element={<Navigate to="/student/dashboard" replace />} />
          </Routes>
        </main>
      </div>

      {/* University Footer */}
      <footer className="bg-white border-t border-slate-200 mt-auto py-5 text-center text-xs text-slate-500">
        <div className="w-full max-w-[98%] 2xl:max-w-[1750px] mx-auto px-3 sm:px-4 lg:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>
            <span className="font-bold text-slate-800">
              {t('مشروع التخرج: المستشار الأكاديمي الذكي (Smart Academic Advisor)', 'Graduation Project: Smart Academic Advisor')}
            </span>
            <span className="mx-2">|</span>
            <span>{t('برنامج علوم الحاسب بنظام الساعات المعتمدة', 'Credit-Hour Computer Science Degree Program')}</span>
          </div>
          <div className="text-[11px] text-slate-400">
            {t('متوافق مع قواعد وبيانات نظام ابن الهيثم لإدارة شؤون الطلاب والامتحانات', 'Compatible with Ibn Al-Haitham University SIS Engine')}
          </div>
        </div>
      </footer>
    </div>
  );
};

// Root index redirector based on authenticated user's role
const RoleBasedRedirect: React.FC = () => {
  const { currentUser, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-100">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  switch (currentUser.role) {
    case 'ADMIN':
      return <Navigate to="/admin/dashboard" replace />;
    case 'ACADEMIC_ADVISOR':
      return <Navigate to="/advisor/dashboard" replace />;
    case 'INSTRUCTOR':
      return <Navigate to="/instructor/grades" replace />;
    case 'DEPARTMENT_HEAD':
      return <Navigate to="/department/analytics" replace />;
    case 'PROCESS_OFFICER':
      return <Navigate to="/process/records" replace />;
    case 'STUDENT':
    default:
      return <Navigate to="/student/dashboard" replace />;
  }
};

const LoginPageContainer: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  // If already logged in, redirect to appropriate role dashboard immediately
  useEffect(() => {
    if (currentUser) {
      switch (currentUser.role) {
        case 'ADMIN':
          navigate('/admin/dashboard', { replace: true });
          break;
        case 'ACADEMIC_ADVISOR':
          navigate('/advisor/dashboard', { replace: true });
          break;
        case 'INSTRUCTOR':
          navigate('/instructor/grades', { replace: true });
          break;
        case 'DEPARTMENT_HEAD':
          navigate('/department/analytics', { replace: true });
          break;
        case 'PROCESS_OFFICER':
          navigate('/process/records', { replace: true });
          break;
        case 'STUDENT':
        default:
          navigate('/student/dashboard', { replace: true });
          break;
      }
    }
  }, [currentUser, navigate]);

  return (
    <LoginView
      onSuccess={() => {
        // Will trigger the above redirect effect once currentUser updates in AuthContext
      }}
    />
  );
};

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Login Route */}
            <Route path="/login" element={<LoginPageContainer />} />

            {/* Root Route: Redirects based on auth status and role */}
            <Route path="/" element={<RoleBasedRedirect />} />

            {/* All Protected Dashboard Routes */}
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}
