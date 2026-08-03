import {
  RecalculationTrigger,
  type GeoPoint,
  type RecalculationPolicy,
  type RouteCandidate,
  type RoutePlan,
} from '@aegisdrive/types';
import { distanceMetres } from '../utils/geo';

/**
 * Dynamic route recalculation.
 *
 * ## Why most of this file is about *not* recalculating
 *
 * A router that re-plans whenever it can improve the objective sends a driver a
 * new instruction every few seconds. In practice the driver stops following the
 * routing — and a driver ignoring a route they no longer trust is worse off
 * than one following a slightly stale one.
 *
 * So recalculation is gated three ways: a minimum interval, a minimum
 * improvement, and a hard requirement that the vehicle is in a position to act
 * on the answer. Only genuine viability failures — a closed road, a live threat
 * decision — bypass all three, because those are not improvements to be weighed
 * but reasons the current route no longer exists.
 */

export const RECALCULATION_VERSION = 'recalculation-v1' as const;

export const DEFAULT_RECALCULATION_POLICY: RecalculationPolicy = Object.freeze({
  // Two minutes. Long enough that a driver is not re-routed while still
  // executing the last instruction, short enough to react within a leg.
  minimumIntervalSeconds: 120,
  // Below three minutes of improvement, the disruption of changing plan costs
  // more than the saving — the driver has to re-orient, and the new route's
  // estimate carries its own error.
  minimumImprovementMinutes: 3,
  offRouteToleranceMetres: 250,
  immediateTriggers: [
    RecalculationTrigger.ROAD_CLOSED,
    RecalculationTrigger.THREAT_DECISION,
    RecalculationTrigger.OPERATOR_REQUEST,
    RecalculationTrigger.OFF_ROUTE,
  ],
});

export interface RecalculationContext {
  plan: RoutePlan;
  trigger: RecalculationTrigger;
  /** When the current plan was last computed. */
  lastPlannedAt: string;
  /** The best alternative found, if one was computed. */
  alternative?: RouteCandidate | null;
  now?: Date;
  policy?: RecalculationPolicy;
}

export type RecalculationVerdict =
  | { recalculate: true; reason: string; immediate: boolean }
  | { recalculate: false; reason: string };

export function shouldRecalculate(context: RecalculationContext): RecalculationVerdict {
  const policy = context.policy ?? DEFAULT_RECALCULATION_POLICY;
  const now = context.now ?? new Date();

  const secondsSince = (now.getTime() - Date.parse(context.lastPlannedAt)) / 1000;

  if (policy.immediateTriggers.includes(context.trigger)) {
    return {
      recalculate: true,
      immediate: true,
      reason: immediateReason(context.trigger),
    };
  }

  if (!Number.isFinite(secondsSince)) {
    return { recalculate: false, reason: 'Plan timestamp is unreadable; not recalculating.' };
  }

  if (secondsSince < policy.minimumIntervalSeconds) {
    return {
      recalculate: false,
      reason:
        `Only ${Math.round(secondsSince)}s since the last plan, below the ` +
        `${policy.minimumIntervalSeconds}s floor. Re-routing a driver faster than they can act ` +
        `on it teaches them to ignore the routing.`,
    };
  }

  const alternative = context.alternative;
  if (!alternative) {
    return { recalculate: false, reason: 'No alternative route was found.' };
  }

  const improvement = context.plan.chosen.objectiveMinutes - alternative.objectiveMinutes;

  if (improvement < policy.minimumImprovementMinutes) {
    return {
      recalculate: false,
      reason:
        `The best alternative improves the objective by ${improvement.toFixed(1)} minutes, below ` +
        `the ${policy.minimumImprovementMinutes}-minute floor. The disruption of changing plan ` +
        `costs more than the saving.`,
    };
  }

  return {
    recalculate: true,
    immediate: false,
    reason:
      `Alternative improves the objective by ${improvement.toFixed(1)} minutes ` +
      `(${context.trigger.toLowerCase().replace(/_/g, ' ')}).`,
  };
}

function immediateReason(trigger: RecalculationTrigger): string {
  switch (trigger) {
    case RecalculationTrigger.ROAD_CLOSED:
      return 'A segment on the planned route is closed. The current route is not viable, so the interval and improvement floors do not apply.';
    case RecalculationTrigger.THREAT_DECISION:
      return 'The Threat Decision Engine raised something on this vehicle. Re-planning immediately.';
    case RecalculationTrigger.OPERATOR_REQUEST:
      return 'An operator requested a re-plan.';
    case RecalculationTrigger.OFF_ROUTE:
      return 'The vehicle has left the planned route, so the remaining plan no longer applies from its current position.';
    default:
      return 'Immediate trigger.';
  }
}

/**
 * Whether a position has left the planned line.
 *
 * Measured against the nearest point of the route polyline rather than the next
 * waypoint, so a driver who takes a legitimate parallel service road is not
 * flagged, while one who has genuinely diverged is.
 *
 * Vertex distance rather than true perpendicular distance to each edge. Route
 * legs are individual road segments with vertices every few tens of metres, so
 * the difference is well inside the 250 m tolerance and the exact computation
 * would run on every telemetry frame for no operational gain.
 */
export function isOffRoute(
  position: GeoPoint,
  plan: RoutePlan,
  toleranceMetres = DEFAULT_RECALCULATION_POLICY.offRouteToleranceMetres,
): { offRoute: boolean; deviationMetres: number } {
  let nearest = Number.POSITIVE_INFINITY;

  for (const leg of plan.chosen.legs) {
    for (const point of leg.geometry) {
      const metres = distanceMetres(position, point);
      if (metres < nearest) nearest = metres;
    }
  }

  if (!Number.isFinite(nearest)) {
    return { offRoute: false, deviationMetres: 0 };
  }

  return {
    offRoute: nearest > toleranceMetres,
    deviationMetres: Math.round(nearest),
  };
}

/**
 * Whether a re-route may be pushed to the driver.
 *
 * Separate from `shouldRecalculate` because computing a better route and
 * *interrupting a driver with it* are different decisions, and the second is
 * the one that can hurt.
 *
 * Under a coercion hypothesis nothing is pushed to the vehicle at all. A
 * hijacker who sees the navigation change knows the control room has noticed,
 * in front of the driver — the same rule as ADR-0008 decision 5, applied to the
 * one channel that talks to the cabin by design.
 */
export function mayNotifyDriver(input: { coercionSuspected: boolean; vehicleMoving: boolean }): {
  permitted: boolean;
  reason: string;
} {
  if (input.coercionSuspected) {
    return {
      permitted: false,
      reason:
        'Coercion is suspected on this vehicle. No navigation change is pushed to the cabin: ' +
        'an attacker who sees the route change learns that the control room has noticed, in ' +
        'front of the driver. Route the response, not the driver.',
    };
  }

  if (!input.vehicleMoving) {
    return {
      permitted: true,
      reason: 'Vehicle is stationary — a good moment to change the plan.',
    };
  }

  return { permitted: true, reason: 'Normal operation.' };
}
