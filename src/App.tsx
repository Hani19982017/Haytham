import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { LanguageProvider, useLanguage } from './context/LanguageContext.js';
import { Header } from './components/common/Header.js';
import { Sidebar } from './components/common/Sidebar.js';

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

const AppContent: React.FC = () => {
  const { currentUser, isLoading } = useAuth();
  const { t } = useLanguage();
  const [currentTab, setCurrentTab] = useState<string>('student-dashboard');

  // Automatically update tab when switching user role
  useEffect(() => {
    if (!currentUser) return;
    switch (currentUser.role) {
      case 'STUDENT':
        setCurrentTab('student-dashboard');
        break;
      case 'ACADEMIC_ADVISOR':
        setCurrentTab('advisor-dashboard');
        break;
      case 'INSTRUCTOR':
        setCurrentTab('instructor-grades');
        break;
      case 'ADMIN':
        setCurrentTab('admin-dashboard');
        break;
      case 'DEPARTMENT_HEAD':
        setCurrentTab('head-analytics');
        break;
      case 'PROCESS_OFFICER':
        setCurrentTab('process-records');
        break;
      default:
        setCurrentTab('student-dashboard');
    }
  }, [currentUser?.role, currentUser?.id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
          <span className="text-xs font-bold text-slate-500">
            {t('جارٍ تشغيل محرك المستشار الأكاديمي الذكي...', 'Initializing Smart Academic Advisor Engine...')}
          </span>
        </div>
      </div>
    );
  }

  const renderActiveView = () => {
    switch (currentTab) {
      // Student
      case 'student-dashboard':
        return <StudentDashboard onNavigateTab={setCurrentTab} />;
      case 'student-recommendations':
        return <RecommendationsView onNavigateTab={setCurrentTab} />;
      case 'student-study-plan':
        return <StudyPlanView />;
      case 'student-what-if':
        return <WhatIfSimulator />;
      case 'student-gpa-plan':
        return <GpaImprovementView />;
      case 'student-registration':
        return <CourseRegistrationView />;
      case 'student-training':
        return <SummerTrainingView />;

      // Advisor
      case 'advisor-dashboard':
      case 'advisor-plans':
      case 'advisor-students':
        return <AdvisorDashboard currentTab={currentTab} onNavigateTab={setCurrentTab} />;

      // Instructor
      case 'instructor-grades':
      case 'instructor-attendance':
        return <InstructorDashboard currentTab={currentTab} onNavigateTab={setCurrentTab} />;

      // Admin
      case 'admin-dashboard':
      case 'admin-courses':
      case 'admin-offerings':
      case 'admin-rules':
      case 'admin-import':
      case 'admin-audit':
        return <AdminDashboard currentTab={currentTab} onNavigateTab={setCurrentTab} />;

      // Department Head
      case 'head-analytics':
      case 'head-hotspots':
      case 'head-seats':
        return <DepartmentHeadDashboard currentTab={currentTab} onNavigateTab={setCurrentTab} />;

      // Process Officer
      case 'process-records':
        return <ProcessOfficerRecordsView />;

      default:
        return <StudentDashboard onNavigateTab={setCurrentTab} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <Header />
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col md:flex-row gap-6">
        <Sidebar currentTab={currentTab} onSelectTab={setCurrentTab} />
        <main className="flex-1 min-w-0">
          {renderActiveView()}
        </main>
      </div>

      {/* University Footer */}
      <footer className="bg-white border-t border-slate-200 mt-auto py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
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

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </LanguageProvider>
  );
}
