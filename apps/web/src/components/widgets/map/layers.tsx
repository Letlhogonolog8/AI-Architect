import { memo } from 'react';
import {
  CorridorStatus,
  ResponderKind,
  ResponderStatus,
  ThreatLevel,
  type CrimeHotspot,
  type MapVehicle,
  type ResponderAsset,
  type SafeCorridor,
} from '@aegisdrive/types';
import { metresToUnits, toPolylinePoints, type Projection } from './projection';

/**
 * Tactical map layers.
 *
 * Each layer is a pure function of `(projection, data)` and renders SVG only.
 * They know nothing about how the map is panned, which data source is active,
 * or what else is on screen — which is what lets the same layers be reused by
 * the fleet page, an incident replay view, or a Mapbox overlay later.
 *
 * Every layer is memoised. The vehicle layer redraws at 1 Hz; without memo the
 * static corridor and hotspot geometry would be re-created on every one of
 * those ticks.
 */

const THREAT_FILL: Record<ThreatLevel, string> = {
  MINIMAL: 'var(--color-threat-minimal)',
  GUARDED: 'var(--color-threat-guarded)',
  ELEVATED: 'var(--color-threat-elevated)',
  HIGH: 'var(--color-threat-high)',
  SEVERE: 'var(--color-threat-severe)',
};

const CORRIDOR_STROKE: Record<CorridorStatus, string> = {
  CLEAR: 'var(--color-threat-minimal)',
  CAUTION: 'var(--color-threat-elevated)',
  DEGRADED: 'var(--color-threat-high)',
  CLOSED: 'var(--color-threat-severe)',
};

// ============================================================================
// Grid
// ============================================================================

/** Reference graticule. Gives the eye a sense of scale and motion. */
export const GridLayer = memo(function GridLayer({ projection }: { projection: Projection }) {
  const step = 48;
  const columns = Math.ceil(projection.width / step);
  const rows = Math.ceil(projection.height / step);

  return (
    <g aria-hidden opacity={0.5}>
      {Array.from({ length: columns }, (_, i) => (
        <line
          key={`v${i}`}
          x1={i * step}
          y1={0}
          x2={i * step}
          y2={projection.height}
          stroke="rgb(255 255 255 / 4%)"
          strokeWidth={1}
        />
      ))}
      {Array.from({ length: rows }, (_, i) => (
        <line
          key={`h${i}`}
          x1={0}
          y1={i * step}
          x2={projection.width}
          y2={i * step}
          stroke="rgb(255 255 255 / 4%)"
          strokeWidth={1}
        />
      ))}
    </g>
  );
});

// ============================================================================
// Hotspots
// ============================================================================

export const HotspotLayer = memo(function HotspotLayer({
  projection,
  hotspots,
  onSelect,
}: {
  projection: Projection;
  hotspots: readonly CrimeHotspot[];
  onSelect?: (hotspot: CrimeHotspot) => void;
}) {
  return (
    <g>
      {hotspots.map((hotspot) => {
        const { x, y } = projection.project(hotspot.centre);
        const radius = Math.max(6, metresToUnits(projection, hotspot.radiusMetres));
        const colour = THREAT_FILL[hotspot.level];

        return (
          <g
            key={hotspot.id}
            role={onSelect ? 'button' : undefined}
            tabIndex={onSelect ? 0 : undefined}
            aria-label={`${hotspot.name}, ${hotspot.level} risk, ${hotspot.incidentCount90d} incidents in 90 days`}
            onClick={() => onSelect?.(hotspot)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') onSelect?.(hotspot);
            }}
            className={onSelect ? 'cursor-pointer outline-none' : undefined}
          >
            <circle cx={x} cy={y} r={radius} fill={colour} fillOpacity={0.08} />
            <circle
              cx={x}
              cy={y}
              r={radius}
              fill="none"
              stroke={colour}
              strokeOpacity={0.4}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <circle cx={x} cy={y} r={2.5} fill={colour} fillOpacity={0.85} />
          </g>
        );
      })}
    </g>
  );
});

// ============================================================================
// SafeCorridors
// ============================================================================

