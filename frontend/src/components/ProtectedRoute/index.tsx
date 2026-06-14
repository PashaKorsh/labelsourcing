import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/context/auth';
import { ROUTES } from '@/config/routes';
import { hasRole } from '@/config/permissions';

interface Props {
  children: ReactNode;
  roles?: string[];
}

export function ProtectedRoute({ children, roles = [] }: Props) {
  const { user } = useAuth();

  if (!user) return <Navigate to={ROUTES.login} replace />;
  if (!hasRole(user.roles, roles)) return <Navigate to={ROUTES.home} replace />;
  return <>{children}</>;
}
