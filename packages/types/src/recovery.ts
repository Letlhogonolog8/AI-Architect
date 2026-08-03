import type { GeoPoint, ISODateString, TenantScoped, UUID } from './common';
import type { IncidentSeverity } from './enums';

/**
 * Recovery Mesh.
 *
 * What the platform does after a vehicle is already gone: coordinate getting it
 * back. A hijacking that reaches `VehicleStatus.STOLEN` opens a recovery case,
 * and the mesh is everything that hangs off it — the track of where the vehicle
 * has been seen, the searchers deployed to find it, the geofences drawn around
 * it, and the aerial support tasked over it.
 *
 * ## Two ideas run through every model here
 *
 * **The track is evidence.** Where a stolen vehicle was seen, and when, and on
 * whose authority, may be produced in a prosecution and an insurance claim. So
 * `RecoveryTrackPoint` and `GeofenceEvent` are append-only, each sighting
 * carries its `source` and a confidence, and nothing overwrites a fix once
 * recorded. A track a reviewer cannot trust the provenance of is not a track.
 *
 * **Aerial support is architecture, not a live capability.** Flying a drone
 * over a moving vehicle in civil airspace is a regulated, BVLOS, airspace-
 * authorised operation, and no such integration ships in this build. `DroneTask`
 * therefore records intent honestly: with no provider registered, a task lands
 * in `UNAVAILABLE`, never a fabricated `LAUNCHED`. This is the same 501-honesty
 * as the AI gateway, the road-graph router, and the emergency channels — the
 * judgement (what to task, where, why) is in reviewable code; the commodity is
 * behind an interface that is not yet filled.
 *
 * See `docs/adr/0013-recovery-mesh.md`.
 */

// ============================================================================
// Recovery case
// ============================================================================

/**
 * The lifecycle of a recovery.
 *
 * Forward-mostly, with `SUSPENDED` the one state a case can return from — a
 * recovery paused overnight for responder safety is not the same as one lost,
 * and collapsing the two would corrupt the recovery-rate statistics the fleet
 * dashboard reports.
 */
export const RecoveryStatus = {
  /** Just opened; the vehicle is confirmed stolen and being worked. */
  OPEN: 'OPEN',
  /** A live track exists — sightings are coming in. */
  TRACKING: 'TRACKING',
  /** A current, trusted position is held. */
  LOCATED: 'LOCATED',
  /** Responders are closing on the vehicle. */
  INTERCEPTING: 'INTERCEPTING',
  /** The vehicle is back. Terminal, and the good outcome. */
  RECOVERED: 'RECOVERED',
  /** The track went cold and the case is given up. Terminal. */
  LOST: 'LOST',
  /** Closed administratively — a duplicate, an error, a write-off. Terminal. */
  CLOSED: 'CLOSED',
  /** Paused. Returns to OPEN or TRACKING when work resumes. */
  SUSPENDED: 'SUSPENDED',
} as const;
export type RecoveryStatus = (typeof RecoveryStatus)[keyof typeof RecoveryStatus];

/** Recovery statuses that still need coordination. */
export const OPEN_RECOVERY_STATUSES: readonly RecoveryStatus[] = [
  RecoveryStatus.OPEN,
  RecoveryStatus.TRACKING,
  RecoveryStatus.LOCATED,
  RecoveryStatus.INTERCEPTING,
  RecoveryStatus.SUSPENDED,
];

/**
 * A recovery operation for one stolen vehicle.
 *
 * The denormalised `lastKnown*` fields hold the most recent trusted fix so the
 * fleet dashboard and map render without scanning the whole track; the
 * authoritative history is the append-only `RecoveryTrackPoint` series.
 */
export interface RecoveryCase extends TenantScoped {
  id: UUID;
  /** Human-quotable reference, e.g. `REC-2026-000042`. Unique per tenant. */
  reference: string;
  vehicleId: UUID;
  /** The theft/hijacking incident this recovery came from, when there is one. */
  incidentId: UUID | null;

  status: RecoveryStatus;
  /** Reuses the incident severity ladder — a cash-in-transit truck outranks a pool car. */
  priority: IncidentSeverity;

