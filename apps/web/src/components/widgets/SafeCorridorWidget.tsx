import { Route } from 'lucide-react';
import { CorridorStatus, type SafeCorridor } from '@aegisdrive/types';
import { Badge, cn } from '@aegisdrive/ui';
import { useSafeCorridors } from '@/features/command-centre/command-centre.queries';
import { Widget } from './Widget';

/**
 * SafeCorridor status board.
 *
 * The preventive half of the product: a vetted route with known historical risk
 * and known response coverage. Sorted worst-first, because a degraded corridor
 * is an active decision — vehicles on it right now may need rerouting.
 */

const STATUS_TONE: Record<CorridorStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  CLEAR: 'success',
  CAUTION: 'warning',
  DEGRADED: 'danger',
  CLOSED: 'neutral',
};

const STATUS_ORDER: CorridorStatus[] = [
  CorridorStatus.CLOSED,
  CorridorStatus.DEGRADED,
  CorridorStatus.CAUTION,
  CorridorStatus.CLEAR,
];

export function SafeCorridorWidget() {
  const query = useSafeCorridors();

  const corridors = [...(query.data ?? [])].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status),
  );

  const compromised = corridors.filter(
    (corridor) =>
      corridor.status === CorridorStatus.DEGRADED || corridor.status === CorridorStatus.CLOSED,
  ).length;

  return (
    <Widget
      title="SafeCorridor routes"
      subtitle={`${corridors.length} vetted routes`}
      alarm={compromised > 0}
      isLoading={query.isLoading}
      error={query.error}
      isEmpty={corridors.length === 0}
      emptyTitle="No corridors defined"
      emptyDescription="Vetted routes appear here once the risk engine has assessed them."
      onRetry={() => void query.refetch()}
      className="h-full"
      actions={
        compromised > 0 ? (
          <Badge tone="danger">{compromised} compromised</Badge>
        ) : (
          <Badge tone="success">All clear</Badge>
        )
      }
    >
      <ul className="space-y-2">
        {corridors.map((corridor) => (
          <CorridorRow key={corridor.id} corridor={corridor} />
        ))}
      </ul>
    </Widget>
  );
}

function CorridorRow({ corridor }: { corridor: SafeCorridor }) {
  return (
    <li className="rounded-control border border-hairline bg-white/3 px-2.5 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-ink-primary">
            {corridor.originLabel} → {corridor.destinationLabel}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-ink-tertiary">
            <Route className="size-3" aria-hidden />
            <span data-numeric>{corridor.lengthKm} km</span>
            <span aria-hidden>·</span>
            <span data-numeric>~{corridor.averageTransitMinutes} min</span>
            <span aria-hidden>·</span>
            <span data-numeric>{corridor.responderCoverage} units</span>
          </p>
        </div>

        <Badge tone={STATUS_TONE[corridor.status]} className="shrink-0">
          {corridor.status}
        </Badge>
      </div>

      <div className="mt-2 flex items-center gap-2">
        {/* Risk bar. Length is the score, colour is the band — redundant
            encoding so the reading survives a monochrome print or a
            colour-vision deficiency. */}
        <div className="h-1 flex-1 overflow-hidden rounded-pill bg-white/8">
          <div
            className={cn(
              'h-full rounded-pill transition-[width] duration-500',
              corridor.riskScore >= 65
                ? 'bg-threat-severe'
                : corridor.riskScore >= 40
                  ? 'bg-threat-elevated'
                  : 'bg-threat-minimal',
            )}
            style={{ width: `${corridor.riskScore}%` }}
          />
        </div>

        <span data-numeric className="w-8 shrink-0 text-right text-[10px] text-ink-tertiary">
          {corridor.riskScore}
        </span>

        <span className="shrink-0 text-[10px] text-ink-tertiary">
          <span data-numeric>{corridor.activeVehicleCount}</span> live
        </span>
      </div>
    </li>
  );
}
