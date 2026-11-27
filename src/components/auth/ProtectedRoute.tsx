import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { useLanguage } from '../../context/LanguageContext.js';
import { UserRole } from '../../types/index.js';
import { Loader } from '../ui/primitives.js';
import { roleHome } from '../common/navigation.js';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
}) => {
  const { currentUser, isLoading, signedOut } = useAuth();
  const { t } = useLanguage();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-platform">
        <Loader label={t('جارٍ التحقق من الجلسة…', 'Checking your session…')} />
      </div>
    );
  }

  // Not signed in: go to /login. Remember this page only for someone arriving
  // without a session (e.g. a scanned attendance link), never after a sign-out,
  // so the next person to sign in does not land on the previous user's page.
  if (!currentUser) {
    return <Navigate to="/login" state={signedOut ? undefined : { from: location }} replace />;
  }

  // Enforce Role-Based Access Control (RBAC)
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(currentUser.role)) {
    // Route to appropriate role landing page if accessing unauthorized role route
    return <Navigate to={roleHome(currentUser.role)} replace />;
  }

  return <>{children}</>;
};
