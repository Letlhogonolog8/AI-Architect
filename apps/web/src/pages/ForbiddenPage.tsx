import { Link } from 'react-router';
import { ShieldX } from 'lucide-react';
import { EmptyState, Surface } from '@aegisdrive/ui';
import { useCurrentUser } from '@/stores/auth.store';
import { routes } from '@/config/routes';

/**
 * Shown when a route guard rejects navigation.
 *
 * States plainly that the attempt was recorded — the API writes a
 * `PERMISSION_DENIED` audit entry for the equivalent request — because a user
 * who does not know their access is logged will keep probing.
 */
export function ForbiddenPage() {
  const user = useCurrentUser();

  return (
    <div className="grid min-h-[60vh] place-items-center px-4">
      <Surface elevation="raised" padding="lg" className="w-full max-w-md">
        <EmptyState
          size="full"
          icon={<ShieldX className="size-5 text-signal-warning" aria-hidden />}
          title="You do not have access to this area"
          description={`Your roles (${user?.roles.join(', ') ?? 'none'}) do not include the permission this screen requires. Access attempts are recorded in the audit trail.`}
          action={
            <Link
              to={routes.dashboard}
              className="text-xs font-medium text-aegis-300 hover:underline"
            >
              Return to the dashboard
            </Link>
          }
        />
      </Surface>
    </div>
  );
}
