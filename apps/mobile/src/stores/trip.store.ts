import { create } from 'zustand';
import { CorridorStatus, type CrimeHotspot, type GeoPoint, type SafeCorridor } from '@/types';
import { api } from '@/lib/api-client';
import { flushTelemetry, startTracking, stopTracking } from '@/services/location';
import { readCache, writeCache } from '@/db/cache';

/**
 * Trip and SafeCorridor navigation state.
 *
 * A trip is what turns background tracking on. Outside a trip the app does not
 * stream position — continuous tracking of an off-duty driver is surveillance,
 * not protection, and the battery cost is not justifiable either.
 */

export type TripPhase = 'idle' | 'planning' | 'active' | 'completed';

export interface CorridorDeviation {
  /** Metres from the nearest point on the corridor. */
  distanceMetres: number;
  detectedAt: number;
}

/** Beyond this from the corridor, the driver is warned and the API is told. */
const DEVIATION_THRESHOLD_METRES = 350;

interface TripState {
  phase: TripPhase;
  corridors: SafeCorridor[];
  hotspots: CrimeHotspot[];
  selectedCorridor: SafeCorridor | null;
  startedAt: number | null;
  /** Set while the vehicle is off its assigned corridor. */
  deviation: CorridorDeviation | null;
  /** Hotspots the route passes through, precomputed when the trip starts. */
  hotspotsOnRoute: CrimeHotspot[];
  error: string | null;

  loadRoutes: () => Promise<void>;
  selectCorridor: (corridor: SafeCorridor) => void;
  startTrip: (vehicleId: string) => Promise<void>;
  endTrip: (vehicleId: string) => Promise<void>;
  evaluatePosition: (position: GeoPoint) => void;
}

export const useTripStore = create<TripState>((set, get) => ({
  phase: 'idle',
  corridors: [],
  hotspots: [],
  selectedCorridor: null,
  startedAt: null,
  deviation: null,
  hotspotsOnRoute: [],
  error: null,

  /**
   * Loads corridors and hotspots.
   *
   * Cached to SQLite: a driver planning a trip in a basement parking garage
   * still needs to see their routes, and these change on the order of hours.
   */
  loadRoutes: async () => {
    try {
      const [corridors, hotspots] = await Promise.all([
        api.get<SafeCorridor[]>('/corridors'),
        api.get<CrimeHotspot[]>('/threat-events/zones'),
      ]);

      set({ corridors, hotspots, error: null });
      await writeCache('corridors', corridors);
      await writeCache('hotspots', hotspots);
    } catch {
      const corridors = await readCache<SafeCorridor[]>('corridors');
      const hotspots = await readCache<CrimeHotspot[]>('hotspots');

      set({
        corridors: corridors ?? [],
        hotspots: hotspots ?? [],
        error:
          corridors === null
            ? 'Routes are unavailable offline and have not been cached yet.'
            : null,
      });
    }
  },

  selectCorridor: (corridor) => {
    set({
      selectedCorridor: corridor,
      phase: 'planning',
      hotspotsOnRoute: hotspotsAlong(corridor, get().hotspots),
    });
  },

  startTrip: async (vehicleId) => {
    await startTracking();
    set({ phase: 'active', startedAt: Date.now(), deviation: null });
    await flushTelemetry(vehicleId);
  },

  endTrip: async (vehicleId) => {
    await stopTracking();
    // Flush after stopping so the final frames of the trip are captured.
    await flushTelemetry(vehicleId);
    set({ phase: 'completed', deviation: null });
  },

  /**
   * Checks a new fix against the selected corridor.
   *
   * Deviation is a signal, not an accusation: roadworks and traffic diversions
   * cause it constantly. The app warns the driver and reports it, and the
   * server correlates it with other signals before treating it as a threat.
   */
  evaluatePosition: (position) => {
    const { selectedCorridor, phase, deviation } = get();
    if (phase !== 'active' || !selectedCorridor) return;

    const distance = distanceToPolyline(position, selectedCorridor.waypoints);

    if (distance > DEVIATION_THRESHOLD_METRES) {
      if (!deviation) set({ deviation: { distanceMetres: distance, detectedAt: Date.now() } });
      else set({ deviation: { ...deviation, distanceMetres: distance } });
      return;
    }

    if (deviation) set({ deviation: null });
  },
}));

// ============================================================================
// Geometry
// ============================================================================

const EARTH_RADIUS_METRES = 6_371_008.8;
const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export function distanceMetres(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Shortest distance from a point to a polyline.
 *
 * Projects onto each segment in a local planar approximation. Over the segment
 * lengths a corridor uses (hundreds of metres to a few kilometres) the error is
 * well under a metre — far below the GPS accuracy this is compared against.
 */
export function distanceToPolyline(point: GeoPoint, waypoints: readonly GeoPoint[]): number {
  if (waypoints.length === 0) return Number.POSITIVE_INFINITY;
  if (waypoints.length === 1) return distanceMetres(point, waypoints[0] as GeoPoint);

  let shortest = Number.POSITIVE_INFINITY;

  for (let i = 1; i < waypoints.length; i += 1) {
    const from = waypoints[i - 1] as GeoPoint;
    const to = waypoints[i] as GeoPoint;
    shortest = Math.min(shortest, distanceToSegment(point, from, to));
  }

  return shortest;
}

function distanceToSegment(point: GeoPoint, from: GeoPoint, to: GeoPoint): number {
  // Scale longitude by cos(latitude) so both axes are in comparable units.
  const scale = Math.cos(toRadians(point.latitude));

  const px = point.longitude * scale;
  const py = point.latitude;
  const ax = from.longitude * scale;
  const ay = from.latitude;
  const bx = to.longitude * scale;
  const by = to.latitude;

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;

  // Degenerate segment: both endpoints are the same point.
  if (lengthSquared === 0) return distanceMetres(point, from);

  // Projection parameter, clamped to the segment.
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));

  const nearest: GeoPoint = {
    longitude: (ax + t * dx) / scale,
    latitude: ay + t * dy,
  };

  return distanceMetres(point, nearest);
}

/** Hotspots whose circle the corridor passes through. */
export function hotspotsAlong(
  corridor: SafeCorridor,
  hotspots: readonly CrimeHotspot[],
): CrimeHotspot[] {
  return hotspots.filter(
    (hotspot) => distanceToPolyline(hotspot.centre, corridor.waypoints) <= hotspot.radiusMetres,
  );
}

/** Whether a corridor is safe to depart on, for the start-trip guard. */
export function isCorridorDepartable(corridor: SafeCorridor): boolean {
  return corridor.status !== CorridorStatus.CLOSED;
}
