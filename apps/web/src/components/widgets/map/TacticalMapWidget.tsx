import { useMemo, useState } from 'react';
import {
  ResponderKind,
  ThreatLevel,
  type CrimeHotspot,
  type MapVehicle,
  type ResponderAsset,
} from '@aegisdrive/types';
import { Badge, StatusPill, cn } from '@aegisdrive/ui';
import { humaniseEnum } from '@aegisdrive/shared';
import { useTacticalPicture } from '@/features/command-centre/command-centre.queries';
import { useCommandCentreStore } from '@/stores/command-centre.store';
import { Widget } from '../Widget';
import { createProjection } from './projection';
import { CorridorLayer, GridLayer, HotspotLayer, ResponderLayer, VehicleLayer } from './layers';

/**
 * Tactical map.
 *
 * Renders the live operating picture: corridors, hotspots, response assets and
 * every tracked vehicle, in one projected view.
 *
 * **Why SVG rather than a mapping library.** The basemap is deferred
 * (ADR-0004), and everything valuable here is the overlay: 40 moving marks,
 * six polylines and seven risk circles. At that scale SVG re-renders in well
 * under a frame, gives real DOM nodes that are focusable and screen-reader
 * addressable, and costs no bundle weight. When Mapbox lands, `projection.ts`
 * is swapped for its projection and these layers move onto it unchanged.
 */

const VIEWPORT_WIDTH = 1000;
const VIEWPORT_HEIGHT = 620;

const ALL_RESPONDER_KINDS: ResponderKind[] = [
  ResponderKind.POLICE,
  ResponderKind.HOSPITAL,
  ResponderKind.SECURITY,
];

interface LayerToggles {
  corridors: boolean;
  hotspots: boolean;
  responders: Set<ResponderKind>;
  vehicles: boolean;
}

