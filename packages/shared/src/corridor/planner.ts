import {
  RiskAversion,
  type RouteCandidate,
  type RouteLeg,
  type RouteRequest,
  type RoutingPolicy,
  type SafeHaven,
  type SegmentHazard,
  type SegmentTraffic,
} from '@aegisdrive/types';
import {
  RISK_AVERSION_MINUTES_PER_INCIDENT,
  explainChoice,
  policyForAversion,
  legExpectedIncidents,
  objectiveMinutes,
  rankCandidates,
  totalExpectedIncidents,
} from './cost';
import { HAZARD_CALIBRATION_SOURCE, effectiveRate } from './hazard';
import { assessCoverage } from './havens';
import { expectedTransitSeconds, requireRouteProvider, type ProviderPath } from './provider';

/**
 * The SafeCorridor planner.
 *
 * Costs the candidate paths a provider returns, ranks them under the objective
 * and its bounds, and explains the choice.
 *
 * ## The order of operations, which is the design
 *
 * 1. Ask the provider for several paths. It applies **no** avoidance — see
 *    `provider.ts`. Its job is geometry.
 * 2. Cost each path: transit time from observed traffic, expected incidents
 *    from segment hazard rates times time-on-segment.
 * 3. Rank under the objective, then apply the detour cap and haven-gap rule.
 * 4. Record what the choice cost, for equity review.
 *
 * Avoidance therefore happens in exactly one place, where it is bounded,
 * explained and counted. A provider configured with "avoid this polygon" would
 * bypass all four steps and do it invisibly, which is why the contract forbids
 * it.
 */

export const PLANNER_VERSION = 'corridor-planner-v1' as const;

export interface PlanningInput {
  request: RouteRequest;
  /** Hazards by segment id. Segments absent from the map use the baseline. */
  hazardsBySegment: ReadonlyMap<string, SegmentHazard[]>;
  /** Observed traffic by segment id for the departure bucket. */
  trafficBySegment: ReadonlyMap<string, SegmentTraffic>;
  havens: readonly SafeHaven[];
  policy?: RoutingPolicy;
}

export interface PlanningResult {
  chosen: RouteCandidate;
  fastest: RouteCandidate;
  rejected: RouteCandidate[];
  rationale: string[];
  constraints: string[];
  riskAversion: RiskAversion;
  riskAversionMinutesPerIncident: number;
  engineVersion: string;
  hazardCalibrationSource: string;
  providerId: string;
}

export async function planRoute(input: PlanningInput): Promise<PlanningResult> {
  const aversion = input.request.riskAversion ?? RiskAversion.STANDARD;
  const minutesPerIncident = RISK_AVERSION_MINUTES_PER_INCIDENT[aversion];

  // The whole detour allowance follows the risk-aversion profile — ratio, floor
  // and ceiling together. A cash-in-transit run may spend twenty extra minutes
  // avoiding a severe hazard where a suburban delivery may spend ten, and both
  // are counted the same way for equity.
  //
  // An explicit policy from the caller wins, so a deployment can set its own.
  const policy: RoutingPolicy = input.policy ?? policyForAversion(aversion);

  // Throws with a message explaining what is missing rather than returning an
  // empty list. An empty list would flow through the objective and surface as
  // "no safer route found", which reads as a routing decision when no routing
  // happened at all.
  const provider = requireRouteProvider();

  const paths = await provider.findPaths({
    origin: input.request.origin,
    destination: input.request.destination,
    waypoints: input.request.waypoints ?? [],
    alternatives: 3,
  });

  if (paths.length === 0) {
    throw new Error(
      `Provider ${provider.providerId} returned no paths between the requested points. ` +
        'A destination is never excluded on risk grounds, so this is a graph or coverage ' +
        'failure rather than a routing decision — see ADR-0011.',
    );
  }

  const departureHour = new Date(input.request.departAt).getUTCHours();

  const candidates = paths.map((path) =>
    costPath(path, departureHour, input, policy, minutesPerIncident),
  );

  const { chosen, fastest, ranked, constraints } = rankCandidates(candidates, policy);

  return {
    chosen,
    fastest,
    rejected: ranked.filter((candidate) => candidate.id !== chosen.id),
    rationale: explainChoice(chosen, fastest, minutesPerIncident),
    constraints,
    riskAversion: aversion,
    riskAversionMinutesPerIncident: minutesPerIncident,
    engineVersion: PLANNER_VERSION,
    hazardCalibrationSource: HAZARD_CALIBRATION_SOURCE,
    providerId: provider.providerId,
  };
}

/**
 * Costs one path.
 *
 * Exposure is integrated leg by leg rather than estimated for the route as a
 * whole, because that is what makes a detour pay for itself: every extra
 * segment contributes its own rate times its own time, so a long way round
 * accumulates baseline risk even where every individual road is quiet.
 */
function costPath(
  path: ProviderPath,
  departureHour: number,
  input: PlanningInput,
  policy: RoutingPolicy,
  minutesPerIncident: number,
): RouteCandidate {
  const legs: RouteLeg[] = path.segments.map((segment, index) => {
    const traffic = input.trafficBySegment.get(segment.id) ?? null;
    const { seconds } = expectedTransitSeconds(
      { ...segment, freeFlowSeconds: path.freeFlowSeconds[index] ?? segment.freeFlowSeconds },
      traffic,
    );

    const hazards = input.hazardsBySegment.get(segment.id) ?? [];
    const rate = effectiveRate(hazards, departureHour, policy.minimumHazardConfidence);

    return {
      segmentId: segment.id,
      label: segment.label,
      geometry: segment.geometry,
      distanceMetres: segment.lengthMetres,
      transitSeconds: seconds,
      expectedIncidents: legExpectedIncidents(rate.ratePerMillionVehicleHours, seconds),
      dominantHazard: rate.dominant,
      hazardConfidence: rate.confidence,
    };
  });

  const totalTransitSeconds = legs.reduce((total, leg) => total + leg.transitSeconds, 0);
  const totalDistanceMetres = legs.reduce((total, leg) => total + leg.distanceMetres, 0);
  const expectedIncidents = totalExpectedIncidents(legs);

  const meanConfidence =
    legs.length > 0
      ? legs.reduce((total, leg) => total + leg.hazardConfidence, 0) / legs.length
      : 0;

  return {
    id: path.id,
    label: path.label,
    legs,
    totalDistanceMetres: Math.round(totalDistanceMetres),
    totalTransitSeconds: Math.round(totalTransitSeconds),
    expectedIncidents,
    objectiveMinutes: round3(
      objectiveMinutes(totalTransitSeconds, expectedIncidents, minutesPerIncident),
    ),
    // Filled in by `rankCandidates`, which knows which candidate is fastest.
    detourSeconds: 0,
    riskReduction: 0,
    confidence: round3(meanConfidence),
    havenCoverage: assessCoverage(legs, input.havens, policy.maximumHavenGapSeconds),
  };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
