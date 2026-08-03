import {
  SafeHavenKind,
  type GeoPoint,
  type HavenCoverage,
  type RankedHaven,
  type RouteLeg,
  type SafeHaven,
} from '@aegisdrive/types';
import { distanceMetres } from '../utils/geo';

/**
 * Safe haven selection.
 *
 * Where to send a vehicle whose driver has pressed the panic button, or whose
 * cabin evidence says something is wrong.
 *
 * ## What this is not
 *
 * It is not a filter on where a vehicle may be sent. `SafeHaven` describes
 * refuges *during an incident*; nothing here influences whether a delivery is
 * accepted or a destination is reachable. Conflating the two is the mechanism
 * by which a safety feature becomes a service exclusion, so the two never share
 * a code path.
 *
 * ## Why a police station is not automatically the best answer
 *
 * The obvious ranking — police station first — is wrong often enough to matter.
 * A police station twenty minutes away is worse than a staffed, lit, camera-
 * covered fuel station four minutes away, because the thing that ends a
 * hijacking is arriving somewhere public with witnesses, not arriving somewhere
 * official. Proximity and openness dominate; kind is a tiebreak.
 */

export const HAVEN_MODEL_VERSION = 'haven-v1' as const;

/**
 * Base suitability by kind, before distance and facilities.
 *
 * The spread is deliberately narrow. These differ far less than the distance
 * term does, and a wide spread would let an ordering by kind override an
 * ordering by how long it takes to get there.
 */
const KIND_SUITABILITY: Readonly<Record<SafeHavenKind, number>> = Object.freeze({
  [SafeHavenKind.POLICE_STATION]: 1.0,
  [SafeHavenKind.SECURITY_BASE]: 0.95,
  [SafeHavenKind.HOSPITAL]: 0.9,
  [SafeHavenKind.OWN_PREMISES]: 0.85,
  [SafeHavenKind.FUEL_STATION]: 0.8,
  [SafeHavenKind.PUBLIC_SECURE_SITE]: 0.75,
});

/** Beyond this, a haven is not a refuge — it is a second journey. */
export const MAXIMUM_HAVEN_DISTANCE_METRES = 15_000;

/** Assumed urban speed where no traffic estimate exists, in km/h. */
const FALLBACK_SPEED_KPH = 35;

/**
 * Havens older than this are ranked down.
 *
 * A fuel station that closed six months ago is worse than no haven at all: a
 * driver sent to a dark forecourt is worse off than one who kept driving, and
 * they arrive believing they are safe.
 */
export const HAVEN_VERIFICATION_STALE_DAYS = 180;

export interface HavenRankingInput {
  havens: readonly SafeHaven[];
  from: GeoPoint;
  /** Local hour, 0-23, for opening-hours checks. */
  atHour: number;
  now?: Date;
  /** Cap on results. Ranking beyond a handful is noise for an operator. */
  limit?: number;
}

export function rankHavens(input: HavenRankingInput): RankedHaven[] {
  const now = input.now ?? new Date();
  const limit = input.limit ?? 5;

  const ranked = input.havens
    .filter((haven) => haven.isActive)
    .map((haven) => score(haven, input.from, input.atHour, now))
    .filter((entry) => entry.distanceMetres <= MAXIMUM_HAVEN_DISTANCE_METRES)
    .sort((a, b) => b.suitability - a.suitability);

  return ranked.slice(0, limit);
}

