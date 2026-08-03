/**
 * Recovery Mesh policy constants.
 *
 * The tunable judgement of the mesh, in one reviewable place rather than
 * scattered through the request handlers.
 */

/**
 * Default radius of a containment ring drawn around a stolen vehicle's last fix.
 *
 * Sized for the assumption behind containment: a vehicle that vanished minutes
 * ago cannot have travelled far. Five kilometres covers roughly ten minutes of
 * urban driving, which is when the fix is freshest and the ring most useful; a
 * colder case gets a wider ring drawn by hand.
 */
export const DEFAULT_CONTAINMENT_RADIUS_METRES = 5_000;

/** Bounds on any geofence radius, so a "fence" cannot be a whole province or a point. */
export const MIN_GEOFENCE_RADIUS_METRES = 50;
export const MAX_GEOFENCE_RADIUS_METRES = 200_000;

/**
 * How stale the last trusted fix may be before a recovery is treated as
 * TRACKING-without-a-current-position rather than LOCATED.
 *
 * A position is only "current" for as long as a vehicle cannot have driven out
 * of relevance. Past this, the dashboard and the responders should treat the
 * fix as a lead, not a location.
 */
export const TRACK_FRESHNESS_SECONDS = 300;

/**
 * The trailing window the fleet recovery dashboard reports over.
 *
 * Recovery rate and mean-time-to-recover are performance figures, and last
 * quarter's is what says whether the mesh is working now — an all-time average
 * is dominated by history nobody can still act on.
 */
export const RECOVERY_DASHBOARD_WINDOW_DAYS = 90;

/**
 * A soft ceiling on searchers assigned to one recovery.
 *
 * Not a hard limit — a major cash-in-transit recovery legitimately pulls in
 * many units — but past this the coordination cost usually outweighs the extra
 * coverage, and the number is worth surfacing so an operator decides deliberately
 * rather than by accident.
 */
export const SUGGESTED_MAX_SEARCHERS = 12;
