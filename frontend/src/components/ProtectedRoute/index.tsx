import { type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/auth';
import { ROUTES } from '../../config/routes';

interface Props {
  children: ReactNode;
}

export function ProtectedRoute({ children }: Props) {
  const { user } = useAuth();

  if (!user) return <Navigate to={ROUTES.login} replace />;
  return <>{children}</>;
}
