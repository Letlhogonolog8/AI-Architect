import { Map as MapIcon } from 'lucide-react';
import { Badge } from '@aegisdrive/ui';
import { webEnv } from '@/config/env';

interface TacticalMapPlaceholderProps {
  trackedVehicles: number;
}

/**
 * Stand-in for the Mapbox tactical map.
 *
 * The map is architected but not integrated — see
 * `docs/adr/0004-mapbox-deferred.md`. Everything the real component will need
 * already exists: live positions in `useRealtimeStore`, threat zones on
 * `GET /threat-events/zones`, and the token plumbed through `webEnv`.
 *
 * This renders an honest placeholder rather than a fake map. A decorative map
 * with invented pins in a hijacking-response product is worse than no map: an
 * operator who believes it is real makes decisions on fiction.
 */
export function TacticalMapPlaceholder({ trackedVehicles }: TacticalMapPlaceholderProps) {
  return (
    <div className="relative grid min-h-[360px] place-items-center overflow-hidden rounded-card border border-hairline grid-backdrop">
      <div className="flex max-w-sm flex-col items-center gap-4 px-6 text-center">
        <span className="grid size-12 place-items-center rounded-panel border border-hairline bg-white/4 text-aegis-300">
          <MapIcon className="size-5" aria-hidden />
        </span>

        <div className="space-y-1.5">
          <p className="text-sm font-medium text-ink-primary">Tactical map not yet integrated</p>
          <p className="text-xs leading-relaxed text-ink-tertiary">
            The realtime position feed is live and buffering. Mapbox rendering lands in the next
            milestone; see ADR-0004 for the deferral rationale.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Badge tone="live">{trackedVehicles} vehicles streaming</Badge>
          <Badge tone={webEnv.mapboxToken ? 'success' : 'neutral'}>
            {webEnv.mapboxToken ? 'Mapbox token configured' : 'Mapbox token not set'}
          </Badge>
        </div>
      </div>
    </div>
  );
}
