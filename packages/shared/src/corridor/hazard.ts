import {
  HazardSource,
  IncidentType,
  type RoadSegment,
  type SegmentHazard,
} from '@aegisdrive/types';

/**
 * Segment hazard rates.
 *
 * ## Rates, not scores
 *
 * A hazard is an incident rate per vehicle-hour. That choice does all the work
 * downstream: rates multiply by time to give expected incidents, expected
 * incidents sum along a route, and the sum trades off directly against minutes.
 * A unitless "risk score of 73" supports none of those operations, and every
 * arithmetic done with one is arbitrary.
 *
 * ## Why rates are computed, never entered
 *
 * `computeHazardRate` needs an exposure denominator — vehicle-hours actually
 * driven on the segment. Without it a segment with two incidents has an
 * undefined rate, and the tempting move is to substitute a score somebody
 * eyeballed. Two incidents on a road nobody drives and two on the M1 are wildly
 * different facts, and only the denominator distinguishes them.
 *
 * Where the denominator is missing the rate is reported with near-zero
 * confidence rather than omitted, so a thinly-observed segment reads as
 * *unknown* rather than as *safe*.
 */

export const HAZARD_MODEL_VERSION = 'hazard-v1' as const;
export const HAZARD_CALIBRATION_SOURCE = 'observed-incidents-v1' as const;

/**
 * Baseline rate used where a segment has no usable observations, in incidents
 * per million vehicle-hours.
 *
 * Derived from the national figures behind
 * `DEFAULT_BASE_RATE_PER_TRIP_HOUR` in the behaviour engine: 5e-6 per
 * vehicle-hour is 5 per million. Applying the population baseline to an
 * unobserved segment is the neutral choice — it neither penalises a road for
 * being unstudied nor pretends it is safe.
 */
export const BASELINE_RATE_PER_MILLION_VEHICLE_HOURS = 5;

/**
 * Observations below which a rate is not trusted enough to influence routing.
 *
 * Under about eight events the Poisson uncertainty on a rate is wider than the
 * differences the router would be acting on, so a detour justified by fewer is
 * a detour justified by noise.
 */
export const MINIMUM_OBSERVATIONS_FOR_CONFIDENCE = 8;

/** Vehicle-hours of exposure below which the denominator is too thin to divide by. */
export const MINIMUM_EXPOSURE_VEHICLE_HOURS = 250;

/** Sources whose rates reflect reporting and policing intensity as much as crime. */
const BIASED_SOURCES: readonly HazardSource[] = [
  HazardSource.POLICE_STATISTICS,
  HazardSource.PARTNER_FEED,
];

export function isReportingBiased(source: HazardSource): boolean {
  return BIASED_SOURCES.includes(source);
}

export interface HazardObservation {
  segmentId: string;
  incidentType: IncidentType;
  /** Confirmed events in the window. Never platform alerts — see `HazardSource`. */
  confirmedIncidents: number;
  /** Vehicle-hours driven on the segment in the same window. The denominator. */
  exposureVehicleHours: number;
  activeFromHour: number | null;
  activeToHour: number | null;
  source: HazardSource;
  observedFrom: string;
  observedUntil: string;
}

/**
 * Turns counted incidents and observed exposure into a rate with a confidence.
 *
 * The confidence is where most of the judgement lives. It falls with thin
 * observation counts, falls with thin exposure, and falls again for sources
 * subject to reporting bias. Those three multiply, so a police-statistics rate
 * from six events over little exposure ends up with a confidence low enough
 * that the routing policy ignores it — which is correct, because that number
 * is not evidence of anything.
 */