export function TacticalMapWidget() {
  const picture = useTacticalPicture();
  const livePositions = useCommandCentreStore((state) => state.positions);
  const liveResponders = useCommandCentreStore((state) => state.responders);

  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [inspected, setInspected] = useState<
    | { kind: 'vehicle'; value: MapVehicle }
    | { kind: 'responder'; value: ResponderAsset }
    | { kind: 'hotspot'; value: CrimeHotspot }
    | null
  >(null);

  const [layers, setLayers] = useState<LayerToggles>({
    corridors: true,
    hotspots: true,
    responders: new Set(ALL_RESPONDER_KINDS),
    vehicles: true,
  });

  const projection = useMemo(
    () =>
      createProjection(
        picture.data?.bounds ?? [27.85, -26.32, 28.22, -25.98],
        VIEWPORT_WIDTH,
        VIEWPORT_HEIGHT,
      ),
    [picture.data?.bounds],
  );

  /**
   * The socket is authoritative for anything that moves. The REST payload
   * supplies the roster and the static geometry; overlaying live positions on
   * top means a vehicle never renders at a stale location just because the
   * polling interval has not elapsed.
   */
  const vehicles = useMemo<MapVehicle[]>(() => {
    const base = picture.data?.vehicles ?? [];

    return base.map((vehicle) => {
      const live = livePositions[vehicle.id];
      if (!live) return vehicle;

      return {
        ...vehicle,
        position: live.position,
        threatLevel: live.threatLevel,
        riskScore: live.riskScore,
        isUnderThreat: live.status === 'UNDER_THREAT',
        lastSeenAt: live.recordedAt,
      };
    });
  }, [picture.data?.vehicles, livePositions]);

  const responders = useMemo<ResponderAsset[]>(() => {
    const base = picture.data?.responders ?? [];
    return base.map((responder) => liveResponders[responder.id] ?? responder);
  }, [picture.data?.responders, liveResponders]);

  const threatCount = vehicles.filter((vehicle) => vehicle.isUnderThreat).length;

  const toggleResponderKind = (kind: ResponderKind): void => {
    setLayers((current) => {
      const next = new Set(current.responders);
      if (next.has(kind)) {
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return { ...current, responders: next };
    });
  };

  return (
    <Widget
      title="Tactical map"
      subtitle={`${vehicles.length} tracked · ${responders.length} response assets`}
      live={!picture.isLoading}
      alarm={threatCount > 0}
      isLoading={picture.isLoading}
      error={picture.error}
      onRetry={() => void picture.refetch()}
      scrollBody={false}
      className="h-full"
      actions={
        threatCount > 0 ? (
          <Badge tone="danger">{threatCount} under threat</Badge>
        ) : (
          <Badge tone="success">All clear</Badge>
        )
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-3">
        <LayerControls
          layers={layers}
          onToggle={(key) => setLayers((current) => ({ ...current, [key]: !current[key] }))}
          onToggleResponder={toggleResponderKind}
        />

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-card border border-hairline bg-void">
          <svg
            viewBox={`0 0 ${VIEWPORT_WIDTH} ${VIEWPORT_HEIGHT}`}
            preserveAspectRatio="xMidYMid meet"
            className="size-full"
            role="img"
            aria-label={`Tactical map showing ${vehicles.length} vehicles, ${responders.length} response assets and ${picture.data?.hotspots.length ?? 0} crime hotspots`}
          >
            <defs>
              <radialGradient id="map-vignette" cx="50%" cy="40%" r="75%">
                <stop offset="0%" stopColor="rgb(46 139 255)" stopOpacity="0.10" />
                <stop offset="100%" stopColor="rgb(4 6 11)" stopOpacity="0" />
              </radialGradient>
            </defs>

            <rect width={VIEWPORT_WIDTH} height={VIEWPORT_HEIGHT} fill="url(#map-vignette)" />
            <GridLayer projection={projection} />

            {/* Painter's order: risk areas, then routes, then assets, then
                vehicles. Vehicles last so a mark is never hidden by geometry. */}
            {layers.hotspots && picture.data ? (
              <HotspotLayer
                projection={projection}
                hotspots={picture.data.hotspots}
                onSelect={(hotspot) => setInspected({ kind: 'hotspot', value: hotspot })}
              />
            ) : null}

            {layers.corridors && picture.data ? (
              <CorridorLayer projection={projection} corridors={picture.data.corridors} />
            ) : null}

            <ResponderLayer
              projection={projection}
              responders={responders}
              visibleKinds={layers.responders}
              onSelect={(responder) => setInspected({ kind: 'responder', value: responder })}
            />

            {layers.vehicles ? (
              <VehicleLayer
                projection={projection}
                vehicles={vehicles}
                selectedId={selectedVehicleId}
                onSelect={(vehicle) => {
                  setSelectedVehicleId(vehicle.id);
                  setInspected({ kind: 'vehicle', value: vehicle });
                }}
              />
            ) : null}
          </svg>

          <ScaleBar metresPerUnit={projection.metresPerUnit} />

          {inspected ? (
            <InspectorCard inspected={inspected} onDismiss={() => setInspected(null)} />
          ) : null}
        </div>
      </div>
    </Widget>
  );
}

// ============================================================================
// Controls
// ============================================================================

const RESPONDER_LABEL: Record<ResponderKind, string> = {
  POLICE: 'Police',
  HOSPITAL: 'Hospitals',
  SECURITY: 'Security',
  FIRE: 'Fire',
  TOW: 'Tow',
};

function LayerControls({
  layers,
  onToggle,
  onToggleResponder,
}: {
  layers: LayerToggles;
  onToggle: (key: 'corridors' | 'hotspots' | 'vehicles') => void;
  onToggleResponder: (kind: ResponderKind) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Map layers">
      <Toggle active={layers.vehicles} onClick={() => onToggle('vehicles')} label="Vehicles" />
      <Toggle active={layers.corridors} onClick={() => onToggle('corridors')} label="Corridors" />
      <Toggle active={layers.hotspots} onClick={() => onToggle('hotspots')} label="Hotspots" />

      <span aria-hidden className="mx-1 h-4 w-px bg-hairline" />

      {ALL_RESPONDER_KINDS.map((kind) => (
        <Toggle
          key={kind}
          active={layers.responders.has(kind)}
          onClick={() => onToggleResponder(kind)}
          label={RESPONDER_LABEL[kind]}
        />
      ))}
    </div>
  );
}

function Toggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-pill border px-2.5 py-1 text-[11px] font-medium transition-colors',
        active
          ? 'border-aegis-500/30 bg-aegis-500/12 text-aegis-100'
          : 'border-hairline bg-white/3 text-ink-tertiary hover:text-ink-secondary',
      )}
    >
      {label}
    </button>
  );
}

