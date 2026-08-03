import {
  RiskAversion,
  type RouteCandidate,
  type RouteLeg,
  type RoutingPolicy,
} from '@aegisdrive/types';

/**
 * The routing objective, and the bounds on it.
 *
 * ## The objective
 *
 *     objective = transitMinutes + λ × expectedIncidents
 *
 * where λ is **minutes we are willing to spend to avoid one expected
 * incident**. Expressing the trade-off in those units makes it an arguable
 * number rather than a hidden weight, and it is recorded on every plan so a
 * route can be defended afterwards.
 *
 * ## Why this is self-limiting, which matters more than it sounds
 *
 * `expectedIncidents` is a hazard *rate* multiplied by *time on the road*. A
 * detour therefore accumulates its own exposure: driving forty minutes around a
 * bad offramp adds forty minutes of baseline risk, and past some point the
 * detour is worse than the thing it avoids.
 *
 * A router minimising a unitless "risk score" has no such property. It will
 * happily send a driver an hour out of their way to reduce a number, and the
 * driver ends up more exposed, later at night, on roads nobody has data for.
 * The arithmetic here refuses to do that without needing a rule to stop it.
 *
 * The explicit detour cap below is a second line of defence, for the case where
 * the hazard data is wrong.
 */

export const COST_MODEL_VERSION = 'corridor-cost-v1' as const;

/**
 * Minutes of driving accepted per expected incident avoided.
 *
 * The numbers look enormous because expected incidents are tiny — a one-hour
 * urban trip carries around 5e-6. At `STANDARD`, a route that halves a
 * tenfold-elevated hazard over an hour saves roughly 2.5e-5 incidents and is
 * therefore worth about five minutes. That is the intended scale.
 *
 * This is a judgement about how much of a driver's time is worth their safety.
 * It belongs to the operator, not to this file, and the defaults exist so that
 * a deployment that has not thought about it still behaves sanely.
 */
export const RISK_AVERSION_MINUTES_PER_INCIDENT: Readonly<Record<RiskAversion, number>> =
  Object.freeze({
    [RiskAversion.LOW]: 60_000,
    [RiskAversion.STANDARD]: 200_000,
    // Cash-in-transit, executive protection, night routes. Roughly three times
    // standard: still bounded, and still subject to the detour cap.
    [RiskAversion.HIGH]: 600_000,
  });

/**
 * The default policy.
 *
 * The detour allowance is the important part, and it took three numbers to get
 * right. The allowance is
 *
 *     min(maximumDetourSeconds, max(ratio × fastest, minimumAllowance))
 *
 * so a 30-minute trip gets the 10-minute floor rather than 25% of 30 (which is
 * 7.5 and rejects almost every worthwhile detour), a 2-hour trip gets 25%
 * capped at 20 minutes, and a 6-hour trip still gets 20 rather than 90.
 *
 * An earlier version took the *minimum* of the ratio and the absolute, which
 * made the ratio bind on every short trip and produced a router that rejected a
 * route offering 94% less exposure for eight extra minutes. The bug is easy to
 * write and hard to see, because both bounds look reasonable in isolation.
 */
export const DEFAULT_ROUTING_POLICY: RoutingPolicy = Object.freeze({
  neverExcludeDestination: true,
  permitIndividualLevelAvoidance: false,
  permitSelfReinforcingHazardData: false,
  maximumDetourRatio: 0.25,
  minimumDetourAllowanceSeconds: 10 * 60,
  maximumDetourSeconds: 20 * 60,
  maximumHavenGapSeconds: 25 * 60,
  minimumHazardConfidence: 0.35,
});

/**
 * Detour allowance by risk-aversion profile.
 *
 * All three numbers scale together, and they have to. Scaling only the ceiling
 * looks like it works and does nothing on the trips that matter most: on a
 * 30-minute run the floor dominates, so a `HIGH` profile with a 45-minute
 * ceiling still only authorises the 10-minute floor. Short urban trips are
 * exactly where the hotspots are.
 *
 * Raising the allowance does not weaken the protection against redlining,
 * because the allowance was never the whole protection. `RoutingEquityRecord`
 * counts every detour regardless, and a fleet routinely spending twenty extra
 * minutes to reach one destination cell shows up in the equity report for a
 * human to look at. The allowance stops routine over-detouring; the report
 * catches systematic patterns. They are different jobs.
 */
export const DETOUR_PROFILE: Readonly<
  Record<RiskAversion, { ratio: number; floorSeconds: number; ceilingSeconds: number }>