export function computeHazardRate(observation: HazardObservation): SegmentHazard {
  const hasExposure = observation.exposureVehicleHours >= MINIMUM_EXPOSURE_VEHICLE_HOURS;

  const rate = hasExposure
    ? (observation.confirmedIncidents / observation.exposureVehicleHours) * 1_000_000
    : BASELINE_RATE_PER_MILLION_VEHICLE_HOURS;

  // Poisson-ish: uncertainty on a count of n scales as sqrt(n), so confidence
  // rises with the square root of the observation count rather than linearly.
  const countConfidence = Math.min(
    1,
    Math.sqrt(observation.confirmedIncidents / MINIMUM_OBSERVATIONS_FOR_CONFIDENCE),
  );

  const exposureConfidence = hasExposure
    ? Math.min(1, observation.exposureVehicleHours / (MINIMUM_EXPOSURE_VEHICLE_HOURS * 4))
    : 0;

  // Reporting bias is handled by lowering confidence, never by scaling the
  // rate. The size of the bias is unknown and varies by area; inventing a
  // correction factor would substitute a fabricated number for an honest
  // admission that this figure is soft.
  const sourceConfidence = isReportingBiased(observation.source) ? 0.6 : 1;

  const confidence = clamp01(countConfidence * exposureConfidence * sourceConfidence);

  return {
    segmentId: observation.segmentId,
    incidentType: observation.incidentType,
    ratePerMillionVehicleHours: round3(rate),
    activeFromHour: observation.activeFromHour,
    activeToHour: observation.activeToHour,
    confidence: round3(confidence),
    observationCount: observation.confirmedIncidents,
    source: observation.source,
    reportingBiasPossible: isReportingBiased(observation.source),
    validFrom: observation.observedFrom,
    validUntil: null,
    lastComputedAt: new Date().toISOString(),
  };
}

/**
 * Whether a hazard applies at a given hour.
 *
 * Handles windows that wrap midnight, which most hijacking hotspots do — the
 * dangerous window on an offramp is typically 18:00 to 02:00, and a naive
 * `from <= hour <= to` reports that as never active.
 */
export function isActiveAtHour(hazard: SegmentHazard, hour: number): boolean {
  const { activeFromHour, activeToHour } = hazard;

  if (activeFromHour === null || activeToHour === null) return true;
  if (activeFromHour === activeToHour) return true;

  return activeFromHour < activeToHour
    ? hour >= activeFromHour && hour < activeToHour
    : hour >= activeFromHour || hour < activeToHour;
}

/**
 * The rate to use for a segment at a given hour.
 *
 * Hazards below the confidence floor are excluded entirely rather than
 * downweighted. A low-confidence rate is not a small amount of evidence about
 * how dangerous a road is; it is an absence of evidence, and letting it nudge
 * a route means detouring on noise.
 *
 * With nothing usable the population baseline applies, so an unstudied road is
 * treated as ordinary rather than as safe.
 */
export function effectiveRate(
  hazards: readonly SegmentHazard[],
  hour: number,
  minimumConfidence: number,
): { ratePerMillionVehicleHours: number; confidence: number; dominant: IncidentType | null } {
  const applicable = hazards.filter(
    (hazard) => isActiveAtHour(hazard, hour) && hazard.confidence >= minimumConfidence,
  );

  if (applicable.length === 0) {
    return {
      ratePerMillionVehicleHours: BASELINE_RATE_PER_MILLION_VEHICLE_HOURS,
      confidence: 0,
      dominant: null,
    };
  }

  // Incident types are distinct events, so their rates add. A segment with a
  // hijacking rate and a smash-and-grab rate has the sum of both.
  const total = applicable.reduce((sum, hazard) => sum + hazard.ratePerMillionVehicleHours, 0);

  const dominant = [...applicable].sort(
    (a, b) => b.ratePerMillionVehicleHours - a.ratePerMillionVehicleHours,
  )[0];

  const meanConfidence =
    applicable.reduce((sum, hazard) => sum + hazard.confidence, 0) / applicable.length;

  return {
    ratePerMillionVehicleHours: round3(Math.max(total, BASELINE_RATE_PER_MILLION_VEHICLE_HOURS)),
    confidence: round3(meanConfidence),
    dominant: dominant?.incidentType ?? null,
  };
}

/**
 * Rejects hazard data the policy forbids.
 *
 * Returns a reason rather than filtering silently. A rejected feed is a
 * configuration problem someone needs to see, not a row to drop.
 */
export function admitHazardSource(
  source: string,
): { admitted: true } | { admitted: false; reason: string } {
  const known = Object.values(HazardSource) as string[];

  if (!known.includes(source)) {
    return {
      admitted: false,
      reason:
        `'${source}' is not a recognised hazard source. In particular, the platform's own ` +
        `alerts are not a permitted source: flagging a segment raises monitoring there, ` +
        `which raises detections, which raises the flag. That loop manufactures the pattern ` +
        `it claims to find. Only human-confirmed incidents count.`,
    };
  }

  return { admitted: true };
}

/** Vehicle-hours a segment contributes, at a given transit time. */
export function exposureHours(segment: RoadSegment, transitSeconds: number): number {
  void segment;
  return transitSeconds / 3600;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