function score(haven: SafeHaven, from: GeoPoint, atHour: number, now: Date): RankedHaven {
  const metres = distanceMetres(from, haven.position);
  const etaSeconds = Math.round((metres / 1000 / FALLBACK_SPEED_KPH) * 3600);
  const openNow = isOpenAt(haven, atHour);
  const reasons: string[] = [];

  // Distance dominates, and decays sharply. A haven twice as far away is much
  // less than half as useful — the extra minutes are spent with whatever is
  // wrong still happening.
  const proximity = Math.max(0, 1 - metres / MAXIMUM_HAVEN_DISTANCE_METRES) ** 1.5;

  let suitability = (KIND_SUITABILITY[haven.kind] ?? 0.7) * proximity;

  if (!openNow) {
    // Not excluded, because a closed hospital forecourt is still lit and
    // overlooked and is a better place to stop than a dark verge. Heavily
    // downweighted, because the difference is large.
    suitability *= 0.25;
    reasons.push('Closed at this hour — forecourt only, no staff.');
  }

  if (haven.hasArmedSecurity) {
    suitability *= 1.15;
    reasons.push('Armed security on site.');
  }
  if (haven.hasCctv) {
    suitability *= 1.08;
    reasons.push('Camera coverage.');
  }
  if (haven.hasLighting) {
    suitability *= 1.05;
  }
  if (haven.hasStandingArrangement) {
    suitability *= 1.12;
    reasons.push('Standing arrangement with this operator.');
  }

  const stale = isVerificationStale(haven, now);
  if (stale) {
    // The sharpest penalty here, and the one that matters most. A driver sent
    // to a place that has closed arrives somewhere dark believing it is safe,
    // which is worse than never having been sent.
    suitability *= 0.5;
    reasons.push(
      `Not verified in over ${HAVEN_VERIFICATION_STALE_DAYS} days — confirm it is still open before relying on it.`,
    );
  }

  reasons.unshift(
    `${(metres / 1000).toFixed(1)} km away, roughly ${Math.max(1, Math.round(etaSeconds / 60))} minutes.`,
  );

  return {
    haven,
    distanceMetres: Math.round(metres),
    etaSeconds,
    openNow,
    suitability: round3(Math.min(1, suitability)),
    reasons,
  };
}

export function isOpenAt(haven: SafeHaven, hour: number): boolean {
  if (haven.isTwentyFourHour) return true;
  if (haven.openFromHour === null || haven.openToHour === null) return false;

  return haven.openFromHour < haven.openToHour
    ? hour >= haven.openFromHour && hour < haven.openToHour
    : hour >= haven.openFromHour || hour < haven.openToHour;
}

export function isVerificationStale(haven: SafeHaven, now: Date = new Date()): boolean {
  if (haven.lastVerifiedAt === null) return true;

  const ageMs = now.getTime() - Date.parse(haven.lastVerifiedAt);
  if (!Number.isFinite(ageMs)) return true;

  return ageMs > HAVEN_VERIFICATION_STALE_DAYS * 86_400_000;
}

/**
 * How well a route is covered by havens.
 *
 * The output that matters is `longestGapSeconds`. A route can be low-risk and
 * still be a bad route: an hour of open road with nowhere to pull in is a worse
 * place to have a problem than a slightly riskier road past three fuel
 * stations. The router treats a long gap as a reason to prefer another
 * candidate, not as a reason to decline.
 */
export function assessCoverage(
  legs: readonly RouteLeg[],
  havens: readonly SafeHaven[],
  maximumGapSeconds: number,
  reachMetres = MAXIMUM_HAVEN_DISTANCE_METRES / 2,
): HavenCoverage {
  const active = havens.filter((haven) => haven.isActive);
  const reachable = new Set<string>();

  let longestGap = 0;
  let currentGap = 0;

  for (const leg of legs) {
    // The leg midpoint is a reasonable probe: legs are individual road
    // segments, so a haven within reach of the midpoint is within reach of
    // most of the leg.
    const probe = midpoint(leg.geometry);

    const near = probe
      ? active.filter((haven) => distanceMetres(probe, haven.position) <= reachMetres)
      : [];

    if (near.length > 0) {
      for (const haven of near) reachable.add(haven.id);
      currentGap = 0;
    } else {
      currentGap += leg.transitSeconds;
      if (currentGap > longestGap) longestGap = currentGap;
    }
  }

  return {
    reachableCount: reachable.size,
    longestGapSeconds: Math.round(longestGap),
    hasUncoveredStretch: longestGap > maximumGapSeconds,
  };
}

function midpoint(geometry: readonly GeoPoint[]): GeoPoint | null {
  if (geometry.length === 0) return null;
  return geometry[Math.floor(geometry.length / 2)] ?? null;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
