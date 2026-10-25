import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { UserRole } from '../../types/index.js';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
}) => {
  const { currentUser, isLoading } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-100">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs font-bold text-slate-400">
            {t('جارٍ التحقق من الجلسة والصلاحيات المشفرة...', 'Verifying authenticated session...')}
          </span>
        </div>
      </div>
    );
  }

  // Forceful redirect to /login if unauthenticated
  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Enforce Role-Based Access Control (RBAC)
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(currentUser.role)) {
    // Route to appropriate role landing page if accessing unauthorized role route
    const roleFallbackRoute: Record<UserRole, string> = {
      STUDENT: '/student/dashboard',
      ACADEMIC_ADVISOR: '/advisor/dashboard',
      INSTRUCTOR: '/instructor/grades',
      ADMIN: '/admin/dashboard',
      DEPARTMENT_HEAD: '/department/analytics',
      PROCESS_OFFICER: '/process/records',
    };
    return <Navigate to={roleFallbackRoute[currentUser.role] || '/login'} replace />;
  }

  return <>{children}</>;
};