> = Object.freeze({
  [RiskAversion.LOW]: { ratio: 0.15, floorSeconds: 5 * 60, ceilingSeconds: 10 * 60 },
  [RiskAversion.STANDARD]: { ratio: 0.25, floorSeconds: 10 * 60, ceilingSeconds: 20 * 60 },
  // Cash-in-transit, executive protection, night routes. Even here the ceiling
  // is 45 minutes and the proportional term is 60%, so a 30-minute trip is
  // allowed 20 extra minutes rather than an unbounded diversion. A detour that
  // more than doubles a short trip is a decision for a person, and the
  // constraint message says so.
  [RiskAversion.HIGH]: { ratio: 0.6, floorSeconds: 20 * 60, ceilingSeconds: 45 * 60 },
});

/** The routing policy for a risk-aversion profile. */
export function policyForAversion(
  aversion: RiskAversion,
  base: RoutingPolicy = DEFAULT_ROUTING_POLICY,
): RoutingPolicy {
  const profile = DETOUR_PROFILE[aversion];

  return {
    ...base,
    maximumDetourRatio: profile.ratio,
    minimumDetourAllowanceSeconds: profile.floorSeconds,
    maximumDetourSeconds: profile.ceilingSeconds,
  };
}

/** Risk reduction above which a cap that blocked a candidate is reported loudly. */
const SUBSTANTIAL_RISK_REDUCTION = 0.5;

/** The detour allowance for a given fastest-route time. */
export function detourAllowanceSeconds(
  fastestTransitSeconds: number,
  policy: RoutingPolicy,
): number {
  const proportional = fastestTransitSeconds * policy.maximumDetourRatio;
  const allowance = Math.max(proportional, policy.minimumDetourAllowanceSeconds);

  return Math.min(policy.maximumDetourSeconds, allowance);
}

/** Expected incidents on one leg: rate per million vehicle-hours times hours. */
export function legExpectedIncidents(
  ratePerMillionVehicleHours: number,
  transitSeconds: number,
): number {
  const hours = transitSeconds / 3600;
  return (ratePerMillionVehicleHours / 1_000_000) * hours;
}

export function totalExpectedIncidents(legs: readonly RouteLeg[]): number {
  return legs.reduce((total, leg) => total + leg.expectedIncidents, 0);
}

/** The objective value for a candidate, in minutes. Lower is better. */
export function objectiveMinutes(
  transitSeconds: number,
  expectedIncidents: number,
  minutesPerIncident: number,
): number {
  return transitSeconds / 60 + expectedIncidents * minutesPerIncident;
}

export interface ScoredCandidates {
  ranked: RouteCandidate[];
  chosen: RouteCandidate;
  /** The fastest candidate, whether or not it was chosen. The counterfactual. */
  fastest: RouteCandidate;
  /** Constraints that bound the choice. Empty when the objective decided freely. */
  constraints: string[];
}

/**
 * Ranks candidates and applies the bounds.
 *
 * The order of operations matters. The objective picks a preference; the detour
 * cap then vetoes anything that costs too much time; the haven-gap rule vetoes
 * anything that leaves a driver with nowhere to stop. A candidate that survives
 * all three is chosen, and if nothing survives the fastest route wins — because
 * the fallback for "we cannot find a safer route" is to get there quickly, not
 * to refuse the trip.
 */
