import type { GeoPoint, RoadSegment, SegmentTraffic } from '@aegisdrive/types';

/**
 * The road-graph provider contract.
 *
 * ## Why there is no router in this build
 *
 * Turning two coordinates into a set of candidate paths needs a routing graph —
 * OSRM, Valhalla, GraphHopper or Mapbox Directions. ADR-0004 deferred the map
 * integration and that decision still stands, so no provider is installed and
 * `planRoute` returns 501.
 *
 * What *is* built is everything downstream of the graph: the hazard model, the
 * exposure integral, the objective and its detour bounds, haven coverage,
 * recalculation hysteresis and equity accounting. That split follows the same
 * line as the cabin engine — the product's judgement is in reviewable code, the
 * commodity is behind an interface.
 *
 * The judgement here is *which* of several paths to take and what to trade for
 * it. Finding the paths is a solved problem somebody else has solved better.
 *
 * ## What a provider must not do
 *
 * A provider returns candidate paths and their free-flow times. It does **not**
 * apply avoidance, and it must not be configured with "avoid area" polygons.
 * All risk reasoning happens in `cost.ts` against segment hazards, where it is
 * bounded, logged and equity-accounted. A provider silently avoiding a
 * neighbourhood would defeat every constraint in this package, and it would do
 * it invisibly.
 */

export const PROVIDER_CONTRACT_VERSION = 'route-provider-v1' as const;

export class RouteProviderUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RouteProviderUnavailableError';
  }
}

export interface ProviderPathRequest {
  origin: GeoPoint;
  destination: GeoPoint;
  waypoints: readonly GeoPoint[];
  /**
   * How many distinct candidates to return.
   *
   * At least three: the fastest, plus alternatives the objective can actually
   * choose between. A provider returning one path gives the objective nothing
   * to do, and the engine degrades to "the fastest route, costed".
   */
  alternatives: number;
}

export interface ProviderPath {
  id: string;
  label: string;
  segments: RoadSegment[];
  /** Free-flow time per segment, in the same order. */
  freeFlowSeconds: number[];
}

/**
 * A road-graph provider.
 *
 * Deliberately narrow: paths and times in, nothing else. Everything that is
 * *policy* rather than geometry stays in this package so it cannot differ
 * between providers or be quietly relaxed inside a vendor SDK.
 */
export interface RouteProvider {
  /** Versioned, e.g. `osrm-v5`. Recorded on every plan for provenance. */
  readonly providerId: string;

  isAvailable(): Promise<boolean>;
  findPaths(request: ProviderPathRequest): Promise<ProviderPath[]>;
}

let installed: RouteProvider | null = null;

export function registerRouteProvider(provider: RouteProvider): void {
  installed = provider;
}

export function registeredProvider(): RouteProvider | null {
  return installed;
}

/**
 * Returns the installed provider, or throws with a message that says what is
 * missing rather than a generic failure.
 *
 * Throwing beats returning an empty candidate list. An empty list would flow
 * through the objective and produce "no safer route found — using the fastest",
 * which reads as a routing decision when in fact no routing happened at all.
 */
export function requireRouteProvider(): RouteProvider {
  if (installed === null) {
    throw new RouteProviderUnavailableError(
      'No road-graph provider is installed, so no route can be planned. The hazard model, ' +
        'objective, detour bounds, haven coverage and equity accounting are all built and ' +
        'tested; what is missing is the graph that turns two coordinates into candidate paths. ' +
        'Register one with registerRouteProvider() — see ADR-0004 and ADR-0011.',
    );
  }

  return installed;
}

/**
 * Expected transit time for a segment at a given time.
 *
 * Falls back to free-flow when the fleet has not driven the segment in that
 * bucket, and reports which happened. A fabricated congestion multiplier would
 * make an unobserved road look precisely estimated, and the difference between
 * "we measured this" and "we assumed this" changes how much weight the
 * comparison between two candidate routes deserves.
 */
export function expectedTransitSeconds(
  segment: RoadSegment,
  traffic: SegmentTraffic | null,
): { seconds: number; observed: boolean } {
  if (traffic === null || traffic.sampleCount < MINIMUM_TRAFFIC_SAMPLES) {
    return { seconds: segment.freeFlowSeconds, observed: false };
  }

  // The 85th percentile, not the median. A planner quoting the median is late
  // half the time, and in this product being late means a driver waiting
  // somewhere they did not plan to wait.
  return { seconds: traffic.p85Seconds, observed: true };
}

/** Observations below which a traffic estimate is not used. */
export const MINIMUM_TRAFFIC_SAMPLES = 12;
