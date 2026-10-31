import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { UserRole } from '../../types/index.js';
import { Loader } from '../ui/primitives.js';

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
      <div className="grid min-h-screen place-items-center bg-platform">
        <Loader label={t('جارٍ التحقق من الجلسة…', 'Checking your session…')} />
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