  /** Most recent trusted position of the stolen vehicle. */
  lastKnownPosition: GeoPoint | null;
  lastSeenAt: ISODateString | null;

  openedByUserId: UUID | null;
  openedAt: ISODateString;
  recoveredAt: ISODateString | null;
  closedAt: ISODateString | null;
  /** Where it was recovered, when it was. */
  recoveredPosition: GeoPoint | null;
  /** Free-text disposition recorded on closure. */
  outcome: string | null;

  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** A recovery case with the mesh hanging off it, for the case view. */
export interface RecoveryCaseDetail extends RecoveryCase {
  /** Most recent track points, newest first. Bounded — the full track is paginated. */
  track: RecoveryTrackPoint[];
  searchers: SearchAssignment[];
  geofences: Geofence[];
  droneTasks: DroneTask[];
}

// ============================================================================
// Stolen-vehicle tracking
// ============================================================================

/**
 * Where a sighting came from.
 *
 * Load-bearing rather than metadata: a GPS fix from the vehicle's own tracker
 * and a witness phoning in a plate are both useful and are not the same kind of
 * fact, and a responder deciding whether to commit to an intercept must see
 * which they are looking at.
 */
export const TrackSource = {
  /** The vehicle's own GPS/telematics device, when still transmitting. */
  GPS_TRACKER: 'GPS_TRACKER',
  /** An automatic number-plate-recognition camera read. */
  LICENSE_PLATE_CAMERA: 'LICENSE_PLATE_CAMERA',
  /** Cellular network triangulation. Coarse. */
  CELLULAR: 'CELLULAR',
  /** An aerial asset — a drone or helicopter. */
  AERIAL: 'AERIAL',
  /** A human sighting, phoned or radioed in. Least certain. */
  WITNESS: 'WITNESS',
  /** A recovery partner or industry plate-network hit. */
  PARTNER_NETWORK: 'PARTNER_NETWORK',
  /** Entered by an operator from another source. */
  MANUAL: 'MANUAL',
} as const;
export type TrackSource = (typeof TrackSource)[keyof typeof TrackSource];

/**
 * One recorded sighting on a recovery track.
 *
 * Append-only. A fix, once recorded, is never edited or removed — the track is
 * the evidentiary record of where the vehicle was seen, and an editable one is
 * worthless in a claim or a prosecution.
 */
export interface RecoveryTrackPoint extends TenantScoped {
  id: UUID;
  recoveryCaseId: UUID;

  position: GeoPoint;
  heading: number | null;
  speedKph: number | null;
  /** Reported horizontal accuracy in metres, when the source gives one. */
  accuracyMetres: number | null;

  source: TrackSource;
  /** 0-1 confidence this is genuinely the vehicle. A witness plate is not a GPS fix. */
  confidence: number;
  /** Free-text note, e.g. "northbound M1, two occupants". */
  note: string | null;

  recordedAt: ISODateString;
  createdAt: ISODateString;
}

// ============================================================================
// Multi-vehicle search
// ============================================================================

/**
 * The state of one searcher's assignment.
 *
 * `DIVERTED` is distinct from `STOOD_DOWN`: a searcher pulled onto a fresher
 * lead is still working the recovery, one stood down is not, and the dashboard
 * counts of "searchers deployed" must not confuse them.
 */
export const SearchAssignmentStatus = {
  ASSIGNED: 'ASSIGNED',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  SEARCHING: 'SEARCHING',
  DIVERTED: 'DIVERTED',
  STOOD_DOWN: 'STOOD_DOWN',
  COMPLETED: 'COMPLETED',
} as const;
export type SearchAssignmentStatus =
  (typeof SearchAssignmentStatus)[keyof typeof SearchAssignmentStatus];

/** Search assignments still contributing to the effort. */
export const ACTIVE_SEARCH_STATUSES: readonly SearchAssignmentStatus[] = [
  SearchAssignmentStatus.ASSIGNED,
  SearchAssignmentStatus.ACKNOWLEDGED,
  SearchAssignmentStatus.SEARCHING,
  SearchAssignmentStatus.DIVERTED,
];

/**
 * A searcher tasked to a recovery, and the sector it was given.
 *
 * A searcher is either one of the operator's own fleet vehicles (`searcherVehicleId`)
 * or an external unit named in `searcherReference` — the control room coordinates
 * both the same way. The sector is a circle rather than a polygon because
 * PostGIS is deferred with the map; a centre and radius is enough to divide a
 * search area between units without one.
 */
export interface SearchAssignment extends TenantScoped {
  id: UUID;
  recoveryCaseId: UUID;