export const CorridorLayer = memo(function CorridorLayer({
  projection,
  corridors,
  highlightedId,
}: {
  projection: Projection;
  corridors: readonly SafeCorridor[];
  highlightedId?: string | null;
}) {
  return (
    <g>
      {corridors.map((corridor) => {
        const points = toPolylinePoints(projection, corridor.waypoints);
        const colour = CORRIDOR_STROKE[corridor.status];
        const highlighted = highlightedId === corridor.id;

        return (
          <g key={corridor.id} aria-label={`${corridor.name}, ${corridor.status}`}>
            {/* Wide translucent casing, so the route reads as a corridor with
                width rather than as a hairline. */}
            <polyline
              points={points}
              fill="none"
              stroke={colour}
              strokeOpacity={highlighted ? 0.28 : 0.14}
              strokeWidth={highlighted ? 12 : 8}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              points={points}
              fill="none"
              stroke={colour}
              strokeOpacity={highlighted ? 1 : 0.7}
              strokeWidth={highlighted ? 2.5 : 1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={corridor.status === CorridorStatus.CLOSED ? '6 5' : undefined}
            />

            {corridor.waypoints.length > 0
              ? [corridor.waypoints[0], corridor.waypoints[corridor.waypoints.length - 1]].map(
                  (endpoint, index) => {
                    if (!endpoint) return null;
                    const { x, y } = projection.project(endpoint);
                    return (
                      <circle
                        key={index}
                        cx={x}
                        cy={y}
                        r={3}
                        fill="var(--color-abyss)"
                        stroke={colour}
                        strokeWidth={1.5}
                      />
                    );
                  },
                )
              : null}
          </g>
        );
      })}
    </g>
  );
});

// ============================================================================
// Responders
// ============================================================================

const RESPONDER_COLOUR: Record<ResponderKind, string> = {
  POLICE: 'var(--color-aegis-400)',
  HOSPITAL: 'var(--color-signal-success)',
  SECURITY: 'var(--color-hologram)',
  FIRE: 'var(--color-signal-warning)',
  TOW: 'var(--color-ink-tertiary)',
};

export const ResponderLayer = memo(function ResponderLayer({
  projection,
  responders,
  visibleKinds,
  onSelect,
}: {
  projection: Projection;
  responders: readonly ResponderAsset[];
  visibleKinds: ReadonlySet<ResponderKind>;
  onSelect?: (responder: ResponderAsset) => void;
}) {
  return (
    <g>
      {responders
        .filter((responder) => visibleKinds.has(responder.kind))
        .map((responder) => {
          const { x, y } = projection.project(responder.position);
          const colour = RESPONDER_COLOUR[responder.kind];
          const isMobile = responder.callSign !== null;
          const dimmed = responder.status === ResponderStatus.OFFLINE;

          return (
            <g
              key={responder.id}
              opacity={dimmed ? 0.3 : 1}
              role={onSelect ? 'button' : undefined}
              tabIndex={onSelect ? 0 : undefined}
              aria-label={`${responder.name}, ${responder.status}`}
              onClick={() => onSelect?.(responder)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onSelect?.(responder);
              }}
              className={onSelect ? 'cursor-pointer outline-none' : undefined}
            >
              {isMobile ? (
                // Mobile units are diamonds; facilities are squares. Shape
                // rather than colour alone carries the distinction, so it
                // survives a colour-vision deficiency.
                <rect
                  x={x - 4}
                  y={y - 4}
                  width={8}
                  height={8}
                  transform={`rotate(45 ${x} ${y})`}
                  fill={colour}
                  fillOpacity={0.9}
                  stroke="var(--color-void)"
                  strokeWidth={1}
                />
              ) : (
                <rect
                  x={x - 4.5}
                  y={y - 4.5}
                  width={9}
                  height={9}
                  rx={1.5}
                  fill="var(--color-abyss)"
                  stroke={colour}
                  strokeWidth={1.75}
                />
              )}

              {responder.status === ResponderStatus.EN_ROUTE ? (
                <circle cx={x} cy={y} r={9} fill="none" stroke={colour} strokeOpacity={0.5}>
                  <animate attributeName="r" values="7;13;7" dur="2s" repeatCount="indefinite" />
                  <animate
                    attributeName="stroke-opacity"
                    values="0.6;0;0.6"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                </circle>
              ) : null}
            </g>
          );
        })}
    </g>
  );
});

// ============================================================================
// Vehicles
// ============================================================================

export const VehicleLayer = memo(function VehicleLayer({
  projection,
  vehicles,
  selectedId,
  onSelect,
}: {
  projection: Projection;
  vehicles: readonly MapVehicle[];
  selectedId?: string | null;
  onSelect?: (vehicle: MapVehicle) => void;
}) {
  return (
    <g>
      {vehicles.map((vehicle) => {
        const { x, y } = projection.project(vehicle.position);
        const colour = THREAT_FILL[vehicle.threatLevel];
        const selected = selectedId === vehicle.id;
        const heading = vehicle.position.heading ?? 0;

        return (
          <g
            key={vehicle.id}
            role={onSelect ? 'button' : undefined}
            tabIndex={onSelect ? 0 : undefined}
            aria-label={`${vehicle.registrationNumber}, risk ${vehicle.riskScore}, ${vehicle.threatLevel}`}
            onClick={() => onSelect?.(vehicle)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') onSelect?.(vehicle);
            }}
            className={onSelect ? 'cursor-pointer outline-none' : undefined}
          >
            {vehicle.isUnderThreat ? (
              <circle cx={x} cy={y} r={10} fill="none" stroke={colour} strokeWidth={1.5}>
                <animate attributeName="r" values="7;18;7" dur="1.6s" repeatCount="indefinite" />
                <animate
                  attributeName="stroke-opacity"
                  values="0.9;0;0.9"
                  dur="1.6s"
                  repeatCount="indefinite"
                />
              </circle>
            ) : null}

            {selected ? (
              <circle
                cx={x}
                cy={y}
                r={11}
                fill="none"
                stroke="var(--color-aegis-300)"
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
            ) : null}

            {/* Heading chevron. Direction of travel is the first thing an
                operator looks for when a vehicle stops matching its route. */}
            <path
              d="M 0 -6 L 4 5 L 0 2.5 L -4 5 Z"
              transform={`translate(${x} ${y}) rotate(${heading})`}
              fill={colour}
              stroke="var(--color-void)"
              strokeWidth={0.75}
            />
          </g>
        );
      })}
    </g>
  );
});
