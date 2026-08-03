import { Clock, MapPin } from 'lucide-react';
import { THREAT_TOKENS, StatusPill, cn } from '@aegisdrive/ui';
import { ThreatLevel, type CrimeHotspot } from '@aegisdrive/types';
import { humaniseEnum, relativeTime } from '@aegisdrive/shared';
import { useCrimeHotspots } from '@/features/command-centre/command-centre.queries';
import { Widget } from './Widget';

const LEVEL_ORDER: ThreatLevel[] = [
  ThreatLevel.SEVERE,
  ThreatLevel.HIGH,
  ThreatLevel.ELEVATED,
  ThreatLevel.GUARDED,
  ThreatLevel.MINIMAL,
];

/**
 * Crime hotspot intelligence.
 *
 * Aggregated from 90 days of incident history plus external feeds. Ordered by
 * severity rather than recency: a zone's danger does not decay because nothing
 * happened there this morning.
 */
export function CrimeHotspotsWidget() {
  const query = useCrimeHotspots();

  const hotspots = [...(query.data ?? [])].sort(
    (a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level),
  );

  const severe = hotspots.filter((hotspot) => hotspot.level === ThreatLevel.SEVERE).length;
  const currentHour = new Date().getHours();

  return (
    <Widget
      title="Crime hotspots"
      subtitle={`${hotspots.length} zones · trailing 90 days`}
      alarm={severe > 0}
      isLoading={query.isLoading}
      error={query.error}
      isEmpty={hotspots.length === 0}
      emptyTitle="No hotspots identified"
      emptyDescription="Zones appear once enough incident history has accumulated to classify them."
      onRetry={() => void query.refetch()}
      className="h-full"
    >
      <ul className="space-y-1.5">
        {hotspots.map((hotspot) => (
          <HotspotRow key={hotspot.id} hotspot={hotspot} currentHour={currentHour} />
        ))}
      </ul>
    </Widget>
  );
}

/** True when the current hour falls inside the zone's active window. */
function isActiveNow(hotspot: CrimeHotspot, hour: number): boolean {
  if (hotspot.activeFromHour === null || hotspot.activeToHour === null) return true;

  // Windows that cross midnight (19:00 → 03:00) invert the comparison.
  return hotspot.activeFromHour <= hotspot.activeToHour
    ? hour >= hotspot.activeFromHour && hour <= hotspot.activeToHour
    : hour >= hotspot.activeFromHour || hour <= hotspot.activeToHour;
}

function HotspotRow({ hotspot, currentHour }: { hotspot: CrimeHotspot; currentHour: number }) {
  const active = isActiveNow(hotspot, currentHour);
  const token = THREAT_TOKENS[hotspot.level];

  return (
    <li
      className={cn(
        'rounded-control border px-2.5 py-2 transition-opacity',
        token.border,
        token.surface,
        !active && 'opacity-55',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-[11px] font-medium text-ink-primary">
            <MapPin className="size-3 shrink-0 text-ink-tertiary" aria-hidden />
            {hotspot.name}
          </p>
          <p className="mt-0.5 text-[10px] text-ink-tertiary">
            {humaniseEnum(hotspot.dominantIncidentType)} · {hotspot.source} ·{' '}
            {(hotspot.confidence * 100).toFixed(0)}% confidence
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusPill status={{ kind: 'threat', value: hotspot.level }} size="sm" />
          <span data-numeric className={cn('text-[10px] font-semibold', token.text)}>
            {hotspot.incidentCount90d} incidents
          </span>
        </div>
      </div>

      {hotspot.activeFromHour !== null && hotspot.activeToHour !== null ? (
        <p
          className={cn(
            'mt-1.5 flex items-center gap-1 text-[10px]',
            active ? 'text-signal-warning' : 'text-ink-tertiary',
          )}
        >
          <Clock className="size-2.5" aria-hidden />
          {active ? 'Active now · ' : 'Peak window '}
          <span data-numeric>
            {String(hotspot.activeFromHour).padStart(2, '0')}:00–
            {String(hotspot.activeToHour).padStart(2, '0')}:00
          </span>
          <span aria-hidden className="text-ink-tertiary">
            · updated {relativeTime(hotspot.lastUpdatedAt)}
          </span>
        </p>
      ) : null}
    </li>
  );
}