  /** A fleet vehicle tasked to search, when the searcher is one of ours. */
  searcherVehicleId: UUID | null;
  /** The searcher as named by the operator, e.g. "SAPS Flying Squad 4". */
  searcherReference: string;

  status: SearchAssignmentStatus;

  /** The centre of the sector this searcher was given. */
  sectorCentre: GeoPoint | null;
  sectorRadiusMetres: number | null;

  assignedByUserId: UUID | null;
  assignedAt: ISODateString;
  updatedAt: ISODateString;
  notes: string | null;
}

// ============================================================================
// Geofencing
// ============================================================================

/**
 * What a geofence is for.
 *
 * The kind changes what a crossing *means*, not the geometry. A vehicle leaving
 * a `CONTAINMENT` ring is a car escaping the net; a vehicle entering an
 * `EXCLUSION` zone is a protected asset going somewhere it should not. The
 * `trigger` says which crossings to record; the kind says how to read them.
 */
export const GeofenceKind = {
  /** A ring a stolen vehicle is expected to still be within. Leaving it matters. */
  CONTAINMENT: 'CONTAINMENT',
  /** A no-go area. Entering it matters. */
  EXCLUSION: 'EXCLUSION',
  /** A route corridor a recovery convoy should stay on. */
  CORRIDOR: 'CORRIDOR',
  /** A muster point for searchers. */
  STAGING: 'STAGING',
  /** A plain zone of interest that raises an alert on any crossing. */
  ALERT: 'ALERT',
} as const;
export type GeofenceKind = (typeof GeofenceKind)[keyof typeof GeofenceKind];

/** Which crossings a geofence records. */
export const GeofenceTrigger = {
  ENTER: 'ENTER',
  EXIT: 'EXIT',
  /** Present past a dwell threshold — loitering inside. */
  DWELL: 'DWELL',
  ENTER_EXIT: 'ENTER_EXIT',
} as const;
export type GeofenceTrigger = (typeof GeofenceTrigger)[keyof typeof GeofenceTrigger];

export const GeofenceEventType = {
  ENTER: 'ENTER',
  EXIT: 'EXIT',
  DWELL: 'DWELL',
} as const;
export type GeofenceEventType = (typeof GeofenceEventType)[keyof typeof GeofenceEventType];

/**
 * A circular geofence.
 *
 * Optionally bound to a recovery case (a containment ring drawn around a stolen
 * vehicle's last fix) or standing on its own (a permanent exclusion zone for the
 * whole fleet). PostGIS is deferred, so this is a centre and a radius rather than
 * an arbitrary polygon — deliberately the same shape as `SafeHaven` and the old
 * `ThreatZone`, so the map renders them uniformly when it lands.
 */
export interface Geofence extends TenantScoped {
  id: UUID;
  /** Set when the fence belongs to a specific recovery; null for a fleet-wide one. */
  recoveryCaseId: UUID | null;

  name: string;
  kind: GeofenceKind;
  trigger: GeofenceTrigger;

  centre: GeoPoint;
  radiusMetres: number;

  isActive: boolean;
  /** A recovery ring is transient; a fleet exclusion zone is not. */
  expiresAt: ISODateString | null;

  createdByUserId: UUID | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/**
 * A recorded geofence crossing. Append-only.
 *
 * The evidentiary log behind every "vehicle X left the containment ring at
 * 02:14" the control room ever saw. Never edited, never deleted.
 */
export interface GeofenceEvent extends TenantScoped {
  id: UUID;
  geofenceId: UUID;
  vehicleId: UUID | null;

