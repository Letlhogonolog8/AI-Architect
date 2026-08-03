import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button, Input, PageHeader, Panel, StatusPill } from '@aegisdrive/ui';
import { fullName } from '@aegisdrive/shared';
import { useDrivers } from '@/features/fleet/fleet.queries';
import { QueryState } from '@/components/common/QueryState';
import { Can } from '@/features/auth/RouteGuards';

export function DriversPage() {
  const [search, setSearch] = useState('');
  const drivers = useDrivers({ search: search || undefined, pageSize: 25 });

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Fleet"
        title="Drivers"
        description="Driver roster, duty status and behavioural safety scoring."
        actions={
          <Can anyOf={['driver:create']}>
            <Button
              variant="primary"
              size="sm"
              leadingIcon={<Plus className="size-4" aria-hidden />}
            >
              Add driver
            </Button>
          </Can>
        }
        toolbar={
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or licence number"
            leadingIcon={<Search className="size-4" aria-hidden />}
            className="max-w-sm"
            aria-label="Search drivers"
          />
        }
      />

      <Panel title={drivers.data ? `${drivers.data.meta.totalItems} drivers` : 'Drivers'}>
        <QueryState
          isLoading={drivers.isLoading}
          error={drivers.error}
          isEmpty={drivers.data?.items.length === 0}
          emptyTitle={search ? 'No drivers match that search' : 'No drivers on the roster'}
          emptyDescription="Drivers linked to a vehicle receive panic controls and duress detection."
          onRetry={() => void drivers.refetch()}
        >
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-hairline text-left">
                  {['Driver', 'Licence', 'Status', 'Safety score', 'Assigned vehicle'].map(
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
                {drivers.data?.items.map((driver) => (
                  <tr
                    key={driver.id}
                    className="border-b border-hairline/60 transition-colors last:border-0 hover:bg-white/3"
                  >
                    <td className="py-3 pl-5 pr-3 text-xs font-medium text-ink-primary">
                      {fullName(driver.firstName, driver.lastName)}
                    </td>
                    <td data-numeric className="px-3 py-3 text-xs text-ink-secondary">
                      {driver.licenceNumber}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill
                        status={{ kind: 'driver', value: driver.status }}
                        size="sm"
                        pulse={driver.status === 'DISTRESS'}
                      />
                    </td>
                    <td data-numeric className="px-3 py-3 text-xs text-ink-secondary">
                      {driver.safetyScore}/100
                    </td>
                    <td className="py-3 pl-3 pr-5 text-xs text-ink-tertiary">
                      {driver.assignedVehicleId ? 'Assigned' : 'Unassigned'}
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
