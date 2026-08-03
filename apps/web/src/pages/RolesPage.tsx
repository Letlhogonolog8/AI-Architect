import { useQuery } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { Badge, PageHeader, Panel, Surface } from '@aegisdrive/ui';
import type { Role } from '@aegisdrive/types';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/app/query-client';
import { QueryState } from '@/components/common/QueryState';

/**
 * The authorisation policy, rendered read-only.
 *
 * There is no edit affordance and that is the design. Role definitions live in
 * `ROLE_PERMISSIONS` in `@aegisdrive/shared`, change through code review, and
 * are reconciled into the database by the seed. An editable permission matrix
 * in the browser is a privilege-escalation primitive.
 */
export function RolesPage() {
  const roles = useQuery({
    queryKey: queryKeys.roles.all,
    queryFn: () => api.get<Role[]>('/roles'),
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Roles & permissions"
        description="The six system roles and exactly what each one may do."
        actions={
          <Badge tone="neutral">
            <Lock className="size-3" aria-hidden />
            Managed in code
          </Badge>
        }
      />

      <QueryState
        isLoading={roles.isLoading}
        error={roles.error}
        onRetry={() => void roles.refetch()}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {roles.data?.map((role) => (
            <Panel
              key={role.id}
              title={role.displayName}
              description={role.description}
              actions={
                <Badge tone={role.name === 'ADMIN' ? 'danger' : 'accent'}>
                  {role.userCount} {role.userCount === 1 ? 'user' : 'users'}
                </Badge>
              }
            >
              <Surface elevation="flat" padding="sm">
                <p className="text-overline font-semibold uppercase text-ink-tertiary">
                  {role.permissions.length} permissions
                </p>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {role.permissions.map((permission) => (
                    <li
                      key={permission}
                      className="rounded-pill border border-hairline bg-white/4 px-2 py-0.5 font-mono text-[10px] text-ink-secondary"
                    >
                      {permission}
                    </li>
                  ))}
                </ul>
              </Surface>
            </Panel>
          ))}
        </div>
      </QueryState>
    </div>
  );
}
