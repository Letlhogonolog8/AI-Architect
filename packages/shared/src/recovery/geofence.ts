import type { GeoPoint, GeofenceEventType, GeofenceTrigger } from '@aegisdrive/types';
import { GeofenceEventType as EventType, GeofenceTrigger as Trigger } from '@aegisdrive/types';
import { isWithinRadius } from '../utils/geo';

/**
 * Geofence crossing logic.
 *
 * The geometry is a circle — PostGIS is deferred with the map, so a fence is a
 * centre and a radius, the same shape as `SafeHaven`. What lives here is the
 * *judgement*: given where a vehicle was and where it is now, and what a fence is
 * configured to watch for, did a crossing worth recording just happen?
 *
 * Kept as a pure function so it is the same on the API, in the telemetry
 * pipeline that will call it per position, and under test — one definition of
 * "crossed", not three that can drift.
 */

/** True when a point lies inside a circular fence. */
export function geofenceContains(point: GeoPoint, centre: GeoPoint, radiusMetres: number): boolean {
  return isWithinRadius(point, centre, radiusMetres);
}

/**
 * Resolves whether a transition across a fence boundary should be recorded, and
 * as what.
 *
 * The crossing is derived from two boolean states — was the vehicle inside, is
 * it inside now — rather than from raw positions, so the caller decides how
 * `wasInside` is known (the last recorded event, or a previous fix). A
 * transition is only recorded when the fence's `trigger` asks for that
 * direction:
 *
 *   - `ENTER` / `ENTER_EXIT` record an outside→inside crossing.
 *   - `EXIT` / `ENTER_EXIT` record an inside→outside crossing.
 *   - `DWELL` records the entry (the dwell timer starts on the way in); the
 *     dwell itself is a timing concern the caller owns, not a crossing.
 *
 * Returns `null` when nothing worth recording happened — the common case on
 * almost every position update, and the reason a fleet is not drowned in events.
 */
export function resolveCrossing(
  trigger: GeofenceTrigger,
  wasInside: boolean,
  isInside: boolean,
): GeofenceEventType | null {
  // Entered.
  if (!wasInside && isInside) {
    if (trigger === Trigger.ENTER || trigger === Trigger.ENTER_EXIT) return EventType.ENTER;
    if (trigger === Trigger.DWELL) return EventType.ENTER;
    return null;
  }

  // Exited.
  if (wasInside && !isInside) {
    if (trigger === Trigger.EXIT || trigger === Trigger.ENTER_EXIT) return EventType.EXIT;
    return null;
  }

  // No boundary was crossed.
  return null;
}