/** Distance reference. A map without one invites misjudged proximity. */
function ScaleBar({ metresPerUnit }: { metresPerUnit: number }) {
  const targetUnits = 120;
  const rawMetres = targetUnits * metresPerUnit;

  // Snap to a readable round number rather than showing "3.7 km".
  const steps = [100, 250, 500, 1000, 2000, 5000, 10_000, 20_000];
  const metres = steps.reduce((best, step) =>
    Math.abs(step - rawMetres) < Math.abs(best - rawMetres) ? step : best,
  );
  const widthPercent = (metres / metresPerUnit / 1000) * 100;

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2">
      <div
        className="h-1 rounded-full border-x-2 border-ink-tertiary bg-ink-tertiary/40"
        style={{ width: `${widthPercent}%`, minWidth: 40 }}
      />
      <span data-numeric className="text-[10px] font-medium text-ink-tertiary">
        {metres >= 1000 ? `${metres / 1000} km` : `${metres} m`}
      </span>
    </div>
  );
}

// ============================================================================
// Inspector
// ============================================================================

type Inspected =
  | { kind: 'vehicle'; value: MapVehicle }
  | { kind: 'responder'; value: ResponderAsset }
  | { kind: 'hotspot'; value: CrimeHotspot };

function InspectorCard({ inspected, onDismiss }: { inspected: Inspected; onDismiss: () => void }) {
  return (
    <div className="absolute right-3 top-3 w-64 rounded-card glass-strong p-3 shadow-raised">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-ink-primary">
          {inspected.kind === 'vehicle' ? inspected.value.registrationNumber : inspected.value.name}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close inspector"
          className="text-ink-tertiary transition-colors hover:text-ink-primary"
        >
          ✕
        </button>
      </div>

      <dl className="mt-2.5 space-y-1.5 text-[11px]">
        {inspected.kind === 'vehicle' ? (
          <>
            <Row label="Threat">
              <StatusPill
                status={{ kind: 'threat', value: inspected.value.threatLevel }}
                size="sm"
                pulse={inspected.value.threatLevel === ThreatLevel.SEVERE}
              />
            </Row>
            <Row label="Risk score">
              <span data-numeric className="text-ink-primary">
                {inspected.value.riskScore}/100
              </span>
            </Row>
            <Row label="Speed">
              <span data-numeric className="text-ink-primary">
                {inspected.value.position.speedKph?.toFixed(0) ?? '—'} km/h
              </span>
            </Row>
            <Row label="Heading">
              <span data-numeric className="text-ink-primary">
                {inspected.value.position.heading?.toFixed(0) ?? '—'}°
              </span>
            </Row>
          </>
        ) : inspected.kind === 'responder' ? (
          <>
            <Row label="Type">
              <span className="text-ink-primary">{humaniseEnum(inspected.value.kind)}</span>
            </Row>
            <Row label="Status">
              <span className="text-ink-primary">{humaniseEnum(inspected.value.status)}</span>
            </Row>
            {inspected.value.callSign ? (
              <Row label="Call sign">
                <span data-numeric className="text-ink-primary">
                  {inspected.value.callSign}
                </span>
              </Row>
            ) : null}
            {inspected.value.capacity !== null ? (
              <Row label="Capacity">
                <span data-numeric className="text-ink-primary">
                  {inspected.value.capacity}
                </span>
              </Row>
            ) : null}
          </>
        ) : (
          <>
            <Row label="Level">
              <StatusPill status={{ kind: 'threat', value: inspected.value.level }} size="sm" />
            </Row>
            <Row label="90-day incidents">
              <span data-numeric className="text-ink-primary">
                {inspected.value.incidentCount90d}
              </span>
            </Row>
            <Row label="Dominant type">
              <span className="text-ink-primary">
                {humaniseEnum(inspected.value.dominantIncidentType)}
              </span>
            </Row>
            <Row label="Source">
              <span className="text-ink-primary">{inspected.value.source}</span>
            </Row>
          </>
        )}
      </dl>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-ink-tertiary">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
