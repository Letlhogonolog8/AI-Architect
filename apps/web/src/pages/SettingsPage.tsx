import { useQuery } from '@tanstack/react-query';
import { Panel, StatusPill, Surface } from '@aegisdrive/ui';
import type { Organization } from '@aegisdrive/types';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/app/query-client';
import { QueryState } from '@/components/common/QueryState';
import { PlaceholderPage } from '@/components/common/PlaceholderPage';
import { useCurrentUser } from '@/stores/auth.store';

export function SettingsPage() {
  const user = useCurrentUser();

  const organization = useQuery({
    queryKey: queryKeys.organization.current,
    queryFn: () => api.get<Organization>('/organization'),
  });

  return (
    <PlaceholderPage
      eyebrow="Administration"
      title="Settings"
      description="Organisation profile, protection defaults and integration configuration."
      capabilities={[
        {
          title: 'Organisation profile',
          description:
            'Name, country and timezone. Tier and slug are set by the platform operator.',
          endpoint: 'PATCH /api/v1/organization',
        },
        {
          title: 'Session management',
          description:
            'Review active sessions per device and revoke any of them, including sign-out everywhere.',
          endpoint: 'GET /api/v1/auth/sessions',
        },
        {
          title: 'Notification routing',
          description:
            'Which severities reach which channels for which roles. Delivery is owned by the notifications service.',
          endpoint: 'POST /api/v1/notifications/send',
        },
        {
          title: 'Protection defaults',
          description:
            'Default protection mode applied to newly registered vehicles, and the escalation thresholds behind it.',
        },
      ]}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Organisation">
          <QueryState
            isLoading={organization.isLoading}
            error={organization.error}
            onRetry={() => void organization.refetch()}
            skeletonRows={3}
          >
            {organization.data && (
              <dl className="space-y-3 text-xs">
                {[
                  ['Name', organization.data.name],
                  ['Tier', organization.data.tier],
                  ['Country', organization.data.countryCode],
                  ['Timezone', organization.data.timezone],
                  ['Vehicles', String(organization.data.vehicleCount)],
                  ['Users', String(organization.data.userCount)],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <dt className="text-ink-tertiary">{label}</dt>
                    <dd className="text-ink-primary">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </QueryState>
        </Panel>

        <Panel title="Your access" description="The permissions attached to your session.">
          <Surface elevation="flat" padding="sm">
            <div className="flex flex-wrap gap-1.5">
              {user?.roles.map((role) => (
                <StatusPill key={role} status={{ kind: 'threat', value: 'MINIMAL' }} label={role} />
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-ink-tertiary">
              You hold {user?.permissions.length ?? 0} permissions. Roles are managed on the Roles
              page and assigned per user by an administrator.
            </p>
          </Surface>
        </Panel>
      </div>
    </PlaceholderPage>
  );
}
