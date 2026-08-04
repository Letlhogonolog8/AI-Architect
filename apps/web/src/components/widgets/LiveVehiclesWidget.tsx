import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { VehicleStatus } from '@aegisdrive/types';
import { Badge, StatusPill, cn } from '@aegisdrive/ui';
import { relativeTime } from '@aegisdrive/shared';
import { useLiveVehicles } from '@/features/command-centre/command-centre.queries';
import { useCommandCentreStore } from '@/stores/command-centre.store';
import { routes } from '@/config/routes';
import { Widget } from './Widget';

type SortKey = 'risk' | 'registration' | 'speed';

/**
 * Live vehicle roster.
 *
 * Sorted by risk descending by default — the list exists so an operator sees
 * the vehicle that needs attention without scrolling, not so they can browse
 * the fleet alphabetically.
 *
 * Row values come from the socket where available; the query supplies the
 * roster and the registration details that do not change.
 */
export function LiveVehiclesWidget() {
  const query = useLiveVehicles();
  const positions = useCommandCentreStore((state) => state.positions);
  const [sortKey, setSortKey] = useState<SortKey>('risk');

  const rows = useMemo(() => {
    const merged = (query.data ?? []).map((vehicle) => {
      const live = positions[vehicle.id];

      return {
        id: vehicle.id,
        registrationNumber: vehicle.registrationNumber,
        makeModel: `${vehicle.make} ${vehicle.model}`,
        status: live?.status ?? vehicle.status,
        riskScore: live?.riskScore ?? vehicle.riskScore,
        threatLevel: live?.threatLevel ?? vehicle.threatLevel,
        speedKph: live?.position.speedKph ?? vehicle.lastPosition?.speedKph ?? null,
        lastSeenAt: live?.recordedAt ?? vehicle.lastSeenAt,
      };
    });

    return merged.sort((a, b) => {
      if (sortKey === 'registration') {
        return a.registrationNumber.localeCompare(b.registrationNumber);
      }
      if (sortKey === 'speed') return (b.speedKph ?? 0) - (a.speedKph ?? 0);
      return b.riskScore - a.riskScore;
    });
  }, [query.data, positions, sortKey]);

  const underThreat = rows.filter((row) => row.status === VehicleStatus.UNDER_THREAT).length;

  return (
    <Widget
      title="Live vehicles"
      subtitle={`${rows.length} tracked`}
      live={Object.keys(positions).length > 0}
      alarm={underThreat > 0}
      isLoading={query.isLoading}
      error={query.error}
      isEmpty={rows.length === 0}
      emptyTitle="No vehicles"
      onRetry={() => void query.refetch()}
      className="h-full"
      actions={
        <div className="flex items-center gap-1.5">
          {underThreat > 0 ? <Badge tone="danger">{underThreat}</Badge> : null}
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            aria-label="Sort vehicles"
            className="rounded border border-hairline bg-white/4 px-1.5 py-0.5 text-[11px] text-ink-secondary outline-none"
          >
            <option value="risk">Risk</option>
            <option value="speed">Speed</option>
            <option value="registration">Registration</option>
          </select>
        </div>
      }
    >
      <ul className="space-y-0.5">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              to={routes.vehicleDetail(row.id)}
              className={cn(
                'flex items-center gap-3 rounded-control px-2 py-1.5 transition-colors hover:bg-white/5',
                row.status === VehicleStatus.UNDER_THREAT && 'bg-signal-critical/8',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'size-1.5 shrink-0 rounded-full',
                  row.status === VehicleStatus.UNDER_THREAT
                    ? 'animate-pulse-ring bg-signal-critical'
                    : 'bg-threat-minimal',
                )}
              />

              <span
                data-numeric
                className="w-24 shrink-0 truncate text-[11px] font-semibold text-aegis-200"
              >
                {row.registrationNumber}
              </span>

              <span className="min-w-0 flex-1 truncate text-[11px] text-ink-tertiary">
                {row.makeModel}
              </span>

              <span
                data-numeric
                className="w-12 shrink-0 text-right text-[11px] text-ink-secondary"
              >
                {row.speedKph === null ? '—' : `${row.speedKph.toFixed(0)}`}
              </span>

              <span className="w-10 shrink-0 text-right">
                <StatusPill
                  status={{ kind: 'threat', value: row.threatLevel }}
                  size="sm"
                  label={String(row.riskScore)}
                />
              </span>

              <span className="hidden w-14 shrink-0 text-right text-[10px] text-ink-tertiary sm:inline">
                {row.lastSeenAt ? relativeTime(row.lastSeenAt) : '—'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Widget>
  );
}
