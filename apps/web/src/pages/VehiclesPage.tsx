import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { Button, Input, PageHeader, Panel, StatusPill } from '@aegisdrive/ui';
import { humaniseEnum, relativeTime } from '@aegisdrive/shared';
import { useVehicles } from '@/features/fleet/fleet.queries';
import { QueryState } from '@/components/common/QueryState';
import { Can } from '@/features/auth/RouteGuards';
import { routes } from '@/config/routes';

export function VehiclesPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const vehicles = useVehicles({ search: search || undefined, page, pageSize: 25 });
  const meta = vehicles.data?.meta;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Fleet"
        title="Vehicles"
        description="Every protected vehicle, its live status and its current risk score."
        actions={
          <Can anyOf={['vehicle:create']}>
            <Button
              variant="primary"
              size="sm"
              leadingIcon={<Plus className="size-4" aria-hidden />}
            >
              Register vehicle
            </Button>
          </Can>
        }
        toolbar={
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              // Any filter change invalidates the current page offset.
              setPage(1);
            }}
            placeholder="Search registration, VIN, make or model"
            leadingIcon={<Search className="size-4" aria-hidden />}
            className="max-w-sm"
            aria-label="Search vehicles"
          />
        }
      />

      <Panel
        title={meta ? `${meta.totalItems} vehicles` : 'Vehicles'}
        footer={
          meta && meta.totalPages > 1 ? (
            <div className="flex items-center justify-between">
              <span>
                Page {meta.page} of {meta.totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!meta.hasPreviousPage}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!meta.hasNextPage}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : undefined
        }
      >
        <QueryState
          isLoading={vehicles.isLoading}
          error={vehicles.error}
          isEmpty={vehicles.data?.items.length === 0}
          emptyTitle={search ? 'No vehicles match that search' : 'No vehicles registered yet'}
          emptyDescription={
            search
              ? 'Try a partial registration number or VIN.'
              : 'Register the first vehicle to begin protecting it.'
          }
          onRetry={() => void vehicles.refetch()}
        >
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-hairline text-left">
                  {['Registration', 'Vehicle', 'Status', 'Threat', 'Risk', 'Last seen'].map(
                    (heading) => (
                      <th
                        key={heading}
                        scope="col"
                        className="px-3 py-2 text-overline font-semibold uppercase text-ink-tertiary first:pl-5 last:pr-5"
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>

              <tbody>
                {vehicles.data?.items.map((vehicle) => (
                  <tr
                    key={vehicle.id}
                    className="border-b border-hairline/60 transition-colors last:border-0 hover:bg-white/3"
                  >
                    <td className="py-3 pl-5 pr-3">
                      <Link
                        to={routes.vehicleDetail(vehicle.id)}
                        data-numeric
                        className="text-xs font-semibold text-aegis-200 hover:underline"
                      >
                        {vehicle.registrationNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-xs text-ink-secondary">
                      {vehicle.make} {vehicle.model}
                      <span className="ml-2 text-ink-tertiary">
                        {vehicle.year} · {humaniseEnum(vehicle.type)}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={{ kind: 'vehicle', value: vehicle.status }} size="sm" />
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill
                        status={{ kind: 'threat', value: vehicle.threatLevel }}
                        size="sm"
                      />
                    </td>
                    <td data-numeric className="px-3 py-3 text-xs text-ink-secondary">
                      {vehicle.riskScore}
                    </td>
                    <td className="py-3 pl-3 pr-5 text-xs text-ink-tertiary">
                      {vehicle.lastSeenAt ? relativeTime(vehicle.lastSeenAt) : 'Never'}
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
