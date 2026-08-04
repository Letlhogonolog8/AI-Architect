import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import type { Permission } from '@aegisdrive/types';
import { useAuthStore } from '@/stores/auth.store';
import { routes } from '@/config/routes';
import { LoadingScreen } from '@/components/common/LoadingScreen';

/**
 * Route guards.
 *
 * These control *navigation*, not access. Every endpoint behind these screens
 * is independently authorised by the API; a user who edits their local storage
 * to walk past a guard reaches a page whose every request returns 403. The
 * guards exist so legitimate users are not shown doors they cannot open.
 */

/** Blocks unauthenticated navigation and remembers where the user was headed. */
export function RequireAuth(): ReactNode {
  const user = useAuthStore((state) => state.user);
  const isInitialising = useAuthStore((state) => state.isInitialising);
  const location = useLocation();

  // Rendering the redirect before rehydration finishes would bounce every
  // returning user to the login screen on a hard refresh.
  if (isInitialising) return <LoadingScreen label="Restoring session" />;

  if (!user) {
    return <Navigate to={routes.login} replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

/** Sends an already-authenticated user away from the login screen. */
export function RequireAnonymous(): ReactNode {
  const user = useAuthStore((state) => state.user);
  const isInitialising = useAuthStore((state) => state.isInitialising);

  if (isInitialising) return <LoadingScreen label="Restoring session" />;
  if (user) return <Navigate to={routes.dashboard} replace />;

  return <Outlet />;
}

interface RequirePermissionProps {
  /** The principal needs at least one of these. */
  anyOf: readonly Permission[];
}

/** Gates a route subtree on permission. */
export function RequirePermission({ anyOf }: RequirePermissionProps): ReactNode {
  const canAny = useAuthStore((state) => state.canAny);

  if (!canAny(anyOf)) return <Navigate to={routes.forbidden} replace />;

  return <Outlet />;
}

interface CanProps {
  anyOf: readonly Permission[];
  children: ReactNode;
  /** Rendered instead of the children when the permission is absent. */
  fallback?: ReactNode;
}

/**
 * Conditional rendering for individual affordances — a delete button, an
 * immobilise control — rather than whole routes.
 */
export function Can({ anyOf, children, fallback = null }: CanProps): ReactNode {
  const canAny = useAuthStore((state) => state.canAny);
  return canAny(anyOf) ? children : fallback;
}