export function rankCandidates(
  candidates: readonly RouteCandidate[],
  policy: RoutingPolicy = DEFAULT_ROUTING_POLICY,
): ScoredCandidates {
  if (candidates.length === 0) {
    throw new Error('rankCandidates requires at least one candidate route.');
  }

  const constraints: string[] = [];

  const fastest = [...candidates].sort((a, b) => a.totalTransitSeconds - b.totalTransitSeconds)[0]!;

  const withComparisons = candidates.map((candidate) => ({
    ...candidate,
    detourSeconds: Math.max(0, candidate.totalTransitSeconds - fastest.totalTransitSeconds),
    riskReduction:
      fastest.expectedIncidents > 0
        ? round4(
            Math.max(
              0,
              (fastest.expectedIncidents - candidate.expectedIncidents) / fastest.expectedIncidents,
            ),
          )
        : 0,
  }));

  const ranked = [...withComparisons].sort((a, b) => a.objectiveMinutes - b.objectiveMinutes);

  const detourCap = detourAllowanceSeconds(fastest.totalTransitSeconds, policy);

  const withinDetour = ranked.filter((candidate) => candidate.detourSeconds <= detourCap);
  const excludedCandidates = ranked.filter((candidate) => candidate.detourSeconds > detourCap);

  if (excludedCandidates.length > 0) {
    constraints.push(
      `${excludedCandidates.length} candidate${excludedCandidates.length === 1 ? '' : 's'} exceeded ` +
        `the ${Math.round(detourCap / 60)}-minute detour allowance and were excluded. An unbounded ` +
        `risk-minimising route is not safer — more time on the road is itself exposure.`,
    );

    // A route that would have cut exposure substantially, blocked by the cap,
    // is not a routine exclusion. It says this segment needs an intervention
    // that routing cannot provide — a schedule change, an escort, or a
    // conversation with the road authority — and it is reported so somebody
    // sees it rather than being silently absorbed into the trip.
    const blockedSafer = excludedCandidates
      .filter((candidate) => candidate.riskReduction >= SUBSTANTIAL_RISK_REDUCTION)
      .sort((a, b) => b.riskReduction - a.riskReduction)[0];

    if (blockedSafer) {
      constraints.push(
        `The detour allowance blocked a route carrying ${(blockedSafer.riskReduction * 100).toFixed(0)}% ` +
          `less exposure, which would have cost ${Math.round(blockedSafer.detourSeconds / 60)} extra minutes. ` +
          `The driver is being sent down the higher-exposure road because the alternative is too long. ` +
          `That is a coverage problem this router cannot solve — consider a higher risk-aversion profile ` +
          `for this route, a schedule change, or an escort.`,
      );
    }
  }

  const covered = withinDetour.filter((candidate) => !candidate.havenCoverage.hasUncoveredStretch);

  let pool = covered;

  if (covered.length === 0 && withinDetour.length > 0) {
    // Every viable route has a long stretch with nowhere to stop. Recorded
    // rather than treated as disqualifying: on a rural route it may simply be
    // true, and refusing to route is not an option the product has.
    constraints.push(
      `Every candidate has a stretch longer than ${Math.round(policy.maximumHavenGapSeconds / 60)} ` +
        `minutes with no safe haven in reach. The route was chosen anyway — this is a coverage ` +
        `gap to close, not a reason to decline the trip.`,
    );
    pool = withinDetour;
  }

  if (pool.length === 0) {
    constraints.push(
      'No candidate satisfied the routing constraints; the fastest route was used. ' +
        'The fallback for "no safer route found" is to arrive quickly, never to refuse the trip.',
    );
    pool = [fastest];
  }

  return { ranked, chosen: pool[0]!, fastest, constraints };
}

/**
 * Plain-language reasons the chosen route beat the fastest one.
 *
 * Generated from the numbers rather than written, so the prose cannot drift
 * from the arithmetic. Expressed as a *comparison* — "38% less exposure" —
 * because the absolute figure is around 1e-5 and tells an operator nothing.
 */
export function explainChoice(
  chosen: RouteCandidate,
  fastest: RouteCandidate,
  minutesPerIncident: number,
): string[] {
  const lines: string[] = [];

  if (chosen.id === fastest.id) {
    lines.push('The fastest route was also the lowest-risk option available.');
  } else {
    const extraMinutes = Math.round(chosen.detourSeconds / 60);

    lines.push(
      `Chose a route ${extraMinutes} minute${extraMinutes === 1 ? '' : 's'} slower than the fastest, ` +
        `carrying ${(chosen.riskReduction * 100).toFixed(0)}% less expected exposure.`,
    );
    lines.push(
      `Trade-off in force: up to ${Math.round(minutesPerIncident / 1000)}k minutes of driving per ` +
        `expected incident avoided. Changing that value changes which routes are chosen.`,
    );
  }

  const worst = [...chosen.legs]
    .sort((a, b) => b.expectedIncidents - a.expectedIncidents)
    .slice(0, 3)
    .filter((leg) => leg.dominantHazard !== null);

  for (const leg of worst) {
    lines.push(
      `Highest-exposure leg on the chosen route: ${leg.label} ` +
        `(${leg.dominantHazard?.toLowerCase().replace(/_/g, ' ')}, ` +
        `hazard confidence ${(leg.hazardConfidence * 100).toFixed(0)}%).`,
    );
  }

  if (chosen.confidence < 0.4) {
    lines.push(
      `Hazard confidence across this route averages ${(chosen.confidence * 100).toFixed(0)}%. ` +
        `Much of it is the population baseline rather than observed data, so the risk comparison ` +
        `between candidates is weak.`,
    );
  }

  if (chosen.havenCoverage.hasUncoveredStretch) {
    lines.push(
      `Longest stretch with no safe haven in reach: ` +
        `${Math.round(chosen.havenCoverage.longestGapSeconds / 60)} minutes.`,
    );
  }

  return lines;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