  type: GeofenceEventType;
  position: GeoPoint;
  occurredAt: ISODateString;
  createdAt: ISODateString;
}

/** The result of evaluating one position against the active geofences. */
export interface GeofenceEvaluation {
  /** Fences the position currently lies inside. */
  inside: UUID[];
  /** Crossings recorded by this evaluation. */
  events: GeofenceEvent[];
}

// ============================================================================
// Drone support (architecture only)
// ============================================================================

/** What a drone is being asked to do. */
export const DroneObjective = {
  /** Find the vehicle from a last-known area. */
  LOCATE: 'LOCATE',
  /** Follow a moving vehicle already located. */
  TRACK: 'TRACK',
  /** Confirm a plate or a description at a fixed point. */
  CONFIRM: 'CONFIRM',
  /** Hold overwatch above responders during an intercept. */
  OVERWATCH: 'OVERWATCH',
  /** Sweep a corridor a vehicle is believed to be travelling. */
  CORRIDOR_SCAN: 'CORRIDOR_SCAN',
} as const;
export type DroneObjective = (typeof DroneObjective)[keyof typeof DroneObjective];

/**
 * The state of a drone tasking.
 *
 * `UNAVAILABLE` is the load-bearing member and the honest default of this whole
 * subsystem: with no drone provider registered — which is every deployment in
 * this build — a task is recorded as intended and unfulfillable, never as a
 * fabricated launch. It is not `FAILED` (a provider that tried and could not);
 * it is "there is nothing here to fly".
 */
export const DroneTaskStatus = {
  REQUESTED: 'REQUESTED',
  /** No drone provider is installed. Recorded, never faked. */
  UNAVAILABLE: 'UNAVAILABLE',
  ACCEPTED: 'ACCEPTED',
  LAUNCHED: 'LAUNCHED',
  ON_STATION: 'ON_STATION',
  RETURNING: 'RETURNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type DroneTaskStatus = (typeof DroneTaskStatus)[keyof typeof DroneTaskStatus];

/**
 * A request for aerial support on a recovery.
 *
 * Architecture, not a live capability — see the file header. The record is real
 * and reviewable; the flight is not, until a provider is registered and the
 * airspace, regulatory and safety questions behind one are answered.
 */
export interface DroneTask extends TenantScoped {
  id: UUID;
  recoveryCaseId: UUID;

  /** The asset as named by the requester, e.g. "SkyGuard-02". */
  droneReference: string;
  objective: DroneObjective;
  status: DroneTaskStatus;

  /** Where it is being sent. */
  target: GeoPoint | null;

  /** The provider that accepted it, when one is installed. Null otherwise. */
  providerId: string | null;
  externalReference: string | null;
  failureReason: string | null;

  requestedByUserId: UUID | null;
  requestedAt: ISODateString;
  updatedAt: ISODateString;
}

/** Whether aerial tasking can actually be fulfilled. Honest health surface. */
export interface DroneSupportStatus {
  /** False in every deployment in this build. */
  configured: boolean;
  providerId: string | null;
  note: string;
}

// ============================================================================
// Fleet recovery dashboard
// ============================================================================

/**
 * The aggregate the Fleet Recovery Dashboard renders.
 *
 * A single cached read the whole control room polls. Recovery rate and mean time
 * to recover are computed over a trailing window rather than all-time, because a
 * fleet's recovery performance last quarter is what tells an operator whether
 * the mesh is working now.
 */
export interface RecoveryDashboard {
  activeCases: number;
  casesByStatus: Array<{ status: RecoveryStatus; count: number }>;

  /** Over the trailing window. */
  windowDays: number;
  recoveredInWindow: number;
  lostInWindow: number;
  /** recovered / (recovered + lost + closed) over the window, 0-1. Null when none closed. */
  recoveryRate: number | null;
  /** Mean OPEN→RECOVERED time over the window, in minutes. Null when none recovered. */
  meanTimeToRecoverMinutes: number | null;

  searchersDeployed: number;
  activeGeofences: number;
  geofenceBreaches24h: number;

  dronesTasked: number;
  dronesAirborne: number;
  /** Whether aerial support is actually available. False in this build. */
  droneSupportConfigured: boolean;

  generatedAt: ISODateString;
}
