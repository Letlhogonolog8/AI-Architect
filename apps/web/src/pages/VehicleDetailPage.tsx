import { useParams } from 'react-router-dom';
import { Ban } from 'lucide-react';
import { Button, PageHeader, Panel, StatusPill, ThreatGauge } from '@aegisdrive/ui';
import { humaniseEnum, relativeTime } from '@aegisdrive/shared';
import { useVehicle } from '@/features/fleet/fleet.queries';
import { QueryState } from '@/components/common/QueryState';
import { Can } from '@/features/auth/RouteGuards';
import { useCommandCentreStore } from '@/stores/command-centre.store';

export function VehicleDetailPage() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const vehicle = useVehicle(vehicleId);

  // A live position, when one has arrived, supersedes the value the REST read
  // returned — that snapshot is already seconds old by the time it renders.
  const livePosition = useCommandCentreStore((state) =>
    vehicleId ? state.positions[vehicleId] : undefined,
  );

  return (
    <QueryState
      isLoading={vehicle.isLoading}
      error={vehicle.error}
      onRetry={() => void vehicle.refetch()}
    >
      {vehicle.data && (
        <div className="space-y-8">
          <PageHeader
            eyebrow="Vehicle"
            title={vehicle.data.registrationNumber}
            description={`${vehicle.data.make} ${vehicle.data.model} · ${vehicle.data.year} · ${humaniseEnum(vehicle.data.type)}`}
            actions={
              <Can anyOf={['vehicle:immobilise']}>
                <Button
                  variant="danger"
                  size="sm"
                  leadingIcon={<Ban className="size-4" aria-hidden />}
                  disabled={vehicle.data.status === 'IMMOBILISED'}
                >
                  {vehicle.data.status === 'IMMOBILISED' ? 'Immobilised' : 'Immobilise'}
                </Button>
              </Can>
            }
          />

          <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
            <Panel title="Operational state">
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <div>
                  <dt className="text-overline uppercase text-ink-tertiary">Status</dt>
                  <dd className="mt-1.5">
                    <StatusPill
                      status={{
                        kind: 'vehicle',
                        value: livePosition?.status ?? vehicle.data.status,
                      }}
                      pulse={vehicle.data.status === 'UNDER_THREAT'}
                    />
                  </dd>
                </div>
                <div>
                  <dt className="text-overline uppercase text-ink-tertiary">Protection mode</dt>
                  <dd className="mt-1.5 text-sm text-ink-primary">
                    {humaniseEnum(vehicle.data.protectionMode)}
                  </dd>
                </div>
                <div>
                  <dt className="text-overline uppercase text-ink-tertiary">VIN</dt>
                  <dd data-numeric className="mt-1.5 text-xs text-ink-secondary">
                    {vehicle.data.vin}
                  </dd>
                </div>
                <div>
                  <dt className="text-overline uppercase text-ink-tertiary">Device serial</dt>
                  <dd data-numeric className="mt-1.5 text-xs text-ink-secondary">
                    {vehicle.data.deviceSerial ?? 'Not fitted'}
                  </dd>
                </div>
                <div>
                  <dt className="text-overline uppercase text-ink-tertiary">Odometer</dt>
                  <dd data-numeric className="mt-1.5 text-sm text-ink-primary">
                    {vehicle.data.odometerKm.toLocaleString()} km
                  </dd>
                </div>
                <div>
                  <dt className="text-overline uppercase text-ink-tertiary">Last seen</dt>
                  <dd className="mt-1.5 text-sm text-ink-primary">
                    {livePosition
                      ? relativeTime(livePosition.recordedAt)
                      : vehicle.data.lastSeenAt
                        ? relativeTime(vehicle.data.lastSeenAt)
                        : 'Never'}
                  </dd>
                </div>
              </dl>
            </Panel>

            <Panel title="Risk">
              <div className="flex justify-center py-2">
                <ThreatGauge
                  score={livePosition?.riskScore ?? vehicle.data.riskScore}
                  level={livePosition?.threatLevel ?? vehicle.data.threatLevel}
                  size={132}
                />
              </div>
            </Panel>
          </div>

          <Panel
            title="Position"
            description="Streamed from the in-vehicle device via the telemetry ingest pipeline."
          >
            {(livePosition ?? vehicle.data.lastPosition) ? (
              <dl className="grid gap-4 sm:grid-cols-3">
                <div>
                  <dt className="text-overline uppercase text-ink-tertiary">Latitude</dt>
                  <dd data-numeric className="mt-1 text-sm text-ink-primary">
                    {(livePosition?.position ?? vehicle.data.lastPosition)?.latitude.toFixed(6)}
                  </dd>
                </div>
                <div>
                  <dt className="text-overline uppercase text-ink-tertiary">Longitude</dt>
                  <dd data-numeric className="mt-1 text-sm text-ink-primary">
                    {(livePosition?.position ?? vehicle.data.lastPosition)?.longitude.toFixed(6)}
                  </dd>
                </div>
                <div>
                  <dt className="text-overline uppercase text-ink-tertiary">Speed</dt>
                  <dd data-numeric className="mt-1 text-sm text-ink-primary">
                    {(livePosition?.position ?? vehicle.data.lastPosition)?.speedKph?.toFixed(0) ??
                      '—'}{' '}
                    km/h
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-xs text-ink-tertiary">
                No position has been reported for this vehicle yet.
              </p>
            )}
          </Panel>
        </div>
      )}
    </QueryState>
  );
}
