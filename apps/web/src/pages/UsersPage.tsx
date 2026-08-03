import { useQuery } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { Badge, Button, PageHeader, Panel } from '@aegisdrive/ui';
import { fullName, relativeTime } from '@aegisdrive/shared';
import type { Paginated, User } from '@aegisdrive/types';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/app/query-client';
import { QueryState } from '@/components/common/QueryState';
import { Can } from '@/features/auth/RouteGuards';

const STATUS_TONE = {
  ACTIVE: 'success',
  INVITED: 'accent',
  SUSPENDED: 'warning',
  DEACTIVATED: 'neutral',
} as const;

export function UsersPage() {
  const filters = { pageSize: 50 };

  const users = useQuery({
    queryKey: queryKeys.users.list(filters),
    queryFn: () => api.get<Paginated<User>>('/users', { query: filters }),
  });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Users"
        description="Everyone with access to this organisation's console, and the roles they hold."
        actions={
          <Can anyOf={['user:create']}>
            <Button
              variant="primary"
              size="sm"
              leadingIcon={<UserPlus className="size-4" aria-hidden />}
            >
              Invite user
            </Button>
          </Can>
        }
      />

      <Panel title={users.data ? `${users.data.meta.totalItems} users` : 'Users'}>
        <QueryState
          isLoading={users.isLoading}
          error={users.error}
          isEmpty={users.data?.items.length === 0}
          emptyTitle="No users yet"
          onRetry={() => void users.refetch()}
        >
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-hairline text-left">
                  {['Name', 'Email', 'Roles', 'Status', 'Last sign-in'].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="px-3 py-2 text-overline font-semibold uppercase text-ink-tertiary first:pl-5 last:pr-5"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {users.data?.items.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-hairline/60 transition-colors last:border-0 hover:bg-white/3"
                  >
                    <td className="py-3 pl-5 pr-3 text-xs font-medium text-ink-primary">
                      {fullName(user.firstName, user.lastName)}
                    </td>
                    <td className="px-3 py-3 text-xs text-ink-secondary">{user.email}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((role) => (
                          <Badge key={role} tone={role === 'ADMIN' ? 'danger' : 'neutral'}>
                            {role}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={STATUS_TONE[user.status]}>{user.status}</Badge>
                    </td>
                    <td className="py-3 pl-3 pr-5 text-xs text-ink-tertiary">
                      {user.lastLoginAt ? relativeTime(user.lastLoginAt) : 'Never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </QueryState>
      </Panel>
    </div>
  );
}
